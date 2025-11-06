import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';

// Load env from repo root first, then fallback to current working directory.
// This allows a single top-level .env for both root and backend/ runs.
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRootEnv = path.resolve(__dirname, '../../../.env');
  if (fs.existsSync(repoRootEnv)) {
    dotenv.config({ path: repoRootEnv });
  }
} catch {}
// Also load default .env (e.g., backend/.env) if present; won't override existing vars
dotenv.config();

const { Pool } = pkg;

// Environment selection: prefer DB_ENV=dev|prod, otherwise NODE_ENV
const dbEnv = (process.env.DB_ENV || (process.env.NODE_ENV === 'production' ? 'prod' : 'dev')).toLowerCase();
const envKey = dbEnv === 'production' || dbEnv === 'prod' ? 'PROD' : 'DEV';

// Resolve connection details with override order:
// 1) DATABASE_URL_{ENV}
// 2) DATABASE_URL
// 3) discrete PG*_{ENV} or PG*
const connectionString = process.env[`DATABASE_URL_${envKey}`] || process.env.DATABASE_URL;
const host = process.env[`PGHOST_${envKey}`] || process.env.PGHOST;
const port = process.env[`PGPORT_${envKey}`] || process.env.PGPORT;
const user = process.env[`PGUSER_${envKey}`] || process.env.PGUSER;
const password = process.env[`PGPASSWORD_${envKey}`] || process.env.PGPASSWORD;
const database = process.env[`PGDATABASE_${envKey}`] || process.env.PGDATABASE;

// Optional SSL via DATABASE_SSL=true|false or PGSSLMODE=require
const useSsl = (process.env.DATABASE_SSL === 'true') || (process.env.PGSSLMODE === 'require');

const pool = new Pool({
  connectionString,
  host,
  port: port ? Number(port) : undefined,
  user,
  password,
  database,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  max: process.env.PGPOOL_MAX ? Number(process.env.PGPOOL_MAX) : 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('Unexpected PG pool error', err);
});

export default pool;
