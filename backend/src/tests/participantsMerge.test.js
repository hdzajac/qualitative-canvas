import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
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

describe('assign-participant by segmentIds', () => {
  it('assigns a participant to specific segment ids', async () => {
    // Create fresh participants and segments for this test
    const pa = await request(app).post(`/api/media/${mediaId}/participants`).set('Cookie', authCookie).send({ name: 'Target' });
    const targetId = pa.body.id;
    const ins = await request(app).post(`/api/media/${mediaId}/segments/bulk`).set('Cookie', authCookie).send({
      segments: [
        { idx: 10, startMs: 5000, endMs: 5500, text: 'Seg A' },
        { idx: 11, startMs: 5500, endMs: 6000, text: 'Seg B' },
        { idx: 12, startMs: 6000, endMs: 6500, text: 'Seg C' },
      ],
    });
    expect(ins.status).toBe(201);
    const [segA, segB, segC] = ins.body;

    // Assign only segA and segC by id
    const res = await request(app)
      .post(`/api/media/${mediaId}/segments/assign-participant`)
      .set('Cookie', authCookie)
      .send({ participantId: targetId, segmentIds: [segA.id, segC.id] });
    expect(res.status).toBe(200);

    // Verify assignment: fetch segments and check
    const list = await request(app).get(`/api/media/${mediaId}/segments`).set('Cookie', authCookie);
    const updated = list.body.filter(s => s.id === segA.id || s.id === segC.id);
    const untouched = list.body.find(s => s.id === segB.id);
    for (const s of updated) {
      expect(s.participantId).toBe(targetId);
    }
    expect(untouched.participantId).toBeFalsy();
  });

  it('clears participant assignment when participantId is null', async () => {
    // Create a participant and a segment, assign, then clear
    const pb = await request(app).post(`/api/media/${mediaId}/participants`).set('Cookie', authCookie).send({ name: 'ToRemove' });
    const pbId = pb.body.id;
    const ins = await request(app).post(`/api/media/${mediaId}/segments/bulk`).set('Cookie', authCookie).send({
      segments: [{ idx: 20, startMs: 10000, endMs: 10500, text: 'Clearable' }],
    });
    const [seg] = ins.body;

    // Assign
    await request(app)
      .post(`/api/media/${mediaId}/segments/assign-participant`)
      .set('Cookie', authCookie)
      .send({ participantId: pbId, segmentIds: [seg.id] });

    // Clear by passing null
    const res = await request(app)
      .post(`/api/media/${mediaId}/segments/assign-participant`)
      .set('Cookie', authCookie)
      .send({ participantId: null, segmentIds: [seg.id] });
    expect(res.status).toBe(200);

    const list = await request(app).get(`/api/media/${mediaId}/segments`).set('Cookie', authCookie);
    const cleared = list.body.find(s => s.id === seg.id);
    expect(cleared.participantId).toBeFalsy();
  });

  it('returns 400 when neither segmentIds nor time range is provided', async () => {
    const res = await request(app)
      .post(`/api/media/${mediaId}/segments/assign-participant`)
      .set('Cookie', authCookie)
      .send({ participantId: uuidv4() });
    expect(res.status).toBe(400);
  });
});

afterAll(async () => {
  await deleteMediaDeep(mediaId);
});
