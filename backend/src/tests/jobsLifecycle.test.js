/**
 * jobsLifecycle.test.js
 *
 * Integration tests for the transcription-job lifecycle routes:
 *   PATCH /transcribe-jobs/:id/progress   — H3: JOIN returns projectId; SSE fires
 *   POST  /transcribe-jobs/:id/complete   — M3: post-commit SSE emit; returns status=done
 *   POST  /transcribe-jobs/:id/error      — M3: post-commit SSE emit; returns status=error
 *
 * Each describe block creates its own job via a helper so tests are independent.
 * subscribeToProject is used directly to assert SSE events without an HTTP SSE connection.
 */
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { app, init } from '../app.js';
import { deleteMediaDeep } from './testCleanup.js';
import { createTestUser } from './testAuth.js';
import { subscribeToProject } from '../services/projectEvents.js';

// Must match WORKER_SECRET in backend/.env.test
const WORKER_SECRET = 'test-worker-secret';

let projectId;
let mediaId;
let authCookie;

// IDs of extra media files created inline during tests so they are cleaned up
const extraMediaIds = [];

beforeAll(async () => {
  await init();
  ({ cookie: authCookie } = await createTestUser());
  const proj = await request(app)
    .post('/api/projects')
    .set('Cookie', authCookie)
    .send({ name: 'LifecycleProj' });
  projectId = proj.body.id;
  const media = await request(app)
    .post('/api/media')
    .set('Cookie', authCookie)
    .attach('file', Buffer.from('fake audio'), { filename: 'audio.txt' })
    .field('projectId', projectId);
  mediaId = media.body.id;
});

afterAll(async () => {
  await deleteMediaDeep([mediaId, ...extraMediaIds]);
});

/**
 * Create a queued job for mediaId then immediately lease it (moves to 'processing').
 * Returns the leased job object.
 */
async function createAndLeaseJob(targetMediaId = mediaId) {
  await request(app)
    .post(`/api/media/${targetMediaId}/transcribe`)
    .set('Cookie', authCookie)
    .send({});
  const lease = await request(app)
    .post('/api/transcribe-jobs/lease')
    .set('X-Worker-Secret', WORKER_SECRET);
  expect(lease.status).toBe(200);
  // If we get someone else's job it means a previous test left a queued job behind.
  // Fail here with a clear diagnostic rather than letting the wrong projectId/mediaFileId
  // propagate to unrelated assertions further down.
  expect(lease.body.mediaFileId).toBe(targetMediaId);
  return lease.body;
}

// ---------------------------------------------------------------------------
// Progress PATCH
// ---------------------------------------------------------------------------

