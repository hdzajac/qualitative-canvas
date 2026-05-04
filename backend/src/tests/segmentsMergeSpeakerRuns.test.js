import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { app, init } from '../app.js';
import pool from '../db/pool.js';
import { deleteMediaDeep } from './testCleanup.js';
import { createTestUser } from './testAuth.js';

let mediaId; let projectId; let p1Id; let p2Id; let authCookie;

async function insertSegments(segs) {
  for (const s of segs) {
    await pool.query(
      `INSERT INTO transcript_segments (id, media_file_id, idx, start_ms, end_ms, text, participant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [s.id ?? uuidv4(), mediaId, s.idx, s.startMs, s.endMs, s.text, s.participantId ?? null]
    );
  }
}

beforeAll(async () => {
  await init();
  ({ cookie: authCookie } = await createTestUser());
  const proj = await request(app).post('/api/projects').set('Cookie', authCookie).send({ name: 'MergeRunsProj' });
  projectId = proj.body.id;
  const upload = await request(app)
    .post('/api/media')
    .set('Cookie', authCookie)
    .attach('file', Buffer.from('merge runs test'), 'merge.txt')
    .field('projectId', projectId);
  mediaId = upload.body.id;

  // Create two participants directly
  p1Id = uuidv4();
  p2Id = uuidv4();
  await pool.query(`INSERT INTO participants (id, media_file_id, name) VALUES ($1,$2,$3)`, [p1Id, mediaId, 'Alice']);
  await pool.query(`INSERT INTO participants (id, media_file_id, name) VALUES ($1,$2,$3)`, [p2Id, mediaId, 'Bob']);
});

afterAll(async () => {
  await deleteMediaDeep(mediaId);
});

describe('merge-speaker-runs', () => {
  it('returns 0 merged when no segments exist', async () => {
    // Ensure clean slate
    await pool.query('DELETE FROM transcript_segments WHERE media_file_id = $1', [mediaId]);
    const res = await request(app)
      .post(`/api/media/${mediaId}/segments/merge-speaker-runs`)
      .set('Cookie', authCookie)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ before: 0, merged: 0 });
  });

  it('merges consecutive same-speaker segments within gap threshold', async () => {
    await pool.query('DELETE FROM transcript_segments WHERE media_file_id = $1', [mediaId]);
    // p1: 0–500, p1: 600–1200 (gap 100ms < 800 default) → should merge into one
    // p2: 1200–2000
    await insertSegments([
      { idx: 0, startMs: 0,    endMs: 500,  text: 'Hello',   participantId: p1Id },
      { idx: 1, startMs: 600,  endMs: 1200, text: 'world',   participantId: p1Id },
      { idx: 2, startMs: 1200, endMs: 2000, text: 'Goodbye', participantId: p2Id },
    ]);

    const res = await request(app)
      .post(`/api/media/${mediaId}/segments/merge-speaker-runs`)
      .set('Cookie', authCookie)
      .send({ gapThresholdMs: 800 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ before: 3, merged: 2 });

    const list = await request(app).get(`/api/media/${mediaId}/segments`).set('Cookie', authCookie);
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(2);
    const merged = list.body.find(s => s.participantId === p1Id);
    expect(merged).toBeTruthy();
    expect(merged.text).toContain('Hello');
    expect(merged.text).toContain('world');
  });

  it('does not merge segments whose gap exceeds gapThresholdMs', async () => {
    await pool.query('DELETE FROM transcript_segments WHERE media_file_id = $1', [mediaId]);
    // p1: 0–500, p1: 2000–3000 (gap 1500ms > 800 default) → should NOT merge
    await insertSegments([
      { idx: 0, startMs: 0,    endMs: 500,  text: 'A', participantId: p1Id },
      { idx: 1, startMs: 2000, endMs: 3000, text: 'B', participantId: p1Id },
    ]);

    const res = await request(app)
      .post(`/api/media/${mediaId}/segments/merge-speaker-runs`)
      .set('Cookie', authCookie)
      .send({ gapThresholdMs: 800 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ before: 2, merged: 2 }); // no reduction

    const list = await request(app).get(`/api/media/${mediaId}/segments`).set('Cookie', authCookie);
    expect(list.body.length).toBe(2);
  });

  it('does not merge across different speakers even within gap threshold', async () => {
    await pool.query('DELETE FROM transcript_segments WHERE media_file_id = $1', [mediaId]);
    // p1 then p2 then p1, all close together → no merges across speaker boundary
    await insertSegments([
      { idx: 0, startMs: 0,   endMs: 400,  text: 'P1 first', participantId: p1Id },
      { idx: 1, startMs: 400, endMs: 800,  text: 'P2 mid',   participantId: p2Id },
      { idx: 2, startMs: 800, endMs: 1200, text: 'P1 last',  participantId: p1Id },
    ]);

    const res = await request(app)
      .post(`/api/media/${mediaId}/segments/merge-speaker-runs`)
      .set('Cookie', authCookie)
      .send({ gapThresholdMs: 800 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ before: 3, merged: 3 }); // no reduction

    const list = await request(app).get(`/api/media/${mediaId}/segments`).set('Cookie', authCookie);
    expect(list.body.length).toBe(3);
  });

  it('does not merge a run that would exceed maxDurationMs', async () => {
    await pool.query('DELETE FROM transcript_segments WHERE media_file_id = $1', [mediaId]);
    // Two p1 segments that together span 35s, maxDurationMs = 30000 → should not merge
    await insertSegments([
      { idx: 0, startMs: 0,     endMs: 20000, text: 'Long A', participantId: p1Id },
      { idx: 1, startMs: 20000, endMs: 35000, text: 'Long B', participantId: p1Id },
    ]);

    const res = await request(app)
      .post(`/api/media/${mediaId}/segments/merge-speaker-runs`)
      .set('Cookie', authCookie)
      .send({ gapThresholdMs: 800, maxDurationMs: 30000 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ before: 2, merged: 2 }); // not merged

    const list = await request(app).get(`/api/media/${mediaId}/segments`).set('Cookie', authCookie);
    expect(list.body.length).toBe(2);
  });

  it('merges unassigned (null participant) consecutive segments', async () => {
    await pool.query('DELETE FROM transcript_segments WHERE media_file_id = $1', [mediaId]);
    await insertSegments([
      { idx: 0, startMs: 0,   endMs: 500,  text: 'Anon A', participantId: null },
      { idx: 1, startMs: 500, endMs: 1000, text: 'Anon B', participantId: null },
      { idx: 2, startMs: 1000, endMs: 1500, text: 'Assigned', participantId: p1Id },
    ]);

    const res = await request(app)
      .post(`/api/media/${mediaId}/segments/merge-speaker-runs`)
      .set('Cookie', authCookie)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ before: 3, merged: 2 });

    const list = await request(app).get(`/api/media/${mediaId}/segments`).set('Cookie', authCookie);
    expect(list.body.length).toBe(2);
    const anon = list.body.find(s => !s.participantId);
    expect(anon).toBeTruthy();
    expect(anon.text).toContain('Anon A');
    expect(anon.text).toContain('Anon B');
  });

  it('returns 400 for invalid gapThresholdMs', async () => {
    const res = await request(app)
      .post(`/api/media/${mediaId}/segments/merge-speaker-runs`)
      .set('Cookie', authCookie)
      .send({ gapThresholdMs: -1 });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown media id', async () => {
    const res = await request(app)
      .post(`/api/media/${uuidv4()}/segments/merge-speaker-runs`)
      .set('Cookie', authCookie)
      .send({});
    expect(res.status).toBe(404);
  });
});
