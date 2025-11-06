import { v4 as uuidv4 } from 'uuid';
import { listFiles, getFile, createFile, updateFile, deleteFile } from '../dao/filesDao.js';

export default function filesService(pool) {
  return {
    list: (filters) => listFiles(pool, filters),
    get: (id) => getFile(pool, id),
    create: ({ filename, content, projectId }) => createFile(pool, { id: uuidv4(), filename, content, projectId }),
    update: (id, patch) => updateFile(pool, id, patch),
    remove: (id) => deleteFile(pool, id),
  };
}
