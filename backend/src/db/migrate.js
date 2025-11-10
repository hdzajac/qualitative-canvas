import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(targetPool = pool) {
  await targetPool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const { rows } = await targetPool.query('SELECT filename FROM schema_migrations');
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
    await pool.query('BEGIN');
    try {
      await targetPool.query(sql);
      // ON CONFLICT DO NOTHING makes migration idempotent under concurrent test startups
      await targetPool.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
      await targetPool.query('COMMIT');
      console.log(`Applied migration: ${file}`);
    } catch (err) {
      await targetPool.query('ROLLBACK');
      // If another process applied it concurrently, ignore duplicate key error and continue
      if (err.code === '23505') {
        console.warn(`Migration already applied concurrently: ${file}`);
        continue;
      }
      console.error(`Failed migration ${file}:`, err);
      throw err;
    }
  }
}
