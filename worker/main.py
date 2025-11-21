import os
import time
import traceback
import requests
from dotenv import load_dotenv
from uuid import uuid4
import tempfile
import subprocess
from typing import Optional

WHISPER_AVAILABLE = False
DIARIZATION_AVAILABLE = False
try:
    from faster_whisper import WhisperModel  # type: ignore
    WHISPER_AVAILABLE = True
except Exception as e:  # pragma: no cover
    print(f"[worker] faster-whisper not available: {e}")
try:  # optional diarization import
    from pyannote.audio import Pipeline  # type: ignore
    # Optional hub login for private models
    try:
        from huggingface_hub import login, HfFolder  # type: ignore
    except Exception:
        login = None
        HfFolder = None
    DIARIZATION_AVAILABLE = True
except Exception as e:  # pragma: no cover
    print(f"[worker] pyannote.audio not available: {e}")

load_dotenv()

# Base configuration (can be auto-adjusted below)
# Support multiple backends: provide comma-separated BASE_URLS or WORKER_BASE_URLS.
BASE_URL = os.getenv('BASE_URL', 'http://backend:5000/api')
RAW_BASE_URLS = os.getenv('BASE_URLS') or os.getenv('WORKER_BASE_URLS')
POLL_INTERVAL_SEC = int(os.getenv('POLL_INTERVAL_SEC', '5'))
WHISPER_MODEL = os.getenv('WHISPER_MODEL', 'small')
WHISPER_DEVICE = os.getenv('WHISPER_DEVICE', 'cpu')  # cpu | cuda
WHISPER_COMPUTE_TYPE = os.getenv('WHISPER_COMPUTE_TYPE', 'int8')  # int8 | float16 | float32
WHISPER_BEAM_SIZE = int(os.getenv('WHISPER_BEAM_SIZE', '1'))
# Explicitly force simulation off unless explicitly set to '1' AND allow override via FORCE_SIM=1 for dev testing
_sim_env = os.getenv('SIMULATE_WHISPER', '0')
SIMULATE_WHISPER = (_sim_env == '1') and (os.getenv('FORCE_REAL_WHISPER', '0') != '1')
DIARIZATION_TOKEN = os.getenv('HUGGING_FACE_HUB_TOKEN')
DIARIZATION_MODEL = os.getenv('DIARIZATION_MODEL', 'pyannote/speaker-diarization-3.1')
DIARIZATION_MAX_SECONDS = int(os.getenv('DIARIZATION_MAX_SECONDS', '0'))  # 0 disables truncation
AUTO_FALLBACK = os.getenv('WORKER_AUTO_FALLBACK', '1') == '1'
LOCAL_BACKEND_PORT = os.getenv('LOCAL_BACKEND_PORT', '5002')
CHUNK_SECONDS = int(os.getenv('CHUNK_SECONDS', '0'))  # 0 disables chunking
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()
AUTO_DIARIZATION_ASSIGN = os.getenv('AUTO_DIARIZATION_ASSIGN', '0') == '1'

_LEVELS = {'DEBUG': 10, 'INFO': 20, 'WARN': 30, 'ERROR': 40}
_LV = _LEVELS.get(LOG_LEVEL, 20)

def _log(level: str, msg: str):
    lvl = _LEVELS.get(level, 20)
    if lvl >= _LV:
        print(f"[worker][{level}] {msg}")

def log_debug(msg: str):
    _log('DEBUG', msg)

def log_info(msg: str):
    _log('INFO', msg)

def log_warn(msg: str):
    _log('WARN', msg)

def log_error(msg: str):
    _log('ERROR', msg)

