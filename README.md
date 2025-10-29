# Qualitative Canvas

Full-stack monorepo with:
- Frontend: Vite + React + TypeScript (`frontend/`)
- Backend: Node.js + Express + PostgreSQL (`backend/`)
- Docker Compose: orchestrates frontend, backend, and Postgres

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

Backend:
```sh
cd backend
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/qda
npm install
npm run dev
```
- Runs on http://localhost:5000

Frontend:
```sh
cd frontend
npm install
npm run dev
```
- Runs on http://localhost:3000
- Vite proxies `/api` to `http://localhost:5000` unless `VITE_API_URL` is set.

## Environment
Top-level `.env` (optional for Compose):
```
FRONTEND_PORT=3000
BACKEND_HOST_PORT=5001
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
- Port conflicts: change `FRONTEND_PORT` or `BACKEND_HOST_PORT` in `.env`.
- Browser can’t reach API: rebuild with Compose so the frontend uses `http://localhost:${BACKEND_HOST_PORT}`.
- Reset DB: `docker compose down -v`.
- Logs: `docker compose logs -f backend` | `frontend` | `db`.

See `README_DOCKER.md` for full details.
