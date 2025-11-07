import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, init } from '../app.js';
import pool from '../db/pool.js';

beforeAll(async () => {
  await init();
});

afterAll(async () => {
  await pool.end();
});

describe('Metrics endpoint', () => {
  it('returns metrics JSON', async () => {
    const res = await request(app).get('/api/metrics');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('jobs');
    expect(res.body).toHaveProperty('media');
    expect(typeof res.body.segments).toBe('number');
    expect(typeof res.body.participants).toBe('number');
  });
});
