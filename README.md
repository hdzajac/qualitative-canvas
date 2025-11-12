# Qualitative Canvas

Full-stack monorepo with:
- Frontend: Vite + React + TypeScript (`frontend/`)
- Backend: Node.js + Express + PostgreSQL (`backend/`)
- Docker Compose: orchestrates frontend, backend, and Postgres

<!-- Legacy header retained from earlier draft removed in cleanup -->
## Quick start (Local-first Dev + Minimal Compose)

Current streamlined workflow: run the backend and frontend on your host; only Postgres (and optionally the transcription worker) run in Docker.

1. Copy `.env.example` to `.env` (or use the simplified `.env` already present) and ensure it contains a single local `DATABASE_URL`.
2. Start Postgres + worker:
  ```sh
  docker compose up -d db-dev worker
  ```
3. Backend:
  ```sh
  cd backend
  npm install
  npm start  # listens on http://localhost:5002
  ```
4. Frontend:
  ```sh
  cd frontend
  npm install
  npm run dev  # http://localhost:3000
  ```
5. App expects API at `VITE_API_URL` (defaults to `http://localhost:5002`).

Data persists in the volume `db_data_dev`. Remove with:
```sh
docker compose down -v
```
Inspect status:
```sh
docker compose ps
```

Change dev DB host port (optional): set `DB_DEV_HOST_PORT` in `.env`, e.g.
```sh
echo "DB_DEV_HOST_PORT=5433" >> .env
docker compose up -d db-dev
```

Notes:
- To wipe data entirely: `docker compose down -v`.
## Environment Strategy (Simplified)

Single local `.env` contains only what you need:
```
FRONTEND_PORT=3000
VITE_API_URL=http://localhost:5002
PORT=5002
FRONTEND_ORIGIN=http://localhost:3000
DATABASE_URL=postgres://qc_dev:<password>@localhost:5432/qda_dev
SIMULATE_WHISPER=1
WHISPER_MODEL=small
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
WORKER_BASE_URL=http://host.docker.internal:5002/api
WORKER_AUTO_FALLBACK=0
AUTO_DIARIZATION_ASSIGN=1
HUGGING_FACE_HUB_TOKEN=<your_hf_token>
```

Add staging/production later by injecting (never committing) a different `DATABASE_URL` and setting `NODE_ENV=production` at deploy time.

## Run full app in Docker (optional profile `full`)

You can also run frontend + backend inside Docker alongside Postgres + worker.

1. Decide how the backend container gets its database URL:
   - Option A (single var): set `DOCKER_DATABASE_URL=postgres://qc_dev:<password>@db-dev:5432/qda_dev`
   - Option B (fallback assembly): omit `DOCKER_DATABASE_URL` and set the trio `DB_DEV_USER`, `DB_DEV_PASSWORD`, `DB_DEV_DBNAME` (Compose will build the URL; password is required).
2. Ensure `.env` has at least:
   ```
   BACKEND_HOST_PORT=5001
   FRONTEND_PORT=3000
   # One of the following approaches
   # DOCKER_DATABASE_URL=postgres://qc_dev:<password>@db-dev:5432/qda_dev
   DB_DEV_USER=qc_dev
   DB_DEV_PASSWORD=<password>
   DB_DEV_DBNAME=qda_dev
   ```
3. Start full stack:
  ```sh
  docker compose --profile full up -d
  ```
4. Backend API: http://localhost:${BACKEND_HOST_PORT:-5001}/api
5. Frontend: http://localhost:${FRONTEND_PORT:-3000}
6. Worker BASE_URL automatically defaults to host backend. When running full stack only (no local backend), you can override in `.env` before `up`:
  ```
  WORKER_BASE_URL=http://backend:5000/api
  ```

### Diarization (optional)

To automatically detect speakers and assign participants to segments:

1) Obtain a Hugging Face token with access to pyannote models and set it in your shell:

```sh
export HUGGING_FACE_HUB_TOKEN=hf_...
export AUTO_DIARIZATION_ASSIGN=1
```

2) Start the worker (or rebuild if already running):

```sh
docker compose up -d --build worker
```

The worker logs will show flags on startup:

```
[worker][INFO] Flags: SIMULATE_WHISPER=0, DIARIZATION_AVAILABLE=1, TOKEN=present, AUTO_DIARIZATION_ASSIGN=1
```

Notes:
- Diarization now runs regardless of simulation mode; however, for real transcripts set `SIMULATE_WHISPER=0` (default in compose).
- Existing transcripts won’t be retroactively assigned. Use the “Reset” action on a transcript and run a new transcription job to diarize.

Important: Do NOT run local host backend/frontend simultaneously with the Docker versions (port conflicts, duplicate jobs). Stop local processes first.

Common commands:
```sh
docker compose --profile full ps
docker compose --profile full logs -f backend
docker compose --profile full down
```

To return to local-first mode, just stop the `frontend` and `backend` containers:
```sh
docker compose --profile full stop frontend backend
```

