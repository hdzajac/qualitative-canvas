/**
 * workerAuth.test.js
 *
 * Tests the requireWorkerOrAuth middleware and the isWorkerRequest rate-limit
 * skip logic in app.js. Covers:
 *   - Valid X-Worker-Secret bypasses JWT auth on worker routes
 *   - Missing credentials → 401
 *   - Wrong secret → 401
 *   - Placeholder secret ('REPLACE_WITH_RANDOM_WORKER_SECRET') → 401
 *   - UI cookie still works on worker-accessible routes
 */
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, init } from '../app.js';
import { deleteMediaDeep } from './testCleanup.js';
import { createTestUser } from './testAuth.js';

// Must match WORKER_SECRET in backend/.env.test
const WORKER_SECRET = 'test-worker-secret';

let projectId;
let mediaId;
let authCookie;

beforeAll(async () => {
  await init();
  ({ cookie: authCookie } = await createTestUser());
  const proj = await request(app)
    .post('/api/projects')
    .set('Cookie', authCookie)
    .send({ name: 'WorkerAuthProj' });
  projectId = proj.body.id;
  const media = await request(app)
    .post('/api/media')
    .set('Cookie', authCookie)
    .attach('file', Buffer.from('fake audio'), { filename: 'audio.txt' })
    .field('projectId', projectId);
  mediaId = media.body.id;
});

afterAll(async () => {
  await deleteMediaDeep(mediaId);
});

describe('Worker authentication — requireWorkerOrAuth', () => {
  it('allows worker to hit lease endpoint with valid X-Worker-Secret', async () => {
    // 200 = leased a job; 204 = no queued job — both mean auth passed
    const res = await request(app)
      .post('/api/transcribe-jobs/lease')
      .set('X-Worker-Secret', WORKER_SECRET);
    expect([200, 204]).toContain(res.status);
  });

  it('allows worker to patch progress with valid X-Worker-Secret', async () => {
    // Create a job, lease it, then patch progress
    const job = await request(app)
      .post(`/api/media/${mediaId}/transcribe`)
      .set('Cookie', authCookie)
      .send({});
    expect(job.status).toBe(201);
    const leased = await request(app)
      .post('/api/transcribe-jobs/lease')
      .set('X-Worker-Secret', WORKER_SECRET);
    expect(leased.status).toBe(200);
    const jobId = leased.body.id;

    const res = await request(app)
      .patch(`/api/transcribe-jobs/${jobId}/progress`)
      .set('X-Worker-Secret', WORKER_SECRET)
      .send({ processedMs: 1000 });
    expect(res.status).toBe(200);
  });

  it('allows authenticated UI user to call lease endpoint via cookie', async () => {
    const res = await request(app)
      .post('/api/transcribe-jobs/lease')
      .set('Cookie', authCookie);
    expect([200, 204]).toContain(res.status);
  });

  it('returns 401 when no credentials are provided', async () => {
    const res = await request(app).post('/api/transcribe-jobs/lease');
    expect(res.status).toBe(401);
  });

  it('returns 401 when X-Worker-Secret is incorrect', async () => {
    const res = await request(app)
      .post('/api/transcribe-jobs/lease')
      .set('X-Worker-Secret', 'wrong-secret');
    expect(res.status).toBe(401);
  });

  it('returns 401 when X-Worker-Secret is the placeholder value', async () => {
    // requireWorkerOrAuth explicitly rejects the unset placeholder to prevent
    // accidentally shipping with the default value in production.
    const res = await request(app)
      .post('/api/transcribe-jobs/lease')
      .set('X-Worker-Secret', 'REPLACE_WITH_RANDOM_WORKER_SECRET');
    expect(res.status).toBe(401);
  });
});