def resolve_base_url(original: str) -> str:
    """Attempt a quick health check; if unreachable and AUTO_FALLBACK enabled, try host.docker.internal using LOCAL_BACKEND_PORT."""
    # If original already points to host.docker.internal just return
    if 'host.docker.internal' in original:
        return original
    if not AUTO_FALLBACK:
        return original
    fallback = f"http://host.docker.internal:{LOCAL_BACKEND_PORT}/api"
    
    # Try original URL with very short timeout to catch DNS errors quickly
    original_reachable = False
    try:
        r = requests.get(f"{original.rstrip('/')}/health", timeout=0.5)
        if r.ok:
            original_reachable = True
    except Exception as e:
        # DNS errors (like 'backend' not found) will be caught here
        log_debug(f"Original URL {original} not reachable: {type(e).__name__}")
    
    if original_reachable:
        return original
    
    # Original failed, try fallback
    try:
        r2 = requests.get(f"{fallback.rstrip('/')}/health", timeout=1.0)
        if r2.ok:
            log_info(f"Auto-fallback: using {fallback} instead of {original}")
            return fallback
    except Exception as e:
        log_debug(f"Fallback URL {fallback} not reachable: {type(e).__name__}")
    
    # Both failed - prefer fallback for local development scenario
    log_warn(f"Neither {original} nor {fallback} reachable during startup; using fallback {fallback}")
    return fallback

def build_base_list():
    if RAW_BASE_URLS:
        urls = [u.strip() for u in RAW_BASE_URLS.split(',') if u.strip()]
        if not urls:
            urls = [BASE_URL]
    else:
        urls = [BASE_URL]
    # Resolve each with fallback logic
    return [resolve_base_url(u) for u in urls]

BASE_URLS = build_base_list()

def lease_job(base_url: str):
    url = f"{base_url}/transcribe-jobs/lease"
    t0 = time.perf_counter()
    resp = requests.post(url, timeout=15)
    dur = int((time.perf_counter() - t0) * 1000)
    if resp.status_code == 204:
        log_debug(f"LEASE 204 in {dur}ms url={url}")
        return None
    if not resp.ok:
        log_error(f"LEASE {resp.status_code} in {dur}ms url={url} body={resp.text[:400]}")
    resp.raise_for_status()
    log_debug(f"LEASE {resp.status_code} in {dur}ms url={url}")
    return resp.json()

def complete_job(base_url: str, job_id):
    url = f"{base_url}/transcribe-jobs/{job_id}/complete"
    t0 = time.perf_counter()
    resp = requests.post(url, timeout=30)
    dur = int((time.perf_counter() - t0) * 1000)
    if not resp.ok:
        log_error(f"COMPLETE {resp.status_code} in {dur}ms url={url} body={resp.text[:400]}")
    resp.raise_for_status()
    log_debug(f"COMPLETE {resp.status_code} in {dur}ms url={url}")
    return resp.json()

def fail_job(base_url: str, job_id, message: str):
    url = f"{base_url}/transcribe-jobs/{job_id}/error"
    t0 = time.perf_counter()
    resp = requests.post(url, json={"errorMessage": message[:500]}, timeout=30)
    dur = int((time.perf_counter() - t0) * 1000)
    if not resp.ok:
        log_error(f"ERROR {resp.status_code} in {dur}ms url={url} body={resp.text[:400]}")
    resp.raise_for_status()
    log_debug(f"ERROR {resp.status_code} in {dur}ms url={url}")
    return resp.json()

def patch_progress(base_url: str, job_id, processed_ms=None, total_ms=None, eta_seconds=None):
    url = f"{base_url}/transcribe-jobs/{job_id}/progress"
    payload = {}
    if processed_ms is not None:
        payload['processedMs'] = int(processed_ms)
    if total_ms is not None:
        payload['totalMs'] = int(total_ms)
    if eta_seconds is not None:
        payload['etaSeconds'] = int(eta_seconds)
    if not payload:
        return None
    try:
        t0 = time.perf_counter()
        r = requests.patch(url, json=payload, timeout=10)
        dur = int((time.perf_counter() - t0) * 1000)
        if not r.ok:
            log_warn(f"PROGRESS {r.status_code} in {dur}ms url={url} body={r.text[:200]}")
        r.raise_for_status()
        log_debug(f"PROGRESS {r.status_code} in {dur}ms url={url} payload={payload}")
        return r.json()
    except Exception as e:
        log_warn(f"progress patch failed: {e}")
        return None

