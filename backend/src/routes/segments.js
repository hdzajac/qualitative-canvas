import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';
import { listSegmentsForMedia, getSegment, updateSegment, replaceSegmentsBulk, countSegmentsForMedia, assignParticipantToSegments } from '../dao/segmentsDao.js';
import { getMedia } from '../dao/mediaDao.js';
import { randomUUID } from 'crypto';

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

  // Lightweight count endpoint (avoids pulling thousands of segments just to gate UI buttons)
  router.get('/count', asyncHandler(async (req, res) => {
    const mediaId = req.params.mediaId;
    const media = await getMedia(pool, mediaId);
    if (!media) return res.status(404).json({ error: 'Media not found' });
    const count = await countSegmentsForMedia(pool, mediaId);
    res.json({ count });
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
    if (!parsed.success) {
      console.error('[segments bulk] validation error', parsed.error.message, JSON.stringify(req.body).slice(0,600));
      return res.status(400).json({ error: parsed.error.message });
    }
    if (parsed.data.segments.length > 5000) {
      console.error('[segments bulk] too many segments', parsed.data.segments.length);
      return res.status(400).json({ error: 'Too many segments (limit 5000)' });
    }
    const media = await getMedia(pool, mediaId);
    if (!media) {
      console.error('[segments bulk] media not found', mediaId);
      return res.status(404).json({ error: 'Media not found' });
    }
    const withIds = parsed.data.segments.map((s) => ({ id: s.id || randomUUID(), ...s }));
    try {
      const result = await replaceSegmentsBulk(pool, mediaId, withIds);
      res.status(201).json({ count: result.length });
    } catch (e) {
      console.error('[segments bulk] DB error', e.message, e.stack?.split('\n').slice(0,5).join('\n'));
      return res.status(500).json({ error: 'Bulk insert failed' });
    }
  }));

  // Bulk assign participant to segments by IDs and/or time range
  router.post('/assign-participant', asyncHandler(async (req, res) => {
    const mediaId = req.params.mediaId;
    const schema = z.object({
      participantId: z.string().uuid().nullable(), // null clears assignment
      segmentIds: z.array(z.string().uuid()).optional(),
      startMs: z.number().int().min(0).optional(),
      endMs: z.number().int().min(0).optional(),
    }).refine((v) => (v.segmentIds && v.segmentIds.length) || v.startMs != null || v.endMs != null, {
      message: 'Provide segmentIds or a time range to target segments',
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const media = await getMedia(pool, mediaId);
    if (!media) return res.status(404).json({ error: 'Media not found' });
    try {
      const out = await assignParticipantToSegments(pool, mediaId, parsed.data);
      res.json({ updated: out.updated });
    } catch (e) {
      console.error('[segments assign-participant] error', e);
      res.status(500).json({ error: 'Assignment failed' });
    }
  }));

  return router;
}
