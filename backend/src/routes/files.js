import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';
import filesService from '../services/filesService.js';

export default function filesRoutes(pool) {
  const router = Router();
  const service = filesService(pool);

  const CreateSchema = z.object({ filename: z.string().min(1).max(512), content: z.string(), projectId: z.string().uuid().optional() });
  const UpdateSchema = z.object({ filename: z.string().min(1).max(512).optional(), content: z.string().optional(), projectId: z.string().uuid().optional() });

  router.get('/', asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    const list = await service.list({ projectId });
    res.json(list);
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const file = await service.get(req.params.id);
    if (!file) return res.status(404).json({ error: 'Not found' });
    res.json(file);
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const parsed = CreateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const { filename, content, projectId } = parsed.data;
    const created = await service.create({ filename, content, projectId });
    res.status(201).json(created);
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const parsed = UpdateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const { filename, content, projectId } = parsed.data;
    const updated = await service.update(id, { filename, content, projectId });
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
