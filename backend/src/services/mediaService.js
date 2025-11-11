import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { createMedia, getMedia, listMedia, updateMedia, ensureDir, getMediaDir, deleteMedia } from '../dao/mediaDao.js';
import { getLatestJobForMedia } from '../dao/jobsDao.js';

export default function mediaService(pool) {
  return {
    list: (filters) => listMedia(pool, filters),
    get: (id) => getMedia(pool, id),
    async createFromUpload({ projectId, originalFilename, mimeType, tempPath, sizeBytes }) {
      const id = uuidv4();
      const baseDir = getMediaDir();
      await ensureDir(baseDir);
      const ext = path.extname(originalFilename || '').slice(0, 8) || '';
      const destPath = path.join(baseDir, `${id}${ext}`);
      // Move temp file into place
      const fs = await import('fs/promises');
      await fs.rename(tempPath, destPath);
      return createMedia(pool, { id, projectId, originalFilename, mimeType, storagePath: destPath, sizeBytes });
    },
    update: (id, patch) => updateMedia(pool, id, patch),
    async remove(id, { force } = {}) {
      const media = await getMedia(pool, id);
      if (!media) return false;
      if (media.status === 'processing' && !force) {
        throw new Error('Cannot delete media while processing (use force to override)');
      }
      // If forcing while processing, verify job age and mark job error to avoid orphaned processing state.
      if (force && media.status === 'processing') {
        const job = await getLatestJobForMedia(pool, media.id);
        if (job && job.status === 'processing') {
          // Mark job error; media will cascade delete afterwards
          try {
            await pool.query(`UPDATE transcription_jobs SET status = 'error', error_message = 'Force-deleted media', completed_at = now() WHERE id = $1`, [job.id]);
          } catch (e) {
            console.error('Failed to mark job error before force delete', e);
          }
        }
      }
      const storagePath = await deleteMedia(pool, id);
      if (storagePath) {
        try {
          const fs = await import('fs/promises');
          await fs.unlink(storagePath);
          console.log('[media] Unlinked file', storagePath);
        } catch (e) {
          console.error('[media] Failed to unlink media file', storagePath, e);
        }
      } else {
        console.warn('[media] No storage path returned for media delete id=', id);
      }
      return true;
    },
  };
}
