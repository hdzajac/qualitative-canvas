import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';
import projectsService from '../services/projectsService.js';

export default function projectsRoutes(pool) {
  const router = Router();
  const service = projectsService(pool);

  const CreateSchema = z.object({ name: z.string().min(1).max(256), description: z.string().max(2000).optional() });
  const UpdateSchema = z.object({ name: z.string().min(1).max(256).optional(), description: z.string().max(2000).optional() });

  router.get('/', asyncHandler(async (_req, res) => {
    const list = await service.list();
    res.json(list);
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const parsed = CreateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const created = await service.create(parsed.data);
    res.status(201).json(created);
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const parsed = UpdateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const updated = await service.update(id, parsed.data);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ok = await service.remove(id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  }));

  return router;
}
