import { beforeAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { app, init } from '../app.js';

let mediaId; let projectId; let jobId;

beforeAll(async () => {
  await init();
  const proj = await request(app).post('/api/projects').send({ name: 'BulkProj' });
  projectId = proj.body.id;
  const upload = await request(app)
    .post('/api/media')
    .attach('file', Buffer.from('dummybulk'), 'dummy.txt')
    .field('projectId', projectId);
  mediaId = upload.body.id;
  const job = await request(app)
    .post(`/api/media/${mediaId}/transcribe`)
    .send({ model: 'test-model' });
  jobId = job.body.id;
});

describe('Bulk segment insert', () => {
  it('replaces segments via bulk endpoint', async () => {
    const segs = [
      { idx: 0, startMs: 0, endMs: 500, text: 'One' },
      { idx: 1, startMs: 500, endMs: 1200, text: 'Two' },
      { idx: 2, startMs: 1200, endMs: 2000, text: 'Three' },
    ];
    const res = await request(app)
      .post(`/api/media/${mediaId}/segments/bulk`)
      .send({ segments: segs });
    expect(res.status).toBe(201);
    expect(res.body.count).toBe(3);
    const list = await request(app).get(`/api/media/${mediaId}/segments`);
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(3);
    expect(list.body[1]).toMatchObject({ idx: 1, text: 'Two' });
  });
});
