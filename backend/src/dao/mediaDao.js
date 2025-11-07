import fs from 'fs/promises';
import path from 'path';

export function mapMedia(r) {
  return {
    id: r.id,
    projectId: r.project_id ?? undefined,
    originalFilename: r.original_filename,
    mimeType: r.mime_type ?? undefined,
    storagePath: r.storage_path,
    sizeBytes: r.size_bytes ?? undefined,
    durationSec: r.duration_sec ?? undefined,
    status: r.status,
    errorMessage: r.error_message ?? undefined,
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
  };
}

export async function listMedia(pool, { projectId } = {}) {
  if (projectId) {
    const r = await pool.query('SELECT * FROM media_files WHERE project_id = $1 ORDER BY created_at DESC', [projectId]);
    return r.rows.map(mapMedia);
  }
  const r = await pool.query('SELECT * FROM media_files ORDER BY created_at DESC');
  return r.rows.map(mapMedia);
}

export async function getMedia(pool, id) {
  const r = await pool.query('SELECT * FROM media_files WHERE id = $1', [id]);
  return r.rows[0] ? mapMedia(r.rows[0]) : null;
}

export async function createMedia(pool, { id, projectId, originalFilename, mimeType, storagePath, sizeBytes }) {
  const r = await pool.query(
    `INSERT INTO media_files (id, project_id, original_filename, mime_type, storage_path, size_bytes, status)
     VALUES ($1,$2,$3,$4,$5,$6,'uploaded') RETURNING *`,
    [id, projectId ?? null, originalFilename, mimeType ?? null, storagePath, sizeBytes ?? null]
  );
  return mapMedia(r.rows[0]);
}

export async function updateMedia(pool, id, patch) {
  const { status, errorMessage, durationSec } = patch;
  const r = await pool.query(
    `UPDATE media_files
     SET status = COALESCE($2, status),
         error_message = COALESCE($3, error_message),
         duration_sec = COALESCE($4, duration_sec)
     WHERE id = $1 RETURNING *`,
    [id, status ?? null, errorMessage ?? null, durationSec ?? null]
  );
  return r.rows[0] ? mapMedia(r.rows[0]) : null;
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export function getMediaDir() {
  const env = process.env.MEDIA_DIR;
  return env && env.trim() ? env : path.resolve(process.cwd(), 'data', 'media');
}
