import { v4 as uuidv4 } from 'uuid';
import { listCodes, createCode, updateCode, deleteCode } from '../dao/codesDao.js';

export default function codesService(pool) {
  return {
    list: (filters) => listCodes(pool, filters),
    create: (data) => createCode(pool, { id: uuidv4(), ...data }),
    update: (id, userId, patch) => updateCode(pool, id, userId, patch),
    remove: (id, userId) => deleteCode(pool, id, userId),
  };
}
