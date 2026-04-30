import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, init } from '../app.js';
import pool from '../db/pool.js';
import { deleteMediaDeep } from './testCleanup.js';
import { createTestUser } from './testAuth.js';

let mediaId; let participantId; let projectId; let authCookie;

beforeAll(async () => {
  await init();
  ({ cookie: authCookie } = await createTestUser());
  const proj = await request(app).post('/api/projects').set('Cookie', authCookie).send({ name: 'PartProj' });
  projectId = proj.body.id;
  const upload = await request(app)
    .post('/api/media')
    .set('Cookie', authCookie)
    .attach('file', Buffer.from('participant media'), 'p.txt')
    .field('projectId', projectId);
  mediaId = upload.body.id;
});

afterAll(async () => {
  await deleteMediaDeep(mediaId);
});

describe('Participants CRUD', () => {
  it('creates a participant', async () => {
    const res = await request(app)
      .post(`/api/media/${mediaId}/participants`)
      .set('Cookie', authCookie)
      .send({ name: 'Speaker A', color: '#ff0000' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Speaker A', color: '#ff0000' });
    participantId = res.body.id;
  });

  it('lists participants', async () => {
    const res = await request(app).get(`/api/media/${mediaId}/participants`).set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.find(p => p.id === participantId)).toBeTruthy();
  });

  it('updates a participant', async () => {
    const res = await request(app)
      .put(`/api/media/${mediaId}/participants/${participantId}`)
      .set('Cookie', authCookie)
      .send({ name: 'Speaker Alpha' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: participantId, name: 'Speaker Alpha' });
  });

  it('deletes a participant', async () => {
    const res = await request(app)
      .delete(`/api/media/${mediaId}/participants/${participantId}`)
      .set('Cookie', authCookie);
    expect(res.status).toBe(204);
    const list = await request(app).get(`/api/media/${mediaId}/participants`).set('Cookie', authCookie);
    expect(list.body.find(p => p.id === participantId)).toBeFalsy();
  });
});
