import fs from 'fs/promises';
import pool from '../db/pool.js';

/**
 * Remove a media file (DB + underlying storage) and any associated transcript/generated files.
 * Accepts a single mediaId or array. Ignores failures gracefully so tests don't fail on cleanup.
 */
export async function deleteMediaDeep(mediaIds) {
  const ids = Array.isArray(mediaIds) ? mediaIds : [mediaIds];
  for (const id of ids) {
    if (!id) continue;
    try {
      // Get storage path before deletion
      const res = await pool.query('SELECT storage_path FROM media_files WHERE id = $1', [id]);
      const storagePath = res.rows[0]?.storage_path;
      await pool.query('DELETE FROM media_files WHERE id = $1', [id]);
      if (storagePath) {
        await fs.unlink(storagePath).catch(() => {});
      }
    } catch (e) {
      // swallow
    }
  }
}

/**
 * Delete file records (created by finalize) by id or list.
 */
export async function deleteFiles(fileIds) {
  const ids = Array.isArray(fileIds) ? fileIds : [fileIds];
  for (const id of ids) {
    if (!id) continue;
    try {
      await pool.query('DELETE FROM files WHERE id = $1', [id]);
    } catch (e) {
      // swallow
    }
  }
}
