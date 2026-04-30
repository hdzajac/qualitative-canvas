import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';
import themesService from '../services/themesService.js';
import { emitEntityChanged } from '../services/projectEvents.js';

export default function themesRoutes(pool) {
  const router = Router();
  const service = themesService(pool);

  const map = (r) => ({
    id: r.id,
    name: r.name,
    highlightIds: r.code_ids || [],
    position: r.position || undefined,
    size: r.size || undefined,
    style: r.style || undefined,
    createdAt: r.created_at.toISOString(),
  });

  const CreateSchema = z.object({
    name: z.string().min(1).max(256),
    projectId: z.string().uuid().optional(),
    codeIds: z.array(z.string().uuid()).optional(),
    highlightIds: z.array(z.string().uuid()).optional(),
    position: z.any().optional(),
    size: z.any().optional(),
    style: z.any().optional(),
  });
  const UpdateSchema = z.object({
    name: z.string().min(1).max(256).optional(),
    projectId: z.string().uuid().optional(),
    codeIds: z.array(z.string().uuid()).optional(),
    highlightIds: z.array(z.string().uuid()).optional(),
    position: z.any().optional(),
    size: z.any().optional(),
    style: z.any().optional(),
    ifUnmodifiedSince: z.string().datetime().optional(),
  });

  router.get('/', asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    const list = await service.list({ projectId });
    res.json(list);
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const parsed = CreateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const created = await service.create(parsed.data);
    res.status(201).json(created);
    emitEntityChanged(created.projectId, 'themes');
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const parsed = UpdateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const updated = await service.update(id, req.user.id, parsed.data);
    if (!updated) {
      const exists = await pool.query('SELECT id FROM themes WHERE id = $1', [id]);
      if (!exists.rows[0]) return res.status(404).json({ error: 'Not found' });
      return res.status(409).json({ error: 'Conflict', message: 'Modified by another user. Refresh and try again.' });
    }
    res.json(updated);
    emitEntityChanged(updated.projectId, 'themes');
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const projectId = await service.remove(id, req.user.id);
    if (!projectId) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
    emitEntityChanged(projectId, 'themes');
  }));

  return router;
}
