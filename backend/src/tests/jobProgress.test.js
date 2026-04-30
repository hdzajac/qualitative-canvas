import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, init } from '../app.js';
import pool from '../db/pool.js';
import { deleteMediaDeep } from './testCleanup.js';
import { createTestUser } from './testAuth.js';

let projectId; let mediaId; let jobId; let authCookie;

beforeAll(async () => {
  await init();
  ({ cookie: authCookie } = await createTestUser());
  const proj = await request(app).post('/api/projects').set('Cookie', authCookie).send({ name: 'ProgressProj' });
  projectId = proj.body.id;
  const media = await request(app)
    .post('/api/media')
    .set('Cookie', authCookie)
    .attach('file', Buffer.from('fake audio data'), { filename: 'audio.txt' })
    .field('projectId', projectId);
  mediaId = media.body.id;
  const job = await request(app).post(`/api/media/${mediaId}/transcribe`).set('Cookie', authCookie).send({});
  jobId = job.body.id;
});

afterAll(async () => {
  await deleteMediaDeep(mediaId);
});

describe('Job progress API', () => {
  it('patches progress fields', async () => {
    const patch = await request(app)
      .patch(`/api/transcribe-jobs/${jobId}/progress`)
      .set('Cookie', authCookie)
      .send({ processedMs: 5000, totalMs: 60000, etaSeconds: 120 });
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({ processedMs: 5000, totalMs: 60000, etaSeconds: 120 });
  });

  it('retrieves latest job for media', async () => {
    const latest = await request(app).get(`/api/media/${mediaId}/latest-job`).set('Cookie', authCookie);
    expect(latest.status).toBe(200);
    expect(latest.body).toMatchObject({ id: jobId });
  });

  it('validates bad payload', async () => {
    const bad = await request(app)
      .patch(`/api/transcribe-jobs/${jobId}/progress`)
      .set('Cookie', authCookie)
      .send({ processedMs: -1 });
    expect(bad.status).toBe(400);
  });
});
