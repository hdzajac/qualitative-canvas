import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, init } from '../app.js';
import pool from '../db/pool.js';
import { createTestUser } from './testAuth.js';

let authCookie;

beforeAll(async () => {
  await init();
  ({ cookie: authCookie } = await createTestUser());
});

afterAll(async () => {
  // pool.end() would tear down the shared pool — omit to allow other test files to reuse it
});

describe('Metrics endpoint', () => {
  it('returns metrics JSON', async () => {
    const res = await request(app).get('/api/metrics').set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('jobs');
    expect(res.body).toHaveProperty('media');
    expect(typeof res.body.segments).toBe('number');
    expect(typeof res.body.participants).toBe('number');
  });
});
