import { v4 as uuidv4 } from 'uuid';
import { listAnnotations, createAnnotation, updateAnnotation, deleteAnnotation } from '../dao/annotationsDao.js';

export default function annotationsService(pool) {
  return {
    list: (filters) => listAnnotations(pool, filters),
    create: (data) => createAnnotation(pool, { id: uuidv4(), ...data }),
    update: (id, patch) => updateAnnotation(pool, id, patch),
    remove: (id) => deleteAnnotation(pool, id),
  };
}