Persisted data remains in `db_data_dev`; switching modes doesn’t affect it.

## Makefile shortcuts
A Makefile is provided for common flows. These targets wrap Docker Compose and the prebuilt images override.

Targets:
- `make pull-images` – pull prebuilt images from GHCR (frontend, backend, worker).
- `make up-images` – start stack using prebuilt images (no local builds). Equivalent to:
  - `docker compose -f docker-compose.yml -f docker-compose.images.yml up -d`
- `make down-images` – stop the stack started with prebuilt images.
- `make up` – start stack with local builds (uses `docker compose up -d --build`).
- `make down` – stop the locally built stack.
- `make logs` – tail logs for all services (Ctrl+C to stop).

Quick usage:
```sh
make pull-images
make up-images
# later
make logs
make down-images
```

Notes:
- Prebuilt images compose override lives at `docker-compose.images.yml` and bakes safe defaults so a local `.env` isn’t required.
- You can still override ports or tokens at runtime (e.g., `BACKEND_HOST_PORT=5005 make up-images`).

## Adding More Environments Later

When you introduce staging/production:
- Provide a deploy-time `DATABASE_URL`.
- Set `NODE_ENV=production`.
- Provide `VITE_API_URL` (or configure reverse proxy) for frontend builds.
- Do not reuse dev credentials; rotate secrets per environment.

## Usage guide
- Create codes
  1) Open a document, select text, click “Add code”, name it, and save.
  2) For .vtt transcripts, use “Edit block(s)” to edit nearby lines; merging of same-speaker lines happens on blur.
