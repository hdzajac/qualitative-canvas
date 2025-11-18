# Prebuilt Docker Images Strategy

To let users run the stack without building images or crafting a local `.env`, we provide a secondary compose file (`docker-compose.images.yml`) referencing prebuilt container images published to GHCR.

## Goals
- Zero local build time; just pull and run.
- Minimal required environment variables baked into images with safe defaults.
- Preserve ability to build locally (original `docker-compose.yml`).
- Avoid leaking secrets: we include only non-sensitive defaults; tokens (like `HUGGING_FACE_HUB_TOKEN`) remain optional env overrides.

## Files Added
- `docker-compose.images.yml`: Overrides build contexts with `image:` refs.
- `scripts/pull-images.sh`: Helper script to pull all needed images.
- This document (`IMAGES.md`): Explains usage and publishing workflow.

## Usage

**IMPORTANT**: Pre-built images do NOT contain secrets. You must provide environment variables via a `.env` file.

### Setup

1. **Create `.env` file** (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env`** with your settings (especially for diarization):
   ```bash
   # Required for diarization
   HUGGING_FACE_HUB_TOKEN=hf_your_token_here
   AUTO_DIARIZATION_ASSIGN=1
   
   # Worker connection
   WORKER_BASE_URL=http://backend:5000/api
   WORKER_AUTO_FALLBACK=1
   ```

3. **Pull and run**:
   ```bash
   docker compose -f docker-compose.images.yml up -d
   ```

### Verify Environment Variables

Check if worker loaded your `.env` correctly:
```bash
docker compose -f docker-compose.images.yml logs worker | grep "Flags:"
```

Expected output:
```
[worker][INFO] Flags: SIMULATE_WHISPER=0, DIARIZATION_AVAILABLE=1, TOKEN=present, AUTO_DIARIZATION_ASSIGN=1
```

If you see `TOKEN=absent`, your `.env` file is not being loaded. Make sure you're running from the directory containing `.env`.

### Stop / Remove
```bash
docker compose -f docker-compose.images.yml down
```

## Image Tags
Recommended tags:
- `latest`: most recent stable push from main/whisper branch.
- `YYYYMMDD` or Git SHA tags for deterministic reproduction.

## Publishing Workflow (GitHub Actions)
This repo includes `.github/workflows/build-images.yml`, which:
- Builds a matrix of services: frontend, backend, worker
- Pushes multi-arch images (amd64, arm64) to GHCR
- Tags images with: `latest` (for main/whisper), commit SHA, and branch name
- Passes `VITE_API_URL=http://localhost:5001` for frontend builds

Trigger manually or push to `main`/`whisper` to publish.

## Environment Simplification
The prebuilt images assume:
- Postgres credentials: user `qc_dev`, password `devpass`, db `qda_dev`.
- Backend port internal: `5000` (mapped externally via compose variable `BACKEND_HOST_PORT`).
- Frontend expects API at `http://localhost:5001` (adjust via compose env if needed).

If you need to override credentials or tokens, pass them via environment when launching compose:
```bash
DB_DEV_HOST_PORT=5433 BACKEND_HOST_PORT=5005 FRONTEND_PORT=4000 \
HUGGING_FACE_HUB_TOKEN=hf_xxx \
docker compose -f docker-compose.yml -f docker-compose.images.yml up -d
```

## Security Notes
- Do not bake secrets (tokens/passwords) into images—use runtime env vars.
- Consider multi-stage builds to keep dev dependencies out of final image.

## Next Steps
- Add digest pinning in compose example for reproducibility.
- Publish versioned tags (e.g., `v0.1.0`) alongside `latest`.
- Integrate automatic vulnerability scanning (GHCR / Trivy).
- Provide a `make release` convenience target.

## Fallback
If a user wants local source edits, they can still run:
```bash
docker compose up --build
```
without `docker-compose.images.yml`.
