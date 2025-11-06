# Qualitative Canvas

Full-stack monorepo with:
- Frontend: Vite + React + TypeScript (`frontend/`)
- Backend: Node.js + Express + PostgreSQL (`backend/`)
- Docker Compose: orchestrates frontend, backend, and Postgres

## Key features
- Documents and coding
  - Create codes by selecting text in a document; name the code in the side sheet.
  - Accurate highlight placement across normal text and .vtt transcripts (segment-aware rendering, no layout breaks).
  - VTT editing: edit blocks inline, caret is stable; adjacent lines from the same speaker auto-merge on blur.
- Canvas workspace
  - Cards for Codes, Themes, Insights, and Annotations with default sizes and auto height.
  - Multi-select and group drag; positions persist.
  - Connect via a subtle handle: Code → Theme, Theme → Insight. Valid targets highlight on hover while connecting. Click an edge to remove a connection.
  - Side panel lists: Themes show their codes (+ document names); Insights show their themes and underlying codes (+ document names).
  - Per-card text size control; quick width presets when a single card is selected.
  - Modular canvas UI: toolbars and popups are split into components for clarity.
- API-backed persistence for positions, sizes, styles, titles, and relationships.

## Quick start (Docker)

```sh
docker compose up --build
```
- Frontend: http://localhost:${FRONTEND_PORT:-3000}
- Backend health: http://localhost:${BACKEND_HOST_PORT:-5001}/api/health

Data persists in the named volume `db_data`.

If you set `DATABASE_URL_PROD` in your top-level `.env`, the backend container will use it (via `DB_ENV=prod`). Example:

```
# .env (for Docker)
FRONTEND_PORT=3000
BACKEND_HOST_PORT=5001
DB_HOST_PORT=5432
DATABASE_URL_PROD=postgres://qc_prod:prod_password_change_me@db:5432/qda
```

### Using dev and prod DBs side-by-side (one machine)

This compose file runs two Postgres databases concurrently:

- `db` (prod): internal-only; not published to your host. The backend container connects to this via `DATABASE_URL_PROD` and `DB_ENV=prod`.
- `db-dev` (dev): published on your host (default `localhost:5432`) for local tools and the local Node backend.

Start both:
```sh
docker compose up -d db db-dev
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
- Keep `db` internal-only (no ports mapping) for safety.
- Local Node backend uses `PG*_DEV` (e.g., `PGHOST_DEV=localhost`, `PGPORT_DEV=5432`).
- Docker backend uses `DATABASE_URL_PROD` to reach `db` over the compose network.

## Quick start (Local dev)

Start Postgres in Docker:
```sh
docker compose up -d db
```

Copy `.env.example` to `.env` and adjust dev values:
```
cp .env.example .env
# Edit: PGHOST_DEV, PGPORT_DEV, PGUSER_DEV, PGPASSWORD_DEV, PGDATABASE_DEV
```

Backend (local on 5002):
```sh
cd backend
npm install
npm run dev
```
- Runs on http://localhost:5002

Frontend (local on 3000):
```sh
cd frontend
npm install
npm run dev
```
- Runs on http://localhost:3000
- The app uses `VITE_API_URL` (set in top-level `.env`) to call the backend (defaults to `http://localhost:5002`).

## Environment & configuration

This repo supports dual DB environments (dev/prod). The backend selects which DB to use based on `DB_ENV` (or `NODE_ENV`).

Order of precedence:
1) `DATABASE_URL_DEV` / `DATABASE_URL_PROD`
2) Discrete vars: `PGHOST_DEV`/`PGHOST_PROD`, `PGPORT_DEV`/`PGPORT_PROD`, `PGUSER_DEV`/`PGUSER_PROD`, `PGPASSWORD_DEV`/`PGPASSWORD_PROD`, `PGDATABASE_DEV`/`PGDATABASE_PROD`
3) Fallbacks: `DATABASE_URL` or `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`

Typical setups:
- Local dev: set `PG*_DEV` to your local Postgres (or Docker’s published port on localhost). The backend defaults to `dev`.
- Docker: set `DATABASE_URL_PROD` (the backend service uses `DB_ENV=prod` and connects to the Compose `db` service).

See `.env.example` for a filled-out template with dummy credentials and comments.

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
- T: Text tool (add annotation)
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

## Running in production (Compose)

1) Create `.env` with at least:
```
FRONTEND_PORT=3000
BACKEND_HOST_PORT=5001
DB_HOST_PORT=5432
DATABASE_URL_PROD=postgres://<user>:<password>@db:5432/qda
```
2) Start services:
```
docker compose up --build -d
```
3) Health check: http://localhost:${BACKEND_HOST_PORT}/api/health
4) Frontend: http://localhost:${FRONTEND_PORT}

## API
- `GET /api/health`
- Files: `GET /api/files`, `GET /api/files/:id`, `POST /api/files`, `PUT /api/files/:id`, `DELETE /api/files/:id`
- Codes/Highlights: `GET/POST/PUT/DELETE /api/codes(/:id)` (alias: `/api/highlights`)
- Themes: `GET/POST/PUT/DELETE /api/themes(/:id)`
- Insights: `GET/POST/PUT/DELETE /api/insights(/:id)`
- Annotations: `GET/POST/PUT/DELETE /api/annotations(/:id)`

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

## Frontend canvas architecture
Modular components under `frontend/src/components/canvas/`:
- CanvasToolbarLeft: left-side tools (select, pan, text) and Fit action
- CanvasFontToolbar: top-center font size controls and Apply button for single selection
- CanvasContextPopup: context actions for multi-selection (Create Theme/Insight)
- CanvasSizeControls: width presets and per-card font size for single selection
- CanvasDrawing/CanvasUtils/CanvasGeometry: drawing helpers, hit tests, and geometry calculations

The main `Canvas.tsx` orchestrates state, interactions, and persistence while delegating presentational pieces to these components.

## Migrating current data to a dev database (optional)

If you want your current data available locally, you can dump the database and restore into a `qda_dev` database running in the Docker Postgres:

```
# Inside the repo, with db service running
docker compose exec -T db pg_dump -U postgres -d qda -Fc -f /tmp/qda.dump
docker compose cp db:/tmp/qda.dump ./qda.dump
docker compose exec -T db bash -lc "createdb -U postgres qda_dev || true"
docker compose exec -T db pg_restore -U postgres -d qda_dev /tmp/qda.dump
```

Then set `PG*_DEV` in your `.env` to point at `qda_dev` on `localhost:5432`.

## License
Apache-2.0. See `LICENSE`. For new files, you may add:
```ts
// SPDX-License-Identifier: Apache-2.0
```
