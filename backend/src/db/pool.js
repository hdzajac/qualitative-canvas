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

// Environment selection: prefer NODE_ENV for semantics; DB_ENV still supported for backward compatibility
const dbEnv = (process.env.NODE_ENV === 'test' ? 'test' : (process.env.NODE_ENV === 'production' ? 'prod' : (process.env.DB_ENV || 'dev'))).toLowerCase();
const envKey = dbEnv === 'production' || dbEnv === 'prod' ? 'PROD' : 'DEV';

// Resolve connection details with override order:
// 1) DATABASE_URL_{ENV}
// 2) DATABASE_URL
// 3) discrete PG*_{ENV} or PG*
// Prefer a single DATABASE_URL for simplicity; allow DATABASE_URL_DEV/PROD as overrides
let connectionString = process.env.DATABASE_URL || process.env[`DATABASE_URL_${envKey}`];
const host = process.env[`PGHOST_${envKey}`] || process.env.PGHOST;
const port = process.env[`PGPORT_${envKey}`] || process.env.PGPORT;
const user = process.env[`PGUSER_${envKey}`] || process.env.PGUSER;
const password = process.env[`PGPASSWORD_${envKey}`] || process.env.PGPASSWORD;
let database = process.env[`PGDATABASE_${envKey}`] || process.env.PGDATABASE;

// If in test mode and TEST_DB_NAME is provided, override the database name in connection
const testDbName = process.env.TEST_DB_NAME || process.env.PGDATABASE_TEST;
if (dbEnv === 'test' && testDbName) {
  if (connectionString) {
    try {
      const url = new URL(connectionString);
      url.pathname = `/${testDbName}`;
      connectionString = url.toString();
    } catch {
      // ignore malformed URL
    }
  } else {
    database = testDbName;
  }
}

// Optional SSL via DATABASE_SSL=true|false or PGSSLMODE=require
const useSsl = (process.env.DATABASE_SSL === 'true') || (process.env.PGSSLMODE === 'require');

function redact(str) {
  if (!str) return str;
  try {
    const u = new URL(str);
    const maskedAuth = u.username ? `${u.username}:***@` : '';
    const auth = u.username || u.password ? maskedAuth : '';
    const host = u.host;
    const db = u.pathname?.replace(/^\//, '') || '';
    return `${u.protocol}//${auth}${host}/${db}`;
  } catch {
    return str;
  }
}

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

if (process.env.LOG_DB_CONFIG === '1') {
  const mode = connectionString ? 'connectionString' : 'discrete';
  const target = connectionString ? redact(connectionString) : `${user || ''}@${host || ''}:${port || ''}/${database || ''}`;
  console.log('[db] Mode:', mode, '| Env:', dbEnv, '| Target:', target, '| SSL:', useSsl ? 'on' : 'off');
}

pool.on('error', (err) => {
  console.error('Unexpected PG pool error', err);
});

export default pool;
