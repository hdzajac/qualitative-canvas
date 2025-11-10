import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';
import multer from 'multer';
import mediaServiceFactory from '../services/mediaService.js';
import transcriptsServiceFactory from '../services/transcriptsService.js';

const upload = multer({ dest: '/tmp' });

export default function mediaRoutes(pool) {
  const router = Router();
  const mediaService = mediaServiceFactory(pool);
  const transcriptsService = transcriptsServiceFactory(pool);

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

  // Raw content download (for worker). Streams the stored file.
  router.get('/:id/download', asyncHandler(async (req, res) => {
    const item = await mediaService.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    const fs = await import('fs');
    const stream = fs.createReadStream(item.storagePath);
    stream.on('error', (e) => {
      console.error('Download stream error', e);
      res.status(500).end();
    });
    res.setHeader('Content-Type', item.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${item.originalFilename}"`);
    stream.pipe(res);
  }));

  router.post('/', upload.single('file'), asyncHandler(async (req, res) => {
    const schema = z.object({ projectId: z.string().uuid() });
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

  router.delete('/:id', asyncHandler(async (req, res) => {
    const force = req.query.force === '1' || req.query.force === 'true';
    try {
      const ok = await mediaService.remove(req.params.id, { force });
      if (!ok) return res.status(404).json({ error: 'Not found' });
      return res.status(204).send();
    } catch (e) {
      if (e.message.includes('processing')) {
        return res.status(409).json({ error: e.message, hint: 'Retry with ?force=1 to override.' });
      }
      console.error('Delete media error', e);
      return res.status(500).json({ error: 'Delete failed' });
    }
  }));

  // Finalization status
  router.get('/:id/finalized', asyncHandler(async (req, res) => {
    const mapping = await transcriptsService.getFinalized(req.params.id);
    if (!mapping) return res.status(404).json({ error: 'Not finalized' });
    res.json(mapping);
  }));

  // Finalize transcript (idempotent). Requires media status === 'done'.
  router.post('/:id/finalize', asyncHandler(async (req, res) => {
    const media = await mediaService.get(req.params.id);
    if (!media) return res.status(404).json({ error: 'Media not found' });
    if (media.status !== 'done') {
      return res.status(409).json({ error: `Media status ${media.status} is not done` });
    }
    try {
      const mapping = await transcriptsService.finalize(req.params.id);
      // If already existed, finalize() returns existing mapping (idempotent). Distinguish status code.
      const statusCode = mapping && mapping.originalSegmentCount ? 201 : 200; // simplistic
      res.status(statusCode).json(mapping);
    } catch (e) {
      console.error('Finalize transcript error', e);
      res.status(500).json({ error: 'Finalize failed' });
    }
  }));

  return router;
}
