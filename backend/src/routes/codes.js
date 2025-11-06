import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';
import codesService from '../services/codesService.js';

export default function codesRoutes(pool) {
  const router = Router();
  const service = codesService(pool);

  const map = (r) => ({
    id: r.id,
    fileId: r.file_id,
    startOffset: r.start_offset,
    endOffset: r.end_offset,
    text: r.text,
    codeName: r.code_name,
    position: r.position || undefined,
    size: r.size || undefined,
    style: r.style || undefined,
    createdAt: r.created_at.toISOString(),
  });

  const CreateSchema = z.object({
    fileId: z.string().uuid(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    text: z.string().min(1),
    codeName: z.string().min(1).max(256),
    position: z.any().optional(),
    size: z.any().optional(),
    style: z.any().optional(),
  });
  const UpdateSchema = z.object({
    startOffset: z.number().int().nonnegative().optional(),
    endOffset: z.number().int().nonnegative().optional(),
    text: z.string().min(1).optional(),
    codeName: z.string().min(1).max(256).optional(),
    position: z.any().optional(),
    size: z.any().optional(),
    style: z.any().optional(),
  });

  router.get('/', asyncHandler(async (req, res) => {
    const { fileId, projectId } = req.query;
    const list = await service.list({ fileId, projectId });
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
