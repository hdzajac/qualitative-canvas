import { v4 as uuidv4 } from 'uuid';
import { listThemes, createTheme, updateTheme, deleteTheme } from '../dao/themesDao.js';

export default function themesService(pool) {
  return {
    list: (filters) => listThemes(pool, filters),
    create: (data) => createTheme(pool, { id: uuidv4(), ...data }),
    update: (id, userId, patch) => updateTheme(pool, id, userId, patch),
    remove: (id, userId) => deleteTheme(pool, id, userId),
  };
}
