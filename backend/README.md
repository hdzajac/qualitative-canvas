# Backend (Express + PostgreSQL)

This server powers Qualitative Canvas. It uses parameterized queries via `pg` and input validation via `zod` to prevent SQL injection and malformed data.

## Security hardening
- Parameterized queries everywhere: no string interpolation in SQL.
- Input validation using `zod` for all write endpoints.
- HTTP security headers via `helmet`.
- Basic rate limiting via `express-rate-limit`.
- CORS restricted to `FRONTEND_ORIGIN` when provided.
- Central error handler avoids leaking stack traces in responses.

## Database authentication
Configure credentials via environment variables. Do not commit secrets — `.env` is ignored by git.

Supported env vars:
- Dual-env support (dev/prod):
  - `DB_ENV=dev|prod` to force selection (defaults to `dev`, or `prod` when `NODE_ENV=production`)
  - Prefer `DATABASE_URL_DEV` / `DATABASE_URL_PROD`
  - Or discrete vars with suffixes: `PGHOST_DEV`/`PGHOST_PROD`, `PGPORT_DEV`/`PGPORT_PROD`, etc.
- Fallbacks:
  - `DATABASE_URL` (applies to both when DEV/PROD not provided)
  - or discrete vars without suffix: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
- SSL:
  - `DATABASE_SSL=true` or `PGSSLMODE=require` to enable TLS (`rejectUnauthorized: false`)
- Pool tuning (optional):
  - `PGPOOL_MAX` — max pool size (default 10)

## Environment variables
- `PORT` — server port (default 5002)
- `FRONTEND_ORIGIN` — allowed CORS origin (e.g., http://localhost:3000)
- DB variables as above

## Development
```sh
npm install
npm run dev
```

## Testing
Basic route tests can be added using `supertest` with a mocked `pool`.

```
npm run test
```

## Notes
- Migrations run automatically at startup; see `src/db/migrate.js` and `src/db/migrations/*`.
- The server initializes tables if missing for local/dev convenience.
 - Docker Compose sets `DB_ENV=prod` and uses `DATABASE_URL_PROD` to target the `db` service.

### Dev and prod DBs concurrently

When using the root `docker-compose.yml`:
- `db` (prod) is internal-only and not published on the host.
- `db-dev` (dev) is published on your host (default `localhost:5432`).

Use cases:
- Local Node backend connects to `db-dev` via `PG*_DEV` in the top-level `.env`.
- The backend container (in Docker) connects to `db` via `DATABASE_URL_PROD`.

Start both databases:
```sh
docker compose up -d db db-dev
```

Check status:
```sh
docker compose ps
```

Change dev DB port (optional): set `DB_DEV_HOST_PORT` in the top-level `.env`.

## Preserve current DB as your dev database
If you have an existing Postgres database you want to keep as your development dataset:

1. Dump the current database to a file using `pg_dump`.
2. Point `PG* _DEV` or `DATABASE_URL_DEV` at your local Postgres.
3. Restore the dump into your `PGDATABASE_DEV`.

Example (adapt to your env):

```sh
# Dump from current DB
pg_dump "$DATABASE_URL" -Fc -f qda_dev.dump

# Restore into local dev DB
createdb qda
pg_restore -d qda qda_dev.dump
```

Ensure your `.env` sets the `*_DEV` variables so the backend uses this restored DB when running locally.
