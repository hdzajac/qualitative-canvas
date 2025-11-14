import { v4 as uuidv4 } from 'uuid';
import { listFiles, getFile, createFile, updateFile, deleteFile } from '../dao/filesDao.js';

export default function filesService(pool) {
  return {
    list: (filters) => listFiles(pool, filters),
    get: (id) => getFile(pool, id),
    async create({ filename, content, projectId }) {
      const file = await createFile(pool, { id: uuidv4(), filename, content, projectId });
      // Create file entry for this document so it can be coded
      const { ensureFileEntryForDocument } = await import('../dao/fileEntriesDao.js');
      await ensureFileEntryForDocument(pool, file.id);
      return file;
    },
    update: (id, patch) => updateFile(pool, id, patch),
    remove: (id) => deleteFile(pool, id),
  };
}
