import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';
import multer from 'multer';
import mediaServiceFactory from '../services/mediaService.js';

const upload = multer({ dest: '/tmp' });

export default function mediaRoutes(pool) {
  const router = Router();
  const mediaService = mediaServiceFactory(pool);

  router.get('/', asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    const list = await mediaService.list({ projectId });
    res.json(list);
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const item = await mediaService.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  }));

  router.post('/', upload.single('file'), asyncHandler(async (req, res) => {
    const schema = z.object({ projectId: z.string().uuid().optional() });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'Missing file' });
    const created = await mediaService.createFromUpload({
      projectId: parsed.data.projectId,
      originalFilename: f.originalname,
      mimeType: f.mimetype,
      tempPath: f.path,
      sizeBytes: f.size,
    });
    res.status(201).json(created);
  }));

  return router;
}
