/**
 * VTT Export API Tests
 * Tests the VTT export endpoint to catch column name and other bugs
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import pool from '../db/pool.js';

describe('VTT Export API', () => {
  let testProjectId;
  let testMediaId;
  let testMediaIdNoTranscript;
  let testParticipantId;

  beforeAll(async () => {
    // Create test project
    const projectResult = await pool.query(
      'INSERT INTO projects (id, name) VALUES (gen_random_uuid(), $1) RETURNING id',
      ['VTT Test Project']
    );
    testProjectId = projectResult.rows[0].id;

    // Create test media file with transcript
    const mediaResult = await pool.query(
      `INSERT INTO media_files (id, project_id, original_filename, mime_type, storage_path, size_bytes, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6) RETURNING id`,
      [testProjectId, 'interview.m4a', 'audio/mp4', '/tmp/interview.m4a', 2048, 'done']
    );
    testMediaId = mediaResult.rows[0].id;

    // Create media without transcript
    const mediaResult2 = await pool.query(
      `INSERT INTO media_files (id, project_id, original_filename, mime_type, storage_path, size_bytes, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6) RETURNING id`,
      [testProjectId, 'empty.m4a', 'audio/mp4', '/tmp/empty.m4a', 1024, 'uploaded']
    );
    testMediaIdNoTranscript = mediaResult2.rows[0].id;

    // Create test participant
    const participantResult = await pool.query(
      `INSERT INTO participants (id, media_file_id, name, color)
       VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id`,
      [testMediaId, 'John Doe', '#ff5733']
    );
    testParticipantId = participantResult.rows[0].id;

    // Create test transcript segments with and without participants
    await pool.query(
      `INSERT INTO transcript_segments (id, media_file_id, participant_id, idx, start_ms, end_ms, text)
       VALUES 
       (gen_random_uuid(), $1, NULL, 0, 0, 2500, 'Welcome to the interview.'),
       (gen_random_uuid(), $1, $2, 1, 2500, 5000, 'Thank you for having me.'),
       (gen_random_uuid(), $1, NULL, 2, 5000, 8000, 'Let''s begin with the first question.')`,
      [testMediaId, testParticipantId]
    );
  });

  afterAll(async () => {
    // Cleanup
    if (testProjectId) {
      await pool.query('DELETE FROM projects WHERE id = $1', [testProjectId]);
    }
  });

  describe('GET /api/export/media/:mediaId/transcript/vtt', () => {
    it('should export VTT using correct column name original_filename', async () => {
      const res = await request(app)
        .get(`/api/export/media/${testMediaId}/transcript/vtt`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/vtt');
      expect(res.headers['content-disposition']).toContain('interview.vtt');
    });

    it('should generate valid WebVTT content', async () => {
      const res = await request(app)
        .get(`/api/export/media/${testMediaId}/transcript/vtt`);

      expect(res.status).toBe(200);
      expect(res.text).toContain('WEBVTT');
      expect(res.text).toContain('Welcome to the interview.');
      expect(res.text).toContain('Thank you for having me.');
      expect(res.text).toContain('Let\'s begin with the first question.');
    });

    it('should include participant voice tags in tagged format', async () => {
      const res = await request(app)
        .get(`/api/export/media/${testMediaId}/transcript/vtt`)
        .query({ format: 'tagged' });

      expect(res.status).toBe(200);
      expect(res.text).toContain('<v John Doe>Thank you for having me.</v>');
      expect(res.text).toContain('<v Speaker>Welcome to the interview.</v>');
    });

    it('should include participant names without tags in plain format', async () => {
      const res = await request(app)
        .get(`/api/export/media/${testMediaId}/transcript/vtt`)
        .query({ format: 'plain' });

      expect(res.status).toBe(200);
      expect(res.text).toContain('[John Doe] Thank you for having me.');
      expect(res.text).not.toContain('<v ');
    });

    it('should include proper timestamps', async () => {
      const res = await request(app)
        .get(`/api/export/media/${testMediaId}/transcript/vtt`);

      expect(res.status).toBe(200);
      expect(res.text).toContain('00:00:00.000 --> 00:00:02.500');
      expect(res.text).toContain('00:00:02.500 --> 00:00:05.000');
      expect(res.text).toContain('00:00:05.000 --> 00:00:08.000');
    });

    it('should return 404 for non-existent media', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/export/media/${fakeId}/transcript/vtt`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Media file not found');
    });

    it('should return 404 for media without transcript', async () => {
      const res = await request(app)
        .get(`/api/export/media/${testMediaIdNoTranscript}/transcript/vtt`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('No transcript found for this media file');
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await request(app)
        .get('/api/export/media/not-a-uuid/transcript/vtt');

      expect(res.status).toBe(400);
    });

    it('should handle special characters in text', async () => {
      // Create segment with special characters
      const mediaResult = await pool.query(
        `INSERT INTO media_files (id, project_id, original_filename, mime_type, storage_path, size_bytes, status)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6) RETURNING id`,
        [testProjectId, 'special.m4a', 'audio/mp4', '/tmp/special.m4a', 1024, 'done']
      );
      const specialMediaId = mediaResult.rows[0].id;

      await pool.query(
        `INSERT INTO transcript_segments (id, media_file_id, idx, start_ms, end_ms, text)
         VALUES (gen_random_uuid(), $1, 0, 0, 1000, $2)`,
        [specialMediaId, 'Text with "quotes" and \nnewlines']
      );

      const res = await request(app)
        .get(`/api/export/media/${specialMediaId}/transcript/vtt`);

      expect(res.status).toBe(200);
      expect(res.text).toContain('WEBVTT');
    });
  });
});
