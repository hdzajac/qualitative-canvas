import os
import time
import requests
from dotenv import load_dotenv
from uuid import uuid4
import tempfile
import subprocess

WHISPER_AVAILABLE = False
DIARIZATION_AVAILABLE = False
try:
    from faster_whisper import WhisperModel  # type: ignore
    WHISPER_AVAILABLE = True
except Exception as e:  # pragma: no cover
    print(f"[worker] faster-whisper not available: {e}")
try:  # optional diarization import
    from pyannote.audio import Pipeline  # type: ignore
    DIARIZATION_AVAILABLE = True
except Exception as e:  # pragma: no cover
    print(f"[worker] pyannote.audio not available: {e}")

load_dotenv()

BASE_URL = os.getenv('BASE_URL', 'http://localhost:5002/api')
POLL_INTERVAL_SEC = int(os.getenv('POLL_INTERVAL_SEC', '5'))
WHISPER_MODEL = os.getenv('WHISPER_MODEL', 'small')
WHISPER_DEVICE = os.getenv('WHISPER_DEVICE', 'cpu')  # cpu | cuda
WHISPER_COMPUTE_TYPE = os.getenv('WHISPER_COMPUTE_TYPE', 'int8')  # int8 | float16 | float32
SIMULATE_WHISPER = os.getenv('SIMULATE_WHISPER', '0') == '1'
DIARIZATION_TOKEN = os.getenv('HUGGING_FACE_HUB_TOKEN')

def lease_job():
    url = f"{BASE_URL}/transcribe-jobs/lease"
    resp = requests.post(url, timeout=15)
    if resp.status_code == 204:
        return None
    resp.raise_for_status()
    return resp.json()

def complete_job(job_id):
    url = f"{BASE_URL}/transcribe-jobs/{job_id}/complete"
    resp = requests.post(url, timeout=30)
    resp.raise_for_status()
    return resp.json()

def fetch_media(meta):
    url = f"{BASE_URL}/media/{meta['mediaFileId']}"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    media = r.json()
    content_url = f"{BASE_URL}/media/{media['id']}/download"
    data = requests.get(content_url, timeout=60)
    data.raise_for_status()
    return media, data.content.decode(errors='ignore')

def build_fake_segments(text):
    words = text.strip().split()
    chunk_size = int(os.getenv('SIMULATE_WORDS_PER_SEG', '8'))
    segs = []
    idx = 0
    cursor_ms = 0
    per_word_ms = 320  # crude pacing
    while idx < len(words):
        chunk = words[idx: idx + chunk_size]
        start_ms = cursor_ms
        end_ms = start_ms + len(chunk) * per_word_ms
        segs.append({
            'id': str(uuid4()),
            'idx': len(segs),
            'startMs': start_ms,
            'endMs': end_ms,
            'text': ' '.join(chunk)
        })
        cursor_ms = end_ms + 120
        idx += chunk_size
    return segs

def post_segments(media_id, segments):
    url = f"{BASE_URL}/media/{media_id}/segments/bulk"
    payload = { 'segments': segments }
    r = requests.post(url, json=payload, timeout=60)
    r.raise_for_status()
    return r.json()

def main():
    print(f"Worker starting. Backend: {BASE_URL}")
    while True:
        try:
            job = lease_job()
            if not job:
                time.sleep(POLL_INTERVAL_SEC)
                continue
            print(f"Leased job {job['id']} for media {job['mediaFileId']}")
            media, content = fetch_media(job)
            print(f"Downloaded media {media['originalFilename']} size={len(content)} bytes")
            if WHISPER_AVAILABLE and not SIMULATE_WHISPER:
                try:
                    segments = transcribe_real(media, content)
                except Exception as e:
                    print(f"Transcription error, falling back to fake segments: {e}")
                    segments = build_fake_segments(content or 'Fallback simulated transcription.')
            else:
                segments = build_fake_segments(content or 'Simulated transcription content.')
            posted = post_segments(media['id'], segments)
            print(f"Inserted {posted['count']} segments (mode={'real' if WHISPER_AVAILABLE and not SIMULATE_WHISPER else 'sim'})")
            # diarization pass
            if DIARIZATION_AVAILABLE and DIARIZATION_TOKEN and not SIMULATE_WHISPER:
                try:
                    run_diarization(media)
                except Exception as e:
                    print(f"Diarization error: {e}")
            done = complete_job(job['id'])
            print(f"Marked job {done['id']} complete")
        except requests.RequestException as e:
            print(f"Network error: {e}")
            time.sleep(POLL_INTERVAL_SEC)
        except Exception as e:
            print(f"Unexpected error: {e}")
            time.sleep(POLL_INTERVAL_SEC)
def transcribe_real(media, text_content):
    """Run faster-whisper on the media file path; we re-download binary via /download endpoint again to file."""
    # Re-fetch binary (content may have been decoded earlier, but we need bytes for audio)
    audio_bytes = requests.get(f"{BASE_URL}/media/{media['id']}/download", timeout=120).content
    with tempfile.NamedTemporaryFile(suffix='.bin', delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp.flush()
        src_path = tmp.name
    # Convert to wav with ffmpeg (ensure ffmpeg present in worker image)
    wav_path = src_path + '.wav'
    try:
        subprocess.run(['ffmpeg', '-y', '-i', src_path, '-ar', '16000', '-ac', '1', wav_path], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except Exception as e:
        print(f"ffmpeg conversion failed: {e}")
        return build_fake_segments(text_content)
    model = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE_TYPE)
    segments_iter, _info = model.transcribe(wav_path, beam_size=1, language=None)
    segs = []
    for i, seg in enumerate(segments_iter):
        segs.append({
            'id': str(uuid4()),
            'idx': i,
            'startMs': int(seg.start * 1000),
            'endMs': int(seg.end * 1000),
            'text': seg.text.strip(),
        })
    if not segs:
        return build_fake_segments(text_content)
    return segs

def run_diarization(media):  # pragma: no cover - heavy
    if not (DIARIZATION_AVAILABLE and DIARIZATION_TOKEN):
        return
    pipeline = Pipeline.from_pretrained('pyannote/speaker-diarization', use_auth_token=DIARIZATION_TOKEN)
    audio_bytes = requests.get(f"{BASE_URL}/media/{media['id']}/download", timeout=120).content
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp.flush()
        tmp_path = tmp.name
    diar = pipeline(tmp_path)
    # Placeholder: future step will map diarization speakers to participants and update segments
    print(f"Diarization completed: {len(list(diar.itertracks(yield_label=True)))} speaker turns")

if __name__ == '__main__':
    main()
