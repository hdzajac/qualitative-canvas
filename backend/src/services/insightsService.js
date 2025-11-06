import { v4 as uuidv4 } from 'uuid';
import { listInsights, createInsight, updateInsight, deleteInsight } from '../dao/insightsDao.js';

export default function insightsService(pool) {
  return {
    list: (filters) => listInsights(pool, filters),
    create: (data) => createInsight(pool, { id: uuidv4(), ...data }),
    update: (id, patch) => updateInsight(pool, id, patch),
    remove: (id) => deleteInsight(pool, id),
  };
}