def fetch_media(base_url: str, meta):
    url = f"{base_url}/media/{meta['mediaFileId']}"
    t0 = time.perf_counter()
    r = requests.get(url, timeout=30)
    dur = int((time.perf_counter() - t0) * 1000)
    r.raise_for_status()
    media = r.json()
    content_url = f"{base_url}/media/{media['id']}/download"
    t1 = time.perf_counter()
    data = requests.get(content_url, timeout=60)
    dur2 = int((time.perf_counter() - t1) * 1000)
    data.raise_for_status()
    log_debug(f"FETCH media {media['id']} meta={r.status_code} {dur}ms download={data.status_code} {dur2}ms bytes={len(data.content)}")
    # Only decode textual files; keep binary audio/video as bytes so simulation prefers placeholder path.
    name = (media.get('originalFilename') or '').lower()
    if name.endswith(('.txt', '.md', '.json', '.vtt', '.srt')):
        try:
            return media, data.content.decode('utf-8', errors='ignore')
        except Exception:
            return media, data.content.decode(errors='ignore')
    return media, data.content  # bytes

def build_fake_segments(text):
    """Generate simulated segments from a text blob (used only for textual sources).
    Caps total segments to 500 to avoid overloading backend during simulation.
    """
    words = [w for w in text.strip().split() if w]
    chunk_size = max(1, int(os.getenv('SIMULATE_WORDS_PER_SEG', '8')))
    max_segments = 500
    segs = []
    cursor_ms = 0
    per_word_ms = 320  # crude pacing
    for i in range(0, len(words), chunk_size):
        if len(segs) >= max_segments:
            break
        chunk = words[i:i+chunk_size]
        start_ms = cursor_ms
        end_ms = start_ms + len(chunk) * per_word_ms
        segs.append({
            'id': str(uuid4()),
            'idx': len(segs),
            'startMs': start_ms,
            'endMs': end_ms,
            'text': ' '.join(chunk)[:500] or '…'
        })
        cursor_ms = end_ms + 120
    return segs

def build_placeholder_segments(media, file_size_bytes: int, target_segments: int = 12):
    """Return a small set of placeholder segments for binary audio/video during simulation.
    We approximate duration if media.durationSec present; otherwise derive from size.
    """
    duration_ms = None
    if media.get('durationSec'):
        try:
            duration_ms = int(media['durationSec']) * 1000
        except Exception:
            duration_ms = None
    if duration_ms is None:
        # crude heuristic: assume ~32 kB per second compressed
        duration_ms = int((file_size_bytes / 32000.0) * 1000)
        duration_ms = max(duration_ms, target_segments * 1000)
    seg_length = duration_ms // target_segments
    segs = []
    for i in range(target_segments):
        start = i * seg_length
        end = start + seg_length - 200
        segs.append({
            'id': str(uuid4()),
            'idx': i,
            'startMs': start,
            'endMs': end,
            'text': f"Simulated segment {i+1}" if i < target_segments-1 else 'Simulated segment final'
        })
    return segs

def post_segments(base_url: str, media_id, segments):
    url = f"{base_url}/media/{media_id}/segments/bulk"
    payload = { 'segments': segments }
    t0 = time.perf_counter()
    r = requests.post(url, json=payload, timeout=60)
    dur = int((time.perf_counter() - t0) * 1000)
    if not r.ok:
        # Log first segment as sample to help diagnose shape issues
        sample = segments[0] if segments else {}
        log_error(f"SEGMENTS {r.status_code} in {dur}ms url={url} count={len(segments)} sample={str(sample)[:300]} body={r.text[:400]}")
    r.raise_for_status()
    log_info(f"SEGMENTS {r.status_code} in {dur}ms url={url} count={len(segments)}")
    return r.json()

def post_segments_with_retry(base_url: str, media_id, segments, attempts=3, initial_delay=2):
    delay = initial_delay
    for attempt in range(1, attempts + 1):
        try:
            return post_segments(base_url, media_id, segments)
        except Exception as e:
            log_warn(f"bulk insert attempt {attempt} failed: {e}")
            if attempt == attempts:
                return None
            time.sleep(delay)
            delay *= 2

