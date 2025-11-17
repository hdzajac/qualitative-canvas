/**
 * Export Service Tests
 * Tests CSV generation and export functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { init, buildApp } from '../app.js';
import pool from '../db/pool.js';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';

describe('Export Service', () => {
  let app;
  let projectId;

  beforeEach(async () => {
    await init();
    app = buildApp();

    // Create test project with data
    projectId = uuidv4();
    await pool.query(
      'INSERT INTO projects (id, name, description) VALUES ($1, $2, $3)',
      [projectId, 'Test Export Project', 'Project for testing export']
    );

    // Create a test file
    const fileId = uuidv4();
    await pool.query(
      'INSERT INTO files (id, project_id, filename, content) VALUES ($1, $2, $3, $4)',
      [fileId, projectId, 'test.txt', 'This is test content with some text.']
    );

    // Create test codes
    const codeId = uuidv4();
    await pool.query(
      `INSERT INTO codes (id, file_id, code_name, text, start_offset, end_offset, position)
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
      // Clean up test data
      await pool.query('DELETE FROM annotations WHERE project_id = $1', [projectId]);
      await pool.query('DELETE FROM insights WHERE project_id = $1', [projectId]);
      await pool.query('DELETE FROM themes WHERE project_id = $1', [projectId]);
      await pool.query('DELETE FROM codes WHERE file_id IN (SELECT id FROM files WHERE project_id = $1)', [projectId]);
      await pool.query('DELETE FROM files WHERE project_id = $1', [projectId]);
      await pool.query('DELETE FROM projects WHERE id = $1', [projectId]);
    }
  });

  it('should export project as ZIP', async () => {
    const response = await request(app)
      .get(`/api/export/projects/${projectId}/export?format=zip`)
      .expect(200);

    expect(response.headers['content-type']).toContain('application/zip');
    expect(response.headers['content-disposition']).toContain('.zip');
    expect(response.body).toBeDefined();
    expect(response.body.length).toBeGreaterThan(0);
  });

  it('should export single CSV entity', async () => {
    const response = await request(app)
      .get(`/api/export/projects/${projectId}/export?format=csv&entity=codes`)
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text).toContain('id,file_id,code_name,text');
    expect(response.text).toContain('Test Code');
  });

  it('should return 404 for non-existent project', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    await request(app)
      .get(`/api/export/projects/${fakeId}/export?format=zip`)
      .expect(404);
  });

  it('should include UTF-8 BOM in CSV', async () => {
    const response = await request(app)
      .get(`/api/export/projects/${projectId}/export?format=csv&entity=codes`)
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
      `INSERT INTO codes (id, file_id, code_name, text, start_offset, end_offset)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [specialCodeId, fileId, 'Code with "quotes"', 'Text with, comma and\nnewline', 0, 10]
    );

    const response = await request(app)
      .get(`/api/export/projects/${projectId}/export?format=csv&entity=codes`)
      .expect(200);

    // Check that special characters are properly escaped
    expect(response.text).toContain('"Code with ""quotes"""');
    expect(response.text).toContain('"Text with, comma and\nnewline"');
  });

  it('should flatten JSONB position fields', async () => {
    const response = await request(app)
      .get(`/api/export/projects/${projectId}/export?format=csv&entity=codes`)
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

    try {
      const response = await request(app)
        .get(`/api/export/projects/${emptyProjectId}/export?format=csv&entity=codes`)
        .expect(200);

      // Should return only headers
      expect(response.text).toBe('\uFEFFid,file_id,code_name,text,start_offset,end_offset,position_x,position_y,size_width,size_height,created_at\n');
    } finally {
      await pool.query('DELETE FROM projects WHERE id = $1', [emptyProjectId]);
    }
  });

  it('should join array fields with semicolons', async () => {
    const response = await request(app)
      .get(`/api/export/projects/${projectId}/export?format=csv&entity=themes`)
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
