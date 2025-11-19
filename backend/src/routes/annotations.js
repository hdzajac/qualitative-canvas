import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';
import annotationsService from '../services/annotationsService.js';

export default function annotationsRoutes(pool) {
  const router = Router();
  const service = annotationsService(pool);

  const map = (r) => ({ id: r.id, content: r.content, position: r.position, size: r.size || undefined, style: r.style || undefined, createdAt: r.created_at.toISOString(), projectId: r.project_id ?? undefined });

  const PositionSchema = z.object({ x: z.number(), y: z.number() });
  const CreateSchema = z.object({ content: z.string(), position: PositionSchema, projectId: z.string().uuid().optional(), size: z.any().optional(), style: z.any().optional() });
  const UpdateSchema = z.object({ content: z.string().optional(), position: PositionSchema.optional(), size: z.any().optional(), style: z.any().optional() });

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
