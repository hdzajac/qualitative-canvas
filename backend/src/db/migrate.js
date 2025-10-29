import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const { rows } = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map(r => r.filename));

  const migrationsDir = path.resolve(__dirname, 'migrations');
  let files = [];
  try {
    files = await fs.readdir(migrationsDir);
  } catch (e) {
    if (e.code === 'ENOENT') return; // no migrations
    throw e;
  }
  files = files.filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const full = path.join(migrationsDir, file);
    const sql = await fs.readFile(full, 'utf8');
    // Run in a transaction
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await pool.query('COMMIT');
      console.log(`Applied migration: ${file}`);
    } catch (err) {
      await pool.query('ROLLBACK');
      console.error(`Failed migration ${file}:`, err);
      throw err;
    }
  }
}
