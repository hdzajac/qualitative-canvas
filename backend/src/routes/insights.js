import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';
import insightsService from '../services/insightsService.js';

export default function insightsRoutes(pool) {
  const router = Router();
  const service = insightsService(pool);

  const CreateSchema = z.object({
    name: z.string().min(1).max(256),
    themeIds: z.array(z.string().uuid()).optional(),
    position: z.any().optional(),
    expanded: z.boolean().optional(),
    size: z.any().optional(),
    style: z.any().optional(),
  });
  const UpdateSchema = z.object({
    name: z.string().min(1).max(256).optional(),
    themeIds: z.array(z.string().uuid()).optional(),
    position: z.any().optional(),
    expanded: z.boolean().optional(),
    size: z.any().optional(),
    style: z.any().optional(),
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
