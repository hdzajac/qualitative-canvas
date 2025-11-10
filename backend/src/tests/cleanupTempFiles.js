import fs from 'fs/promises';
import path from 'path';

// Remove tmp-tests artifacts
export async function cleanupTempTestMedia() {
  const tmpDir = path.resolve(process.cwd(), 'tmp-tests');
  try {
    const st = await fs.stat(tmpDir).catch(() => null);
    if (!st || !st.isDirectory()) return;
    const entries = await fs.readdir(tmpDir);
    await Promise.all(entries.map(e => fs.rm(path.join(tmpDir, e), { force: true, recursive: true }))).catch(() => {});
    await fs.rmdir(tmpDir).catch(() => {});
  } catch (e) {
    console.error('[test cleanup] Failed to clean tmp-tests:', e.message);
  }
}

// Remove media files created during tests (status='uploaded' and created recently within this test run)
// We avoid deleting any older pre-existing media by checking created_at threshold captured when tests start.
export async function cleanupEphemeralMedia(pool, sinceTimestamp) {
  try {
    // Select candidate media IDs created after test start.
    const { rows } = await pool.query(
      `SELECT id, storage_path FROM media_files WHERE created_at >= $1 AND status IN ('uploaded','error','done','processing')`,
      [sinceTimestamp]
    );
    for (const row of rows) {
      // Attempt DB delete (will cascade segments/participants).
      await pool.query('DELETE FROM media_files WHERE id = $1', [row.id]);
      if (row.storage_path) {
        await fs.unlink(row.storage_path).catch(() => {});
      }
    }
  } catch (e) {
    console.error('[test cleanup] Failed to clean data/media files:', e.message);
  }
}