def main():
    log_info(f"Worker starting. Backends: {', '.join(BASE_URLS)} | LOG_LEVEL={LOG_LEVEL}")
    log_info(
        "Flags: "
        f"SIMULATE_WHISPER={'1' if SIMULATE_WHISPER else '0'}, "
        f"DIARIZATION_AVAILABLE={'1' if DIARIZATION_AVAILABLE else '0'}, "
        f"TOKEN={'present' if bool(DIARIZATION_TOKEN) else 'absent'}, "
        f"AUTO_DIARIZATION_ASSIGN={'1' if AUTO_DIARIZATION_ASSIGN else '0'}"
    )
    while True:
        try:
            leased = None
            leased_base = None
            for base in BASE_URLS:
                try:
                    job = lease_job(base)
                    if job:
                        leased = job
                        leased_base = base
                        break
                except requests.RequestException as e:
                    log_warn(f"Lease poll error for {base}: {e}")
                    continue
            if not leased:
                time.sleep(POLL_INTERVAL_SEC)
                continue
            job = leased
            base = leased_base or BASE_URLS[0]
            cid = job['id'][-6:]
            log_info(f"Lease job id={job['id']} media={job['mediaFileId']} base={base} cid={cid}")
            media, content = fetch_media(base, job)
            log_info(f"Downloaded media {media.get('originalFilename')} size={len(content)} bytes cid={cid}")
            # Establish total duration for ETA if available
            total_ms = None
            if media.get('durationSec'):
                try:
                    total_ms = int(media['durationSec']) * 1000
                except Exception:
                    total_ms = None
            if WHISPER_AVAILABLE and not SIMULATE_WHISPER:
                try:
                    segments = transcribe_real(base, media, content, job, total_ms)
                except Exception as e:
                    log_error(f"Transcription error, falling back to fake segments: {e}\n{traceback.format_exc()}")
                    segments = build_fake_segments(content or 'Fallback simulated transcription.')
            else:
                # Simulation path. If original filename looks like binary media (non text extension), build placeholder.
                name = (media.get('originalFilename') or '').lower()
                if not isinstance(content, str):
                    # Binary content path (audio/video)
                    segments = build_placeholder_segments(media, len(content))
                elif not name.endswith(('.txt', '.md', '.json', '.vtt', '.srt')):
                    segments = build_placeholder_segments(media, len(content.encode('utf-8','ignore')))
                else:
                    segments = build_fake_segments(content or 'Simulated transcription content.')
            posted = post_segments_with_retry(base, media['id'], segments)
            if not posted:
                log_error("bulk insert failed after retries; marking job error")
                try:
                    fail_job(base, job['id'], 'Bulk segment insert failed after retries')
                except Exception as e:
                    log_warn(f"fail_job call failed: {e}")
                continue  # move to next lease
            log_info(f"Inserted {posted['count']} segments (mode={'real' if WHISPER_AVAILABLE and not SIMULATE_WHISPER else 'sim'}) cid={cid}")
            # diarization pass (runs when available; uses pre-cached model in offline mode)
            if DIARIZATION_AVAILABLE:
                try:
                    run_diarization(base, media)
                except Exception as e:
                    log_warn(f"Diarization error: {e}")
            done = complete_job(base, job['id'])
            log_info(f"Marked job {done['id']} complete cid={cid}")
        except requests.RequestException as e:
            log_warn(f"Network error: {e}")
            time.sleep(POLL_INTERVAL_SEC)
        except Exception as e:
            log_error(f"Unexpected error: {e}\n{traceback.format_exc()}")
            time.sleep(POLL_INTERVAL_SEC)
