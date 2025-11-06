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

## Quick start (Local dev)

Start Postgres in Docker:
```sh
docker compose up -d db
```

Backend (local on 5002):
```sh
cd backend
export DATABASE_URL=postgres://postgres:postgres@localhost:${DB_HOST_PORT:-5432}/qda
export PORT=5002
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
- Vite proxies `/api` to `http://localhost:5002` unless `VITE_API_URL` is set.

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

## Environment
Top-level `.env` (optional for Compose):
```
FRONTEND_PORT=3000
BACKEND_HOST_PORT=5001
DB_HOST_PORT=5432
DATABASE_URL=postgres://postgres:postgres@localhost:5432/qda
```
The frontend reads `VITE_API_URL` (set by Compose to `http://localhost:${BACKEND_HOST_PORT}` at build and runtime).

## API
- `GET /api/health`
- Files: `GET /api/files`, `GET /api/files/:id`, `POST /api/files`
- Highlights: `GET/POST/PUT/DELETE /api/highlights(/:id)`
- Themes: `GET/POST/PUT/DELETE /api/themes(/:id)`
- Insights: `GET/POST/PUT/DELETE /api/insights(/:id)`
- Annotations: `GET/POST/PUT/DELETE /api/annotations(/:id)`

## Troubleshooting
- Port conflicts: change `FRONTEND_PORT`, `BACKEND_HOST_PORT`, or `DB_HOST_PORT` in `.env`.
- Browser can’t reach API: rebuild with Compose so the frontend uses `http://localhost:${BACKEND_HOST_PORT}`.
- Reset DB: `docker compose down -v`.
- Logs: `docker compose logs -f backend` | `frontend` | `db`.

See `README_DOCKER.md` for full details.

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

## License
Apache-2.0. See `LICENSE`. For new files, you may add:
```ts
// SPDX-License-Identifier: Apache-2.0
```
