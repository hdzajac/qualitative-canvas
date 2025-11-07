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