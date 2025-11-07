import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';
import { listSegmentsForMedia, getSegment, updateSegment, replaceSegmentsBulk } from '../dao/segmentsDao.js';
import { getMedia } from '../dao/mediaDao.js';

export default function segmentsRoutes(pool) {
  const router = Router({ mergeParams: true });

  // List segments for a media file
  router.get('/', asyncHandler(async (req, res) => {
    const mediaId = req.params.mediaId;
    const media = await getMedia(pool, mediaId);
    if (!media) return res.status(404).json({ error: 'Media not found' });
    const list = await listSegmentsForMedia(pool, mediaId);
    res.json(list);
  }));

  // Update a segment's text or participant
  router.put('/:segmentId', asyncHandler(async (req, res) => {
    const schema = z.object({ text: z.string().min(1).optional(), participantId: z.string().uuid().nullable().optional() });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const seg = await getSegment(pool, req.params.segmentId);
    if (!seg || seg.mediaFileId !== req.params.mediaId) return res.status(404).json({ error: 'Segment not found' });
    const updated = await updateSegment(pool, seg.id, parsed.data);
    res.json(updated);
  }));

  // Bulk replace segments (e.g., from worker)
  router.post('/bulk', asyncHandler(async (req, res) => {
    const mediaId = req.params.mediaId;
    const schema = z.object({
      segments: z.array(z.object({
        id: z.string().uuid().optional(),
        idx: z.number().int().min(0),
        startMs: z.number().int().min(0),
        endMs: z.number().int().min(0),
        text: z.string().min(1),
        participantId: z.string().uuid().nullable().optional(),
      })).min(0),
      replace: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const media = await getMedia(pool, mediaId);
    if (!media) return res.status(404).json({ error: 'Media not found' });
    const withIds = parsed.data.segments.map((s) => ({ id: s.id || crypto.randomUUID(), ...s }));
    const result = await replaceSegmentsBulk(pool, mediaId, withIds);
    res.status(201).json({ count: result.length });
  }));

  return router;
}
