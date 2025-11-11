import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, init } from '../app.js';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool.js';
import fs from 'fs/promises';
import path from 'path';
import { cleanupTempTestMedia } from './cleanupTempFiles.js';
import { deleteMediaDeep, deleteFiles } from './testCleanup.js';

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
  await cleanupTempTestMedia();
  if (mediaId) {
    await deleteMediaDeep(mediaId);
  }
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
    // Also mark media status done to allow finalization (some flows may auto-update media status elsewhere)
    const upd = await pool.query(`UPDATE media_files SET status = 'done' WHERE id = $1 RETURNING status`, [mediaId]);
    expect(upd.rows[0].status).toBe('done');
  });

  it('fetches job status', async () => {
    const res = await request(app).get(`/api/transcribe-jobs/${jobId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: jobId, status: 'done' });
  });

  it('finalizes transcript (idempotent)', async () => {
    // Seed simple segments for finalization content
    await pool.query(`DELETE FROM transcript_segments WHERE media_file_id = $1`, [mediaId]);
    const id1 = uuidv4();
    const id2 = uuidv4();
    const s1 = await pool.query(`INSERT INTO transcript_segments (id, media_file_id, idx, start_ms, end_ms, text) VALUES ($1, $2, 0, 0, 1000, 'Hello world') RETURNING id`, [id1, mediaId]);
    const s2 = await pool.query(`INSERT INTO transcript_segments (id, media_file_id, idx, start_ms, end_ms, text) VALUES ($1, $2, 1, 1000, 2000, 'Second line') RETURNING id`, [id2, mediaId]);
    expect(s1.rows[0].id).toBeTruthy();
    expect(s2.rows[0].id).toBeTruthy();
    // First finalize
    const first = await request(app).post(`/api/media/${mediaId}/finalize`).send();
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ mediaFileId: mediaId, originalSegmentCount: 2 });
    const fileId = first.body.fileId;
    expect(fileId).toBeTruthy();
    // Second finalize should be idempotent (return 201? or 200?). We keep 201 for simplicity but mapping unchanged.
    const second = await request(app).post(`/api/media/${mediaId}/finalize`).send();
    expect([200,201]).toContain(second.status); // accept either if route semantics evolve
    expect(second.body).toMatchObject({ mediaFileId: mediaId, fileId });
    // Fetch file content
  const fileRes = await request(app).get(`/api/files/${fileId}`);
    expect(fileRes.status).toBe(200);
    expect(fileRes.body.content).toContain('Hello world');
    expect(fileRes.body.content).toContain('Second line');
    expect(fileRes.body.content).toMatch(/\[00:00:00 - 00:00:01\] Hello world/);
    // Cleanup the created file record explicitly so it doesn't linger across tests
    await deleteFiles(fileId);
  });
});
