# Qualitative Canvas – Monorepo (Frontend + Backend + Postgres)

This repository contains:
- Frontend: Vite + React + TS (`frontend/`)
- Backend: Node.js + Express + PostgreSQL (`backend/`)
- Docker Compose: orchestrates frontend, backend, and Postgres

---

## Prerequisites
- Node.js 18+ (local development)
- Docker and Docker Compose (for containerized runs)

---

## Environment

Top-level `.env` (optional, used by docker-compose):

```
FRONTEND_PORT=3000
BACKEND_HOST_PORT=5001
# Local connection string if you run backend locally against dockerized DB
DATABASE_URL=postgres://postgres:postgres@localhost:5432/qda
```

The frontend reads the API base URL via `VITE_API_URL` (baked at build time or provided at runtime). In Docker Compose, it is set to `http://localhost:${BACKEND_HOST_PORT}`.

---

## Run everything with Docker (recommended)

1) Build and start services

```
docker compose up --build
```

2) Open the app
- Frontend: http://localhost:${FRONTEND_PORT:-3000}
- Backend health: http://localhost:${BACKEND_HOST_PORT:-5001}/api/health

3) Stop / restart
- Stop (keep data): `docker compose stop`
- Restart with rebuild: `docker compose up --build`
- Remove containers, keep data volume: `docker compose down`
- Remove everything including data: `docker compose down -v`

### Data persistence
- Postgres data is stored in the named volume `db_data` and survives restarts and rebuilds.
- Only removing the volume deletes data: `docker compose down -v`.

### Useful checks
- Logs: `docker compose logs -f backend` (or `frontend`, `db`)
- DB health: `docker exec -it $(docker compose ps -q db) pg_isready -U postgres -d qda`
- DB shell: `docker exec -it $(docker compose ps -q db) psql -U postgres -d qda`

---

## Local development (without Docker for the app)

You can run the backend locally while using the Postgres container from Compose.

1) Start only Postgres
```
docker compose up -d db
```

2) Backend
```
cd backend
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/qda
npm install
npm run dev
```
- Backend runs on http://localhost:5000

3) Frontend
```
cd frontend
npm install
npm run dev
```
- Frontend runs on http://localhost:3000
- During local dev, Vite proxies `/api` to `http://localhost:5000` unless `VITE_API_URL` is set.

---

## API overview

- `GET /api/health` – service + DB check
- Files: `GET /api/files`, `GET /api/files/:id`, `POST /api/files`
- Highlights: `GET/POST/PUT/DELETE /api/highlights(/:id)`
- Themes: `GET/POST/PUT/DELETE /api/themes(/:id)`
- Insights: `GET/POST/PUT/DELETE /api/insights(/:id)`
- Annotations: `GET/POST/PUT/DELETE /api/annotations(/:id)`

All endpoints return shapes that match the frontend `src/types`.

---

## Project layout
```
qualitative-canvas/
  backend/
    Dockerfile
    package.json
    src/
      db/pool.js
      routes/
        files.js
        highlights.js
        themes.js
        insights.js
        annotations.js
      index.js
  frontend/
    Dockerfile
    package.json
    vite.config.ts
    src/
      services/api.ts
      types/
        index.ts
  docker-compose.yml
  .env (optional)
```

---

## Troubleshooting

- Browser cannot resolve `backend:5000`:
  - The browser can’t access Docker DNS. We configure the frontend to use `http://localhost:${BACKEND_HOST_PORT}` instead. Rebuild with Compose to propagate.

- Port 5000 already in use:
  - Compose maps backend to `${BACKEND_HOST_PORT:-5001}` by default. Change `BACKEND_HOST_PORT` in `.env` to any free port.

- DB migrations / schema:
  - The backend initializes tables on startup with `CREATE TABLE IF NOT EXISTS` and creates indexes. No data is dropped.

- Reset database:
  - `docker compose down -v` to remove containers and the data volume.

- Backups:
  - `docker exec -t $(docker compose ps -q db) pg_dump -U postgres qda > backup.sql`
  - `cat backup.sql | docker exec -i $(docker compose ps -q db) psql -U postgres -d qda`

---

## Next steps
- Add request validation (zod) per route.
- Add auth if needed.
- Add migrations (e.g., with node-pg-migrate) for versioned schema changes.
