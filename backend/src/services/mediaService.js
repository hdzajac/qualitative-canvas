import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { createMedia, getMedia, listMedia, updateMedia, ensureDir, getMediaDir } from '../dao/mediaDao.js';

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
  };
}