- Build themes and insights on the Canvas
  - Select 2+ codes and click “Create Theme”; select 1+ themes and click “Create Insight”.
  - Or connect using the small handle on the right edge of a card:
    - Drag from a Code to a Theme, or from a Theme to an Insight.
    - Valid targets highlight as you hover.
    - Click an edge to remove that connection.
  - Keyboard accelerators: When 2+ codes are selected press T and a Theme is created immediately (you'll be prompted for a name); when 1+ themes are selected press I to create an Insight. If no codes are selected, T falls back to the Text/Annotation tool.
- Inspect details
  - Open a card (↗ icon) to see/edit titles; side panel shows related items and document names.
 - Delete VTT text blocks quickly
   - Hover a VTT line to reveal a trash button; click to delete.
   - Undo immediately via the toast action or Cmd/Ctrl+Z.

## Backend architecture & security

- DAO/Service layer:
  - Routes validate inputs with `zod`, then call service methods backed by DAO modules.
  - DAOs use parameterized SQL via `pg` (no string interpolation).
- Security middleware:
  - `helmet` for HTTP security headers
  - `express-rate-limit` for basic abuse protection
  - CORS restricted via `FRONTEND_ORIGIN`
- DB configuration:
  - Auth via env-only (no secrets in git), optional SSL via `DATABASE_SSL=true` or `PGSSLMODE=require`.
- Backward compatibility:
  - `/api/highlights` proxies to the codes endpoints.

## Shortcuts & gestures
- V: Select tool
- H or Space: Hand/pan
- T: Create Theme if codes are selected; otherwise switch to Text/Annotation tool
- I: Create Insight if themes are selected
- Shift+Click: Multi-select
- Drag background: Marquee select
- Delete/Backspace: Delete selected items
- Mouse wheel/trackpad: Zoom; disabled while dragging
- “Fit” button: Fit all cards into view
Canvas text size
- Use the top toolbar to choose a text size; select a single Code/Theme card to enable “Apply”.

Text & coding
- C: Add code for current text selection
- E: Edit selected block(s) — VTT transcripts only

## Production (Future)

Deployment outline (not yet wired):
1. Build frontend with `VITE_API_URL=https://your-domain/api`.
2. Run backend container with only: `NODE_ENV=production`, `PORT=5000`, `DATABASE_URL=...`.
3. Add reverse proxy (nginx / Caddy) to serve frontend and proxy `/api` to backend.
4. Add migrations step before starting the server.

## API
- `GET /api/health`
- Files: `GET /api/files`, `GET /api/files/:id`, `POST /api/files`, `PUT /api/files/:id`, `DELETE /api/files/:id`
- Codes/Highlights: `GET/POST/PUT/DELETE /api/codes(/:id)` (alias: `/api/highlights`)
- Themes: `GET/POST/PUT/DELETE /api/themes(/:id)`
- Insights: `GET/POST/PUT/DELETE /api/insights(/:id)`
- Annotations: `GET/POST/PUT/DELETE /api/annotations(/:id)`
 - (Planned) Project export: `GET /api/projects/:id/export` → returns a JSON bundle
 - (Planned) Project import: `POST /api/projects/import` → accepts a bundle and creates a new project

## Project export & import (planned)
Status: Design phase. Implementation forthcoming.

Objectives:
- Allow a project (its documents, codes, themes, insights, annotations, and connections) to be exported as a portable JSON bundle.
- Allow importing that bundle to create a brand new project named `Imported: YYYY-MM-DD` (always a new project, no merging).

Bundle draft schema (shape will be validated with `zod` and versioned):
```jsonc
{
  "version": "1.0.0",          // bundle schema version
  "exportedAt": "2025-11-07T10:15:00.000Z",
  "project": { "title": "Original Project Name" },
  "files": [ { "id": "f1", "name": "Interview1.vtt", "mime": "text/vtt", "content": "..." } ],
  "codes": [ { "id": "c1", "fileId": "f1", "text": "participant mentions trust", "ranges": [ {"start": 102, "end": 145} ] } ],
  "themes": [ { "id": "t1", "title": "Trust Building", "codeIds": ["c1"] } ],
  "insights": [ { "id": "i1", "title": "Onboarding relies on initial trust", "themeIds": ["t1"] } ],
  "annotations": [ { "id": "a1", "text": "Need follow-up interview", "x": 1200, "y": 640, "width": 220, "height": 160, "color": "#FFD54F" } ]
}
```

Import algorithm (high level):
1. Validate JSON against current version schema.
2. Start transaction.
3. Generate fresh IDs for each entity and build old→new ID maps.
4. Insert in dependency order: files → codes → themes → insights → annotations → connections.
5. Persist canvas positions/sizes/styles.
6. Commit and return a summary (counts + new project ID).

Safeguards & limits (planned):
- Max bundle size (configurable) to prevent huge payloads.
- Reject unknown future version (prompt for upgrade path).
- All IDs regenerated; no collisions possible.
- Require permission to create projects.

Example response (import):
```json
{ "projectId": "proj_new_123", "created": {"files": 5, "codes": 142, "themes": 12, "insights": 4, "annotations": 27} }
```

Tracking: See README TODO section or project board for implementation progress.

## Troubleshooting
- Port conflicts: change `FRONTEND_PORT`, `BACKEND_HOST_PORT`, or `DB_HOST_PORT` in `.env`.
- Browser can’t reach API: ensure `VITE_API_URL` in `.env` points to the backend (e.g., `http://localhost:5002`).
- Reset DB: `docker compose down -v`.
- Logs: `docker compose logs -f backend` | `frontend` | `db`.
- Local psql: if not installed, run queries via `docker compose exec db psql -U <user> -d <db>`.

## Testing (frontend)
- Install dev deps in `frontend/` (one-time):
  - npm install
- Run tests:
  - npm run test
  - npm run test:watch
  - Includes unit tests for canvas utilities and geometry helpers.

## Shared domain types (frontend)

To keep type definitions tidy and aligned with backend persistence, shared domain types are modularized under `frontend/src/types/`:

- `core.ts` — Size, CardStyle
- `projects.ts` — Project
- `files.ts` — UploadedFile
- `codes.ts` — Code (aka Highlight)
- `themes.ts` — Theme
- `insights.ts` — Insight
- `annotations.ts` — Annotation
- `media.ts` — MediaFile
- `segments.ts` — TranscriptSegment
- `transcriptionJobs.ts` — TranscriptionJob
- `participants.ts` — Participant

A barrel file `frontend/src/types/index.ts` re-exports everything so existing imports continue to work. In your code, import from the barrel:

```ts
import type { MediaFile, TranscriptSegment, Participant, FinalizedTranscriptMapping } from '@/types';
```

This avoids a single massive types file and keeps each domain cohesive. The finalized transcript mapping type is also exported from the barrel.

## Frontend canvas architecture
Modular components under `frontend/src/components/canvas/`:
- CanvasToolbarLeft: left-side tools (select, pan, text) and Fit action
- CanvasFontToolbar: top-center font size controls and Apply button for single selection
- CanvasContextPopup: context actions for multi-selection (Create Theme/Insight)
- CanvasSizeControls: width presets and per-card font size for single selection
- CanvasDrawing/CanvasUtils/CanvasGeometry: drawing helpers, hit tests, and geometry calculations

The main `Canvas.tsx` orchestrates state, interactions, and persistence while delegating presentational pieces to these components.

docker compose exec -T db pg_dump -U postgres -d qda -Fc -f /tmp/qda.dump
docker compose cp db:/tmp/qda.dump ./qda.dump
docker compose exec -T db bash -lc "createdb -U postgres qda_dev || true"
docker compose exec -T db pg_restore -U postgres -d qda_dev /tmp/qda.dump
## Data Migration (Local)
Dump and restore between local databases:
```sh
docker compose exec -T db-dev pg_dump -U qc_dev -d qda_dev > dump.sql
psql postgres://qc_dev:<password>@localhost:5432/qda_dev < dump.sql
```

## License
Apache-2.0. See `LICENSE`. For new files, you may add:
```ts
// SPDX-License-Identifier: Apache-2.0
```
