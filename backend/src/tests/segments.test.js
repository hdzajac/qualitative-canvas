import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { app, init } from '../app.js';
import pool from '../db/pool.js';
import { deleteMediaDeep } from './testCleanup.js';

let mediaId; let projectId; let segmentId1; let segmentId2; let participantId;

async function insertSegment({ id, idx, startMs, endMs, text, participantId: pid }) {
  await pool.query(
    `INSERT INTO transcript_segments (id, media_file_id, idx, start_ms, end_ms, text, participant_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, mediaId, idx, startMs, endMs, text, pid ?? null]
  );
}

beforeAll(async () => {
  await init();
  // Create project
  const proj = await request(app).post('/api/projects').send({ name: 'SegProj' });
  expect(proj.status).toBe(201);
  projectId = proj.body.id;
  // Upload media
  const res = await request(app)
    .post('/api/media')
    .attach('file', Buffer.from('dummy'), 'dummy.txt')
    .field('projectId', projectId);
  expect(res.status).toBe(201);
  mediaId = res.body.id;
  // Seed two segments
  segmentId1 = uuidv4();
  segmentId2 = uuidv4();
  await insertSegment({ id: segmentId1, idx: 0, startMs: 0, endMs: 1000, text: 'Hello' });
  await insertSegment({ id: segmentId2, idx: 1, startMs: 1000, endMs: 2000, text: 'World' });
  // Create a participant
  participantId = uuidv4();
  await pool.query(
    `INSERT INTO participants (id, media_file_id, name) VALUES ($1,$2,$3)`,
    [participantId, mediaId, 'Speaker 1']
  );
});

afterAll(async () => {
  await deleteMediaDeep(mediaId);
});

describe('Segments retrieval & update', () => {
  it('lists segments for a media file', async () => {
    const res = await request(app).get(`/api/media/${mediaId}/segments`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    const ids = res.body.map(s => s.id);
    expect(ids).toContain(segmentId1);
    expect(ids).toContain(segmentId2);
  });

  it('updates segment text and participant', async () => {
    const res = await request(app)
      .put(`/api/media/${mediaId}/segments/${segmentId1}`)
      .send({ text: 'Hello updated', participantId });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: segmentId1, text: 'Hello updated', participantId });
  });
});
