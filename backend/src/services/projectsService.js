import { v4 as uuidv4 } from 'uuid';
import { listProjects, listProjectsForUser, getProject, createProject, updateProject, deleteProject } from '../dao/projectsDao.js';

export default function projectsService(pool) {
  return {
    list: () => listProjects(pool),
    listForUser: (userId) => listProjectsForUser(pool, userId),
    get: (id) => getProject(pool, id),
    create: (data) => createProject(pool, { id: uuidv4(), ...data }),
    createForUser: async (data, userId) => {
      const project = await createProject(pool, { id: uuidv4(), ...data, ownerId: userId });
      // Insert the creator as owner in project_members
      await pool.query(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES ($1,$2,'owner')
         ON CONFLICT DO NOTHING`,
        [project.id, userId]
      );
      return project;
    },
    update: (id, patch) => updateProject(pool, id, patch),
    remove: (id) => deleteProject(pool, id),
  };
}

