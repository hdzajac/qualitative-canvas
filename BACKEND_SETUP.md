# Backend Setup Guide (Current Local Architecture)

The backend in this repo already includes an Express server, PostgreSQL integration, migrations, and routes. This guide now focuses on running locally using the simplified environment strategy and adding environments later.

## Database Schema (Implemented)

The Postgres schema is created automatically on startup (idempotent migrations + table creation). Legacy examples below are retained for reference:

### Files Table
```sql
CREATE TABLE files (
  id VARCHAR(255) PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Highlights Table
```sql
CREATE TABLE highlights (
  id VARCHAR(255) PRIMARY KEY,
  file_id VARCHAR(255) NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  text TEXT NOT NULL,
  code_name VARCHAR(500) NOT NULL,
  position_x REAL,
  position_y REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);
```

### Themes Table
```sql
CREATE TABLE themes (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  position_x REAL,
  position_y REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Theme_Highlights Junction Table
```sql
CREATE TABLE theme_highlights (
  theme_id VARCHAR(255) NOT NULL,
  highlight_id VARCHAR(255) NOT NULL,
  PRIMARY KEY (theme_id, highlight_id),
  FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE,
  FOREIGN KEY (highlight_id) REFERENCES highlights(id) ON DELETE CASCADE
);
```

### Insights Table
```sql
CREATE TABLE insights (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  expanded BOOLEAN DEFAULT FALSE,
  position_x REAL,
  position_y REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Insight_Themes Junction Table
```sql
CREATE TABLE insight_themes (
  insight_id VARCHAR(255) NOT NULL,
  theme_id VARCHAR(255) NOT NULL,
  PRIMARY KEY (insight_id, theme_id),
  FOREIGN KEY (insight_id) REFERENCES insights(id) ON DELETE CASCADE,
  FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE
);
```

### Annotations Table
```sql
CREATE TABLE annotations (
  id VARCHAR(255) PRIMARY KEY,
  content TEXT NOT NULL,
  position_x REAL NOT NULL,
  position_y REAL NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Running the Existing Backend

1. Ensure Postgres is running (compose service `db-dev`).
2. Set `DATABASE_URL` in top-level `.env`.
3. Start backend:
```sh
cd backend
npm install
npm start
```
4. Health: `GET /api/health`

The server code lives in `backend/src/` and already separates initialization, migrations, DAOs, services, and routes.
```

## Frontend API Base

Frontend uses `VITE_API_URL` from `.env` at build/start time. Adjust it if you change backend port or host.

## Local Stack Summary

| Component  | Location  | Port | How to start                       |
|------------|-----------|------|------------------------------------|
| Backend    | host      | 5002 | `npm start` in `backend/`          |
| Frontend   | host      | 3000 | `npm run dev` in `frontend/`       |
| Postgres   | docker    | 5432 | `docker compose up -d db-dev`      |
| Worker     | docker    | n/a  | `docker compose up -d worker`      |

## Notes

- Frontend is fully wired to backend routes; no mock storage used now.
- Add auth/more validation before exposing publicly.
- Use a single `DATABASE_URL` per environment going forward.

## Future Environments

For staging/production inject env vars (don’t commit secrets):
```
NODE_ENV=production
DATABASE_URL=postgres://<user>:<pass>@<host>:5432/<db>
PORT=5000
VITE_API_URL=https://your-domain/api
```
Run migrations before starting the server.