describe('Job progress PATCH', () => {
  let jobId;

  beforeAll(async () => {
    const job = await createAndLeaseJob();
    jobId = job.id;
  });

  it('returns updated job with processedMs, totalMs, and etaSeconds', async () => {
    const res = await request(app)
      .patch(`/api/transcribe-jobs/${jobId}/progress`)
      .set('X-Worker-Secret', WORKER_SECRET)
      .send({ processedMs: 10000, totalMs: 60000, etaSeconds: 100 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: jobId, processedMs: 10000, totalMs: 60000, etaSeconds: 100 });
  });

  it('returns projectId on the updated job (H3 — setJobProgress JOIN)', async () => {
    // projectId is populated via the media_files JOIN in setJobProgress DAO.
    // If the JOIN is missing, projectId would be undefined.
    const res = await request(app)
      .patch(`/api/transcribe-jobs/${jobId}/progress`)
      .set('X-Worker-Secret', WORKER_SECRET)
      .send({ processedMs: 15000 });
    expect(res.status).toBe(200);
    expect(res.body.projectId).toBe(projectId);
  });

  it('emits a job-progress SSE event after progress PATCH', async () => {
    let received = null;
    const unsub = subscribeToProject(projectId, (msg) => { received = msg; });

    await request(app)
      .patch(`/api/transcribe-jobs/${jobId}/progress`)
      .set('X-Worker-Secret', WORKER_SECRET)
      .send({ processedMs: 20000 });

    unsub();
    expect(received).toMatchObject({ type: 'job-progress', mediaFileId: mediaId });
  });

  it('returns 404 for an unknown job id', async () => {
    const res = await request(app)
      .patch(`/api/transcribe-jobs/${uuidv4()}/progress`)
      .set('X-Worker-Secret', WORKER_SECRET)
      .send({ processedMs: 1000 });
    expect(res.status).toBe(404);
  });

  it('returns 400 when processedMs is negative', async () => {
    const res = await request(app)
      .patch(`/api/transcribe-jobs/${jobId}/progress`)
      .set('X-Worker-Secret', WORKER_SECRET)
      .send({ processedMs: -1 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when totalMs is zero', async () => {
    // totalMs must be positive (> 0) per the Zod schema
    const res = await request(app)
      .patch(`/api/transcribe-jobs/${jobId}/progress`)
      .set('X-Worker-Secret', WORKER_SECRET)
      .send({ totalMs: 0 });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Complete
// ---------------------------------------------------------------------------

describe('Job complete', () => {
  let jobId;

  beforeAll(async () => {
    const job = await createAndLeaseJob();
    jobId = job.id;
  });

  it('marks job as done and returns the updated job', async () => {
    const res = await request(app)
      .post(`/api/transcribe-jobs/${jobId}/complete`)
      .set('X-Worker-Secret', WORKER_SECRET);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: jobId, status: 'done' });
    // completedAt must be set after a successful complete
    expect(res.body.completedAt).toBeTruthy();
  });

  it('emits a job-progress SSE event after complete (M3 — post-commit emit)', async () => {
    // Use a fresh job so the previous complete() call does not interfere
    const freshJob = await createAndLeaseJob();
    let received = null;
    const unsub = subscribeToProject(projectId, (msg) => { received = msg; });

    await request(app)
      .post(`/api/transcribe-jobs/${freshJob.id}/complete`)
      .set('X-Worker-Secret', WORKER_SECRET);

    unsub();
    // SSE event must carry the correct mediaFileId so the frontend can
    // invalidate only the relevant latestJob query
    expect(received).toMatchObject({ type: 'job-progress', mediaFileId: mediaId });
  });

  it('returns 404 for an unknown job id', async () => {
    const res = await request(app)
      .post(`/api/transcribe-jobs/${uuidv4()}/complete`)
      .set('X-Worker-Secret', WORKER_SECRET);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Fail
// ---------------------------------------------------------------------------

describe('Job fail', () => {
  let jobId;

  beforeAll(async () => {
    const job = await createAndLeaseJob();
    jobId = job.id;
  });

  it('marks job as error and echoes the error message', async () => {
    const res = await request(app)
      .post(`/api/transcribe-jobs/${jobId}/error`)
      .set('X-Worker-Secret', WORKER_SECRET)
      .send({ errorMessage: 'Transcription model OOM' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: jobId, status: 'error', errorMessage: 'Transcription model OOM' });
    expect(res.body.completedAt).toBeTruthy();
  });

  it('emits a job-progress SSE event after fail (M3 — post-commit emit)', async () => {
    const freshJob = await createAndLeaseJob();
    let received = null;
    const unsub = subscribeToProject(projectId, (msg) => { received = msg; });

    await request(app)
      .post(`/api/transcribe-jobs/${freshJob.id}/error`)
      .set('X-Worker-Secret', WORKER_SECRET)
      .send({ errorMessage: 'SSE fail test' });

    unsub();
    expect(received).toMatchObject({ type: 'job-progress', mediaFileId: mediaId });
  });

  it('returns 400 when errorMessage is missing', async () => {
    const freshJob = await createAndLeaseJob();
    const res = await request(app)
      .post(`/api/transcribe-jobs/${freshJob.id}/error`)
      .set('X-Worker-Secret', WORKER_SECRET)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when errorMessage is empty string', async () => {
    const freshJob = await createAndLeaseJob();
    const res = await request(app)
      .post(`/api/transcribe-jobs/${freshJob.id}/error`)
      .set('X-Worker-Secret', WORKER_SECRET)
      .send({ errorMessage: '' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown job id', async () => {
    const res = await request(app)
      .post(`/api/transcribe-jobs/${uuidv4()}/error`)
      .set('X-Worker-Secret', WORKER_SECRET)
      .send({ errorMessage: 'not found test' });
    expect(res.status).toBe(404);
  });
});
