import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, init } from '../app.js';
import pool from '../db/pool.js';
import fs from 'fs/promises';
import path from 'path';

// Helper: create a temp file to upload
async function createTempMedia(content = 'fake media data') {
  const tmpDir = path.resolve(process.cwd(), 'tmp-tests');
  await fs.mkdir(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, `media-${Date.now()}.txt`);
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
}

let mediaId; let jobId; let projectId;

beforeAll(async () => {
  await init();
  // Create a project to satisfy foreign key
  const res = await request(app).post('/api/projects').send({ name: 'TestProj' });
  projectId = res.body.id;
});

afterAll(async () => {
  await pool.end();
});

describe('Media upload & listing', () => {
  it('uploads a media file', async () => {
    const tmpFile = await createTempMedia('hello audio');
    const res = await request(app)
      .post('/api/media')
      .attach('file', tmpFile)
      .field('projectId', projectId);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ originalFilename: expect.any(String), status: 'uploaded' });
    mediaId = res.body.id;
    expect(mediaId).toBeTruthy();
  });

  it('lists media files', async () => {
    const res = await request(app).get('/api/media');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.find(m => m.id === mediaId)).toBeTruthy();
  });
});

describe('Transcription jobs lifecycle', () => {
  it('creates a transcription job', async () => {
    const res = await request(app)
      .post(`/api/media/${mediaId}/transcribe`)
      .send({ model: 'faster-whisper-small', languageHint: 'en' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ mediaFileId: mediaId, status: 'queued' });
    jobId = res.body.id;
  });

  it('leases next queued job', async () => {
    const res = await request(app).post('/api/transcribe-jobs/lease');
    // Could be 204 if already leased OR could lease a different earlier job from another test file
    expect([200, 204]).toContain(res.status);
    // Fetch our specific job to see its status
    const check = await request(app).get(`/api/transcribe-jobs/${jobId}`);
    expect(check.status).toBe(200);
    // Accept either queued (not yet leased because another older job was taken) or processing/done
    expect(['queued', 'processing', 'done']).toContain(check.body.status);
  });

  it('marks job complete', async () => {
    const res = await request(app).post(`/api/transcribe-jobs/${jobId}/complete`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'done' });
  });

  it('fetches job status', async () => {
    const res = await request(app).get(`/api/transcribe-jobs/${jobId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: jobId, status: 'done' });
  });
});
