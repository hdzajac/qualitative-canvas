/**
 * testAuth.js — Shared helper for obtaining a test user auth cookie.
 *
 * Call createTestUser() in beforeAll to sign up a fresh user and get:
 *   - cookie: the Set-Cookie header value to pass to .set('Cookie', cookie)
 *   - userId: the UUID of the created user (needed when inserting project_members directly)
 */

import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../app.js';

export async function createTestUser() {
  const email = `testuser.${uuidv4()}@ku.dk`;
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ email, password: 'TestPassword123!', displayName: 'Test User' });

  if (res.status !== 201) {
    throw new Error(`Test signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return {
    userId: res.body.id,
    cookie: res.headers['set-cookie'],
  };
}
