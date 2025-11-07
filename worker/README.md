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

- BASE_URL: Backend API base URL (default: http://localhost:5002/api)
- POLL_INTERVAL_SEC: Seconds to wait between polling when no work (default: 5)

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

- Replace the simulated processing with:
  - Download/convert media with ffmpeg
  - Transcribe with faster-whisper
  - Persist segments via backend endpoints/DAO
  - Optional: diarization with pyannote.audio
  
## Simulated transcription logic

Current worker fetches job, downloads the media file via `/api/media/:id/download`, splits content words into faux segments, posts them to `/api/media/:id/segments/bulk`, then marks job complete.

Set `SIMULATE_WORDS_PER_SEG=6` to control how many words per fake segment.