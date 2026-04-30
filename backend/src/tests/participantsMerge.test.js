import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, init } from '../app.js';
import { deleteMediaDeep } from './testCleanup.js';
import { createTestUser } from './testAuth.js';

let mediaId; let projectId; let p1; let p2; let authCookie;

beforeAll(async () => {
  await init();
  ({ cookie: authCookie } = await createTestUser());
  const proj = await request(app).post('/api/projects').set('Cookie', authCookie).send({ name: 'MergeProj' });
  projectId = proj.body.id;
  const upload = await request(app)
    .post('/api/media')
    .set('Cookie', authCookie)
    .attach('file', Buffer.from('merge test content'), 'merge.txt')
    .field('projectId', projectId);
  mediaId = upload.body.id;
});

describe('Participants merge', () => {
  it('creates participants and segments, assigns, then merges source into target', async () => {
    // Create two participants
    const a = await request(app).post(`/api/media/${mediaId}/participants`).set('Cookie', authCookie).send({ name: 'Speaker A' });
    const b = await request(app).post(`/api/media/${mediaId}/participants`).set('Cookie', authCookie).send({ name: 'Speaker B' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    p1 = a.body; p2 = b.body;
    // Insert segments
    const segs = [
      { idx: 0, startMs: 0, endMs: 500, text: 'One' },
      { idx: 1, startMs: 500, endMs: 1200, text: 'Two' },
      { idx: 2, startMs: 1200, endMs: 2000, text: 'Three' },
    ];
    const ins = await request(app).post(`/api/media/${mediaId}/segments/bulk`).set('Cookie', authCookie).send({ segments: segs });
    expect(ins.status).toBe(201);
    // Assign first two to p2, last to p1
    const asn1 = await request(app)
      .post(`/api/media/${mediaId}/segments/assign-participant`)
      .set('Cookie', authCookie)
      .send({ participantId: p2.id, startMs: 0, endMs: 1200 });
    expect(asn1.status).toBe(200);
    const asn2 = await request(app)
      .post(`/api/media/${mediaId}/segments/assign-participant`)
      .set('Cookie', authCookie)
      .send({ participantId: p1.id, startMs: 1200, endMs: 2000 });
    expect(asn2.status).toBe(200);

    // Verify counts pre-merge
    const preCounts = await request(app).get(`/api/media/${mediaId}/participants/segment-counts`).set('Cookie', authCookie);
    expect(preCounts.status).toBe(200);
    const c1 = preCounts.body.find(c => c.participantId === p1.id)?.count || 0;
    const c2 = preCounts.body.find(c => c.participantId === p2.id)?.count || 0;
    expect(c1).toBe(1);
    expect(c2).toBe(2);

    // Merge p2 -> p1
    const merge = await request(app).post(`/api/media/${mediaId}/participants/merge`).set('Cookie', authCookie).send({ sourceId: p2.id, targetId: p1.id });
    expect(merge.status).toBe(200);
    expect(merge.body).toMatchObject({ ok: true });

    // Verify source deleted and all segments belong to p1
    const list = await request(app).get(`/api/media/${mediaId}/participants`).set('Cookie', authCookie);
    expect(list.status).toBe(200);
    expect(list.body.find(p => p.id === p2.id)).toBeFalsy();

    const postCounts = await request(app).get(`/api/media/${mediaId}/participants/segment-counts`).set('Cookie', authCookie);
    expect(postCounts.status).toBe(200);
    const afterC1 = postCounts.body.find(c => c.participantId === p1.id)?.count || 0;
    expect(afterC1).toBe(3);
  });
});

afterAll(async () => {
  await deleteMediaDeep(mediaId);
});