def transcribe_real(base_url: str, media, text_content, job, total_ms_hint=None):
    """Run faster-whisper on the media (with optional chunking) and return segments.
    Honors job.model and job.languageHint when provided.
    """
    # Re-fetch binary (content may have been decoded earlier, but we need bytes for audio)
    audio_bytes = requests.get(f"{base_url}/media/{media['id']}/download", timeout=120).content
    with tempfile.NamedTemporaryFile(suffix='.bin', delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp.flush()
        src_path = tmp.name
    # Prepare model
    selected_model = (job.get('model') or WHISPER_MODEL)
    language_hint = (job.get('languageHint') or None)
    try:
        model = WhisperModel(selected_model, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE_TYPE)
    except Exception as e:
        print(f"Whisper model load failed ({selected_model}): {e}")
        return build_fake_segments(text_content)

    segs = []
    # Progress/ETA helpers
    # If no reliable duration, assume 1 hour max for conservative ETA base
    total_ms = int(total_ms_hint) if total_ms_hint else None
    try:
        rtf = float(os.getenv('TRANSCRIPTION_RTF', '0.5'))
        if rtf <= 0:
            rtf = 0.5
    except Exception:
        rtf = 0.5
    def estimate_eta(proc_ms, tot_ms):
        if not tot_ms:
            return None
        remaining_ms = max(0, tot_ms - proc_ms)
        secs = int(remaining_ms / max(1, int(1000 * rtf)))
        return max(1, secs)
    # If no chunking requested, convert once and transcribe whole
    if CHUNK_SECONDS <= 0:
        wav_path = src_path + '.wav'
        try:
            subprocess.run(['ffmpeg', '-y', '-i', src_path, '-ar', '16000', '-ac', '1', wav_path], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except Exception as e:
            print(f"ffmpeg conversion failed: {e}")
            return build_fake_segments(text_content)
        # Stream through segments to update progress occasionally (approximate via end times)
        segments_iter, _info = model.transcribe(wav_path, beam_size=WHISPER_BEAM_SIZE, language=language_hint)
        for i, seg in enumerate(segments_iter):
            segs.append({
                'id': str(uuid4()),
                'idx': i,
                'startMs': int(seg.start * 1000),
                'endMs': int(seg.end * 1000),
                'text': seg.text.strip(),
            })
            # Patch progress every N segments
            if i % 10 == 0:
                processed = segs[-1]['endMs']
                eta = estimate_eta(processed, total_ms)
                try:
                    patch_progress(base_url, job['id'], processed_ms=processed, total_ms=total_ms, eta_seconds=eta)
                except Exception:
                    pass
        return segs if segs else build_fake_segments(text_content)

    # Chunking path
    # Create temp dir for chunks
    with tempfile.TemporaryDirectory() as td:
        # Segment audio into CHUNK_SECONDS with resampling/mono
        # chunk_%05d.wav will be created; duration of last chunk may be shorter
        try:
            subprocess.run([
                'ffmpeg', '-y', '-i', src_path,
                '-ar', '16000', '-ac', '1',
                '-f', 'segment', '-segment_time', str(CHUNK_SECONDS),
                os.path.join(td, 'chunk_%05d.wav')
            ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except Exception as e:
            print(f"ffmpeg chunking failed: {e}")
            return build_fake_segments(text_content)
        # Transcribe each chunk and offset times
        idx_counter = 0
        chunk_index = 0
        while True:
            chunk_path = os.path.join(td, f"chunk_{chunk_index:05d}.wav")
            if not os.path.exists(chunk_path):
                break
            try:
                segments_iter, _info = model.transcribe(chunk_path, beam_size=WHISPER_BEAM_SIZE, language=language_hint)
                offset_ms = chunk_index * CHUNK_SECONDS * 1000
                for seg in segments_iter:
                    segs.append({
                        'id': str(uuid4()),
                        'idx': idx_counter,
                        'startMs': int(seg.start * 1000) + offset_ms,
                        'endMs': int(seg.end * 1000) + offset_ms,
                        'text': seg.text.strip(),
                    })
                    idx_counter += 1
                # After each chunk, patch progress
                processed = min(total_ms or (offset_ms + CHUNK_SECONDS * 1000), offset_ms + CHUNK_SECONDS * 1000)
                eta = estimate_eta(processed, total_ms)
                try:
                    patch_progress(base_url, job['id'], processed_ms=processed, total_ms=total_ms, eta_seconds=eta)
                except Exception:
                    pass
            except Exception as e:
                print(f"Transcribe chunk {chunk_index} failed: {e}")
            chunk_index += 1
    return segs if segs else build_fake_segments(text_content)

def run_diarization(base_url: str, media):  # pragma: no cover - heavy
    if not DIARIZATION_AVAILABLE:
        return
    
    # Load diarization model
    # - GitHub builds: HF_HUB_OFFLINE=1, model pre-cached, no token needed at runtime
    # - Local builds: No offline flag, downloads with token from .env on first use
    log_info(f"Loading diarization model: {DIARIZATION_MODEL}")
    
    import os
    offline_mode = os.environ.get('HF_HUB_OFFLINE') == '1'
    
    pipeline = None
    try:
        if offline_mode:
            # Production: Load from cache without token (model pre-cached during build)
            log_info("Offline mode: loading model from cache (no token needed)")
            pipeline = Pipeline.from_pretrained(DIARIZATION_MODEL, use_auth_token=False)
        else:
            # Local dev: Use token to load/download
            if not DIARIZATION_TOKEN:
                log_error("No HF token available - cannot load diarization model. Set HUGGING_FACE_HUB_TOKEN environment variable.")
                return
            log_info("Online mode: loading model with token (will download if not cached)")
            pipeline = Pipeline.from_pretrained(DIARIZATION_MODEL, use_auth_token=DIARIZATION_TOKEN)
        
        log_info("Diarization model loaded successfully")
    except Exception as load_err:
        error_msg = str(load_err)
        if 'gated' in error_msg.lower() or 'accept' in error_msg.lower():
            log_error(f"Diarization model is GATED. You must:")
            log_error(f"1. Visit https://hf.co/{DIARIZATION_MODEL}")
            log_error(f"2. Accept the user conditions")
            log_error(f"3. Try transcription again")
        else:
            log_error(f"Failed to load diarization model: {load_err}")
        return
    
    if pipeline is None or not callable(getattr(pipeline, '__call__', None)):
        log_error("Diarization pipeline is invalid or not callable")
        return
    audio_bytes = requests.get(f"{base_url}/media/{media['id']}/download", timeout=120).content
    # Write original bytes then transcode to 16k mono WAV to ensure readable format
    src_path = None
    wav_path = None
    final_wav_path: Optional[str] = None
    try:
        with tempfile.NamedTemporaryFile(suffix='.bin', delete=False) as src:
            src.write(audio_bytes)
            src.flush()
            src_path = src.name
        wav_path = src_path + '.wav'
        try:
            subprocess.run(['ffmpeg', '-y', '-i', src_path, '-ar', '16000', '-ac', '1', wav_path], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except Exception as e:
            log_warn(f"ffmpeg conversion for diarization failed: {e}")
            return
        # Optionally truncate overly long audio for faster diarization on CPU
        final_wav_path = wav_path
        duration_sec = None
        try:
            import soundfile as sf  # type: ignore
            info = sf.info(wav_path)
            if info.samplerate and info.frames:
                duration_sec = int(info.frames / info.samplerate)
        except Exception:
            duration_sec = None
        if DIARIZATION_MAX_SECONDS and duration_sec and duration_sec > DIARIZATION_MAX_SECONDS:
            capped_path = wav_path.replace('.wav', f'.cap{DIARIZATION_MAX_SECONDS}.wav')
            try:
                subprocess.run(['ffmpeg', '-y', '-i', wav_path, '-t', str(DIARIZATION_MAX_SECONDS), capped_path], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                final_wav_path = capped_path
                log_info(f"Diarization: truncated audio from {duration_sec}s to {DIARIZATION_MAX_SECONDS}s")
            except Exception as e:
                log_warn(f"ffmpeg truncate failed (continuing with full length): {e}")
        if duration_sec:
            log_info(f"Diarization: audio duration ~{duration_sec}s, starting inference…")
        else:
            log_info("Diarization: starting inference…")
        t0 = time.perf_counter()
        diar = pipeline(final_wav_path or wav_path)
        t_ms = int((time.perf_counter() - t0) * 1000)
        log_info(f"Diarization inference done in {t_ms}ms")
    finally:
        # Best-effort cleanup
        try:
            if src_path and os.path.exists(src_path):
                os.remove(src_path)
        except Exception:
            pass
        try:
            if wav_path and os.path.exists(wav_path):
                os.remove(wav_path)
        except Exception:
            pass
        try:
            if final_wav_path and final_wav_path != wav_path and os.path.exists(final_wav_path):
                os.remove(final_wav_path)
        except Exception:
            pass
    # Placeholder: future step will map diarization speakers to participants and update segments
    turns = list(diar.itertracks(yield_label=True))
    print(f"Diarization completed: {len(turns)} speaker turns")
    if not AUTO_DIARIZATION_ASSIGN:
        return
    try:
        # Fetch existing participants
        r = requests.get(f"{base_url}/media/{media['id']}/participants", timeout=20)
        r.raise_for_status()
        participants = r.json() or []
        # Determine first-seen order of labels for stable numbering
        first_seen = {}
        ordered_labels = []
        for (_seg, _track, label) in turns:
            if label not in first_seen:
                first_seen[label] = len(ordered_labels)
                ordered_labels.append(label)
        # Map labels to participant IDs; create if missing, name as "Participant N" but keep canonicalKey=original label
        label_to_part = {}
        for label in ordered_labels:
            # Prefer existing by canonicalKey; if renamed by user, keep their name
            existing = next((p for p in participants if p.get('canonicalKey') == label), None)
            if not existing:
                display_index = (first_seen.get(label, len(label_to_part)) or 0) + 1
                display_name = f"Participant {display_index}"
                cr = requests.post(
                    f"{base_url}/media/{media['id']}/participants",
                    json={"name": display_name, "canonicalKey": label},
                    timeout=20,
                )
                cr.raise_for_status()
                existing = cr.json()
                participants.append(existing)
            label_to_part[label] = existing['id']
        # Assign by each diarized segment (turn)
        for (segment, _track, label) in turns:
            pid = label_to_part.get(label)
            if not pid:
                continue
            start_ms = int(segment.start * 1000)
            end_ms = int(segment.end * 1000)
            try:
                ar = requests.post(
                    f"{base_url}/media/{media['id']}/segments/assign-participant",
                    json={"participantId": pid, "startMs": start_ms, "endMs": end_ms},
                    timeout=30,
                )
                if not ar.ok:
                    log_warn(f"assign-participant {ar.status_code} body={ar.text[:200]}")
            except Exception as e:
                log_warn(f"assign-participant error: {e}")
        print(f"Auto-assigned diarization labels to segments for media {media['id']}")

        # Fill any remaining unassigned segments by nearest diarization turn label
        try:
            seg_r = requests.get(f"{base_url}/media/{media['id']}/segments", timeout=30)
            seg_r.raise_for_status()
            seg_list = seg_r.json() or []
            unassigned = [s for s in seg_list if not s.get('participantId')]
            if unassigned and turns:
                # Pre-compute centers for diarization turns
                turn_data = []  # list of tuples: (center_ms, label)
                for (segment, _track, label) in turns:
                    center_ms = int(((segment.start + segment.end) * 1000) / 2)
                    turn_data.append((center_ms, label))
                # Assign each unassigned segment to nearest turn center
                assign_map = {}  # pid -> list of segmentIds
                for s in unassigned:
                    mid = int(((s.get('startMs') or 0) + (s.get('endMs') or 0)) / 2)
                    # Find nearest turn
                    best = None
                    best_d = None
                    for (c_ms, lab) in turn_data:
                        d = abs(c_ms - mid)
                        if best_d is None or d < best_d:
                            best_d = d
                            best = lab
                    if best is None:
                        continue
                    pid = label_to_part.get(best)
                    if not pid:
                        continue
                    assign_map.setdefault(pid, []).append(s['id'])
                # Batch-assign by segmentIds per participant
                for pid, seg_ids in assign_map.items():
                    if not seg_ids:
                        continue
                    try:
                        br = requests.post(
                            f"{base_url}/media/{media['id']}/segments/assign-participant",
                            json={"participantId": pid, "segmentIds": seg_ids},
                            timeout=60,
                        )
                        if not br.ok:
                            log_warn(f"assign-participant fill {br.status_code} body={br.text[:200]}")
                    except Exception as e:
                        log_warn(f"assign-participant fill error: {e}")
                print(f"Filled {sum(len(v) for v in assign_map.values())} previously unassigned segments by nearest speaker for media {media['id']}")
        except Exception as e:
            log_warn(f"post-assign fill failed: {e}")
    except Exception as e:
        log_warn(f"Diarization auto-assign failed: {e}")

if __name__ == '__main__':
    main()
