import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';
import { getMedia } from '../dao/mediaDao.js';
import { listParticipants, createParticipant, updateParticipant, deleteParticipant } from '../dao/participantsDao.js';

export default function participantsRoutes(pool) {
  const router = Router({ mergeParams: true });

  // List participants for a media file
  router.get('/', asyncHandler(async (req, res) => {
    const mediaId = req.params.mediaId;
    const media = await getMedia(pool, mediaId);
    if (!media) return res.status(404).json({ error: 'Media not found' });
    const list = await listParticipants(pool, mediaId);
    res.json(list);
  }));

  // Create participant
  router.post('/', asyncHandler(async (req, res) => {
    const schema = z.object({ name: z.string().min(1), canonicalKey: z.string().optional(), color: z.string().optional() });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const mediaId = req.params.mediaId;
    const media = await getMedia(pool, mediaId);
    if (!media) return res.status(404).json({ error: 'Media not found' });
    const created = await createParticipant(pool, { mediaFileId: mediaId, ...parsed.data });
    res.status(201).json(created);
  }));

  // Update participant
  router.put('/:participantId', asyncHandler(async (req, res) => {
    const schema = z.object({ name: z.string().min(1).optional(), canonicalKey: z.string().optional(), color: z.string().optional() });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const updated = await updateParticipant(pool, req.params.participantId, parsed.data);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  }));

  // Delete participant (segments referencing it will have participant_id set to NULL by FK rule)
  router.delete('/:participantId', asyncHandler(async (req, res) => {
    await deleteParticipant(pool, req.params.participantId);
    res.status(204).send();
  }));

  return router;
}
