# Qualitative Canvas – Docker Overview (Simplified Local Stack)

Current workflow favors running app (frontend + backend) on host, and only infrastructure (Postgres + worker) in Docker.

---

## Prerequisites
- Node.js 18+ (local development)
- Docker and Docker Compose (for containerized runs)

---

## Environment

Top-level `.env` (local-only example):
```
FRONTEND_PORT=3000
VITE_API_URL=http://localhost:5002
PORT=5002
DATABASE_URL=postgres://qc_dev:<password>@localhost:5432/qda_dev
SIMULATE_WHISPER=1
WORKER_BASE_URL=http://host.docker.internal:5002/api
TEST_DB_NAME=qda_dev_test
```

---

## Start infra (DB + worker)

```sh
docker compose up -d db-dev worker
```

Then run backend + frontend locally:
```sh
cd backend && npm start
# new terminal
cd frontend && npm run dev
```

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

## Full compose (optional future)
You can add backend + frontend back into `docker-compose.yml` later; supply only `DATABASE_URL` and `PORT` for backend, and `VITE_API_URL` build arg for frontend.

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

- Browser cannot reach API:
  - Ensure backend running on host: `npm start` in `backend/`.
  - Confirm `VITE_API_URL` in `.env` matches backend URL.

- Port conflicts:
  - Change `FRONTEND_PORT` or `PORT` in `.env`.

- Schema:
  - Migrations run automatically on backend startup; tables created idempotently.
  - Tests use a separate database (TEST_DB_NAME). The test harness will create it if missing and run migrations on both dev and test DBs.

- Reset database: `docker compose down -v`.
  - For tests only, the test DB is truncated automatically after each run; the dev DB is untouched.

- Backup:
  - `docker compose exec -T db-dev pg_dump -U qc_dev qda_dev > backup.sql`
  - `psql postgres://qc_dev:<password>@localhost:5432/qda_dev < backup.sql`

---

## Next steps
- Add request validation (zod) per route.
- Add auth if needed.
- Add migrations (e.g., with node-pg-migrate) for versioned schema changes.
