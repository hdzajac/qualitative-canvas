import { v4 as uuidv4 } from 'uuid';
import { listProjects, getProject, createProject, updateProject, deleteProject } from '../dao/projectsDao.js';

export default function projectsService(pool) {
  return {
    list: () => listProjects(pool),
    get: (id) => getProject(pool, id),
    create: (data) => createProject(pool, { id: uuidv4(), ...data }),
    update: (id, patch) => updateProject(pool, id, patch),
    remove: (id) => deleteProject(pool, id),
  };
}
