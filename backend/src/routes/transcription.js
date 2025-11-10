import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';
import jobsServiceFactory from '../services/jobsService.js';

export default function transcriptionRoutes(pool) {
  const router = Router();
  const jobsService = jobsServiceFactory(pool);

  // Create a job for a given media file
  router.post('/media/:id/transcribe', asyncHandler(async (req, res) => {
    const schema = z.object({ model: z.string().optional(), languageHint: z.string().optional() });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const job = await jobsService.create(req.params.id, parsed.data);
    res.status(201).json(job);
  }));

  // Get a specific job
  router.get('/transcribe-jobs/:id', asyncHandler(async (req, res) => {
    const job = await jobsService.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    res.json(job);
  }));

  // Worker: lease next queued job (optional - used by worker process)
  router.post('/transcribe-jobs/lease', asyncHandler(async (_req, res) => {
    const job = await jobsService.leaseOne();
    if (!job) return res.status(204).send();
    res.json(job);
  }));

  // Worker: mark job complete
  router.post('/transcribe-jobs/:id/complete', asyncHandler(async (req, res) => {
    const job = await jobsService.complete(req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    res.json(job);
  }));

  // Worker: mark job failed
  router.post('/transcribe-jobs/:id/error', asyncHandler(async (req, res) => {
    const schema = z.object({ errorMessage: z.string().min(1) });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const job = await jobsService.fail(req.params.id, parsed.data.errorMessage);
    if (!job) return res.status(404).json({ error: 'Not found' });
    res.json(job);
  }));

  // Worker/UI: update job progress (processedMs / totalMs / etaSeconds)
  router.patch('/transcribe-jobs/:id/progress', asyncHandler(async (req, res) => {
    const schema = z.object({
      processedMs: z.number().int().nonnegative().optional(),
      totalMs: z.number().int().positive().optional(),
      etaSeconds: z.number().int().nonnegative().optional(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const job = await jobsService.progress(req.params.id, parsed.data);
    if (!job) return res.status(404).json({ error: 'Not found' });
    res.json(job);
  }));

  // Helper: latest job for a media file
  router.get('/media/:id/latest-job', asyncHandler(async (req, res) => {
    const job = await jobsService.getLatestForMedia(req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    res.json(job);
  }));

  return router;
}
