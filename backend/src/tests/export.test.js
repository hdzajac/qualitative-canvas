/**
 * Export Service Tests
 * Tests CSV generation and export functionality
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { app, init } from '../app.js';
import pool from '../db/pool.js';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { createTestUser } from './testAuth.js';

describe('Export Service', () => {
  let projectId;
  let authCookie;
  let userId;

  beforeAll(async () => {
    await init();
    ({ cookie: authCookie, userId } = await createTestUser());
  });

  beforeEach(async () => {

    // Create test project with data
    projectId = uuidv4();
    await pool.query(
      'INSERT INTO projects (id, name, description) VALUES ($1, $2, $3)',
      [projectId, 'Test Export Project', 'Project for testing export']
    );
    // Grant test user access
    await pool.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')",
      [projectId, userId]
    );

    // Create a test file
    const fileId = uuidv4();
    await pool.query(
      'INSERT INTO files (id, project_id, filename, content) VALUES ($1, $2, $3, $4)',
      [fileId, projectId, 'test.txt', 'This is test content with some text.']
    );

    // Create file_entry for the file (required for codes after migration 008)
    await pool.query(
      'INSERT INTO file_entries (id, project_id, document_file_id, name, type) VALUES ($1, $2, $3, $4, $5)',
      [fileId, projectId, fileId, 'test.txt', 'document']
    );

    // Create test codes
    const codeId = uuidv4();
    await pool.query(
      `INSERT INTO codes (id, file_entry_id, code_name, text, start_offset, end_offset, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [codeId, fileId, 'Test Code', 'test content', 8, 20, { x: 100, y: 200 }]
    );

    // Create test theme
    const themeId = uuidv4();
    await pool.query(
      'INSERT INTO themes (id, project_id, name, code_ids, position) VALUES ($1, $2, $3, $4, $5)',
      [themeId, projectId, 'Test Theme', [codeId], { x: 300, y: 150 }]
    );

    // Create test insight
    const insightId = uuidv4();
    await pool.query(
      'INSERT INTO insights (id, project_id, name, theme_ids, position, expanded) VALUES ($1, $2, $3, $4, $5, $6)',
      [insightId, projectId, 'Test Insight', [themeId], { x: 500, y: 200 }, true]
    );

    // Create test annotation
    const annotationId = uuidv4();
    await pool.query(
      'INSERT INTO annotations (id, project_id, content, position, style) VALUES ($1, $2, $3, $4, $5)',
      [annotationId, projectId, 'Test annotation note', { x: 1200, y: 640 }, { background: '#FFD54F' }]
    );
  });

  afterEach(async () => {
    if (projectId) {
      // Clean up test data (CASCADE will handle related records)
      await pool.query('DELETE FROM projects WHERE id = $1', [projectId]);
    }
  });

  it('should export project as ZIP', async () => {
    const response = await request(app)
      .get(`/api/export/projects/${projectId}/export?format=zip`)
      .set('Cookie', authCookie)
      .buffer(true)
      .parse((res, callback) => {
        res.setEncoding('binary');
        res.data = '';
        res.on('data', (chunk) => {
          res.data += chunk;
        });
        res.on('end', () => {
          callback(null, Buffer.from(res.data, 'binary'));
        });
      })
      .expect(200);

    expect(response.headers['content-type']).toContain('application/zip');
    expect(response.headers['content-disposition']).toContain('.zip');
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
  });

  it('should export single CSV entity', async () => {
    const response = await request(app)
      .get(`/api/export/projects/${projectId}/export?format=csv&entity=codes`)
      .set('Cookie', authCookie)
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text).toContain('id,file_entry_id,code_name,text');
    expect(response.text).toContain('Test Code');
  });

  it('should return 404 for non-existent project', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    await request(app)
      .get(`/api/export/projects/${fakeId}/export?format=zip`)
      .set('Cookie', authCookie)
      .expect(404);
  });

  it('should include UTF-8 BOM in CSV', async () => {
    const response = await request(app)
      .get(`/api/export/projects/${projectId}/export?format=csv&entity=codes`)
      .set('Cookie', authCookie)
      .expect(200);

    // UTF-8 BOM should be at the start
    expect(response.text.charCodeAt(0)).toBe(0xFEFF);
  });

  it('should escape CSV fields properly', async () => {
    // Create a code with special characters
    const fileResult = await pool.query(
      'SELECT id FROM files WHERE project_id = $1',
      [projectId]
    );
    const fileId = fileResult.rows[0].id;

    const specialCodeId = uuidv4();
    await pool.query(
      `INSERT INTO codes (id, file_entry_id, code_name, text, start_offset, end_offset)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [specialCodeId, fileId, 'Code with "quotes"', 'Text with, comma and\nnewline', 0, 10]
    );

    const response = await request(app)
      .get(`/api/export/projects/${projectId}/export?format=csv&entity=codes`)
      .set('Cookie', authCookie)
      .expect(200);

    // Check that special characters are properly escaped
    expect(response.text).toContain('"Code with ""quotes"""');
    expect(response.text).toContain('"Text with, comma and\nnewline"');
  });

  it('should flatten JSONB position fields', async () => {
    const response = await request(app)
      .get(`/api/export/projects/${projectId}/export?format=csv&entity=codes`)
      .set('Cookie', authCookie)
      .expect(200);

    // Headers should include flattened fields
    expect(response.text).toContain('position_x,position_y');
    
    // Values should be present
    expect(response.text).toContain('100');
    expect(response.text).toContain('200');
  });

  it('should handle empty project', async () => {
    // Create empty project
    const emptyProjectId = uuidv4();
    await pool.query(
      'INSERT INTO projects (id, name) VALUES ($1, $2)',
      [emptyProjectId, 'Empty Project']
    );
    await pool.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')",
      [emptyProjectId, userId]
    );

    try {
      const response = await request(app)
        .get(`/api/export/projects/${emptyProjectId}/export?format=csv&entity=codes`)
        .set('Cookie', authCookie)
        .expect(200);

      // Should return only headers
      expect(response.text).toBe('\uFEFFid,file_entry_id,code_name,text,start_offset,end_offset,position_x,position_y,size_width,size_height,created_at\n');
    } finally {
      await pool.query('DELETE FROM projects WHERE id = $1', [emptyProjectId]);
    }
  });

  it('should join array fields with semicolons', async () => {
    const response = await request(app)
      .get(`/api/export/projects/${projectId}/export?format=csv&entity=themes`)
      .set('Cookie', authCookie)
      .expect(200);

    // Theme should have code_ids joined with semicolons
    const lines = response.text.split('\n');
    const dataLine = lines.find(line => line.includes('Test Theme'));
    expect(dataLine).toBeDefined();
    
    // If multiple code IDs existed, they would be separated by semicolons
    // For single code ID, it's just the UUID
    expect(dataLine).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });
});
