## Docker

```bash
docker build -t qc-worker .
# Adjust BASE_URL to point to your backend
docker run --rm -e BASE_URL=http://host.docker.internal:5002/api qc-worker
```

### docker-compose integration

The root `docker-compose.yml` includes a `worker` service that talks to `backend` over the internal network:

```yaml
worker:
  build: ./worker
  environment:
    - BASE_URL=http://backend:5000/api
    - POLL_INTERVAL_SEC=3
  volumes:
    - worker_models:/root/.cache
```

Bring everything up (frontend + backend + db + worker):

```bash
docker compose up --build
```

Tail worker logs:

```bash
docker compose logs -f worker
```
# Transcription Worker (skeleton)

This is a minimal Python worker that polls the backend for transcription jobs and marks them complete. It's a scaffold to plug in faster-whisper and diarization later.

## Configuration

Environment variables:
Core:
- BASE_URL: Backend API base URL (default: http://backend:5000/api inside compose, or host backend fallback)
- BASE_URLS / WORKER_BASE_URLS: Comma-separated list of backend base URLs to round-robin/try.
- POLL_INTERVAL_SEC: Seconds to wait between polls when no work (default: 5)
- WORKER_AUTO_FALLBACK: If '1', failed health check swaps to host.docker.internal:<LOCAL_BACKEND_PORT>/api.
- LOCAL_BACKEND_PORT: Port of backend on host for fallback (default 5002).

Whisper:
- SIMULATE_WHISPER: '1' = skip model and generate fake segments; '0' = run real model if installed.
- WHISPER_MODEL: Model name (tiny, base, small, medium, large-v3, etc.). Default 'small'.
- WHISPER_DEVICE: cpu | cuda (default cpu).
- WHISPER_COMPUTE_TYPE: int8 | float16 | float32 (int8 for CPU speed/memory).
- WHISPER_BEAM_SIZE: Beam size (default 1; increase for slight quality gain, slower).
- CHUNK_SECONDS: If > 0, split audio into fixed-length chunks before transcription (default 0 = disabled).

Diarization (optional):
- HUGGING_FACE_HUB_TOKEN: Required if using pyannote.audio pipeline.

Other simulation tuning:
- SIMULATE_WORDS_PER_SEG: Words per fake segment (default 8).

## Run locally

```bash
pip install -r requirements.txt
python main.py
```

## Docker

```bash
docker build -t qc-worker .
# Adjust BASE_URL to point to your backend
docker run --rm -e BASE_URL=http://host.docker.internal:5002/api qc-worker
```

## Next steps

- Production hardening ideas:
  - Partial/streaming segment posting
  - Diarization participant auto-mapping
  - Retry / exponential backoff on transient network failures
  - Metrics export (timings, queue depth)
  
## Simulated transcription logic

Current worker fetches job, downloads the media file via `/api/media/:id/download`, splits content words into faux segments, posts them to `/api/media/:id/segments/bulk`, then marks job complete.

Set `SIMULATE_WORDS_PER_SEG=6` to control how many words per fake segment.