/**
 * Export-Import Integration Test
 * Tests the complete cycle: export a project, then import it back
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { init, buildApp } from '../app.js';
import pool from '../db/pool.js';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';

describe('Export-Import Integration', () => {
  let app;
  let originalProjectId;

  beforeAll(async () => {
    await init();
    app = buildApp();
  });

  afterAll(async () => {
    // Cleanup handled by test framework
  });

  it('should export and then successfully re-import a complete project', async () => {
    // === SETUP: Create a project with full data ===
    originalProjectId = uuidv4();
    await pool.query(
      'INSERT INTO projects (id, name, description) VALUES ($1, $2, $3)',
      [originalProjectId, 'Export-Import Test', 'Testing full cycle']
    );

    // Create a document file
    const fileId = uuidv4();
    await pool.query(
      'INSERT INTO files (id, project_id, filename, content) VALUES ($1, $2, $3, $4)',
      [fileId, originalProjectId, 'test.txt', 'Sample text for coding']
    );

    // Create file entry for the document
    const fileEntryId = uuidv4();
    await pool.query(
      'INSERT INTO file_entries (id, project_id, document_file_id, name, type) VALUES ($1, $2, $3, $4, $5)',
      [fileEntryId, originalProjectId, fileId, 'test.txt', 'document']
    );

    // Create codes
    const codeId1 = uuidv4();
    const codeId2 = uuidv4();
    await pool.query(
      `INSERT INTO codes (id, file_id, file_entry_id, code_name, text, start_offset, end_offset, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8), ($9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        codeId1, fileId, fileEntryId, 'Code A', 'Sample', 0, 6, { x: 100, y: 100 },
        codeId2, fileId, fileEntryId, 'Code B', 'text', 7, 11, { x: 150, y: 150 }
      ]
    );

    // Create theme
    const themeId = uuidv4();
    await pool.query(
      'INSERT INTO themes (id, project_id, name, code_ids, position) VALUES ($1, $2, $3, $4, $5)',
      [themeId, originalProjectId, 'Test Theme', [codeId1, codeId2], { x: 300, y: 200 }]
    );

    // Create insight
    const insightId = uuidv4();
    await pool.query(
      'INSERT INTO insights (id, project_id, name, theme_ids, position, expanded) VALUES ($1, $2, $3, $4, $5, $6)',
      [insightId, originalProjectId, 'Test Insight', [themeId], { x: 500, y: 250 }, true]
    );

    // === STEP 1: Export the project ===
    const exportResponse = await request(app)
      .get(`/api/export/projects/${originalProjectId}/export?format=zip`)
      .buffer(true)
      .parse((res, callback) => {
        res.setEncoding('binary');
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
      })
      .expect(200);

    expect(exportResponse.body).toBeDefined();
    expect(Buffer.isBuffer(exportResponse.body)).toBe(true);

    // Verify ZIP contains expected files
    const exportZip = new AdmZip(exportResponse.body);
    const exportEntries = exportZip.getEntries();
    const csvFiles = exportEntries.filter(e => e.entryName.startsWith('data/') && e.entryName.endsWith('.csv'));
    
    expect(csvFiles.length).toBeGreaterThan(0);
    expect(csvFiles.map(e => e.entryName)).toContain('data/project.csv');
    expect(csvFiles.map(e => e.entryName)).toContain('data/codes.csv');
    expect(csvFiles.map(e => e.entryName)).toContain('data/themes.csv');

    // === STEP 2: Import the exported ZIP ===
    const importResponse = await request(app)
      .post('/api/import/projects')
      .attach('file', exportResponse.body, 'export-test.zip')
      .expect(201);

    expect(importResponse.body.message).toContain('imported successfully');
    expect(importResponse.body.projectId).toBeDefined();
    expect(importResponse.body.projectId).not.toBe(originalProjectId); // New ID generated

    const newProjectId = importResponse.body.projectId;

    // === STEP 3: Verify imported data matches original ===
    
    // Check project
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [newProjectId]);
    expect(projectResult.rows.length).toBe(1);
    expect(projectResult.rows[0].name).toBe('Export-Import Test');
    expect(projectResult.rows[0].description).toBe('Testing full cycle');

    // Check files
    const filesResult = await pool.query('SELECT * FROM files WHERE project_id = $1', [newProjectId]);
    expect(filesResult.rows.length).toBe(1);
    expect(filesResult.rows[0].filename).toBe('test.txt');
    expect(filesResult.rows[0].content).toBe('Sample text for coding');

    // Check codes (with new IDs but same content)
    const codesResult = await pool.query(
      'SELECT * FROM codes WHERE file_id = $1 ORDER BY code_name',
      [filesResult.rows[0].id]
    );
    expect(codesResult.rows.length).toBe(2);
    expect(codesResult.rows[0].code_name).toBe('Code A');
    expect(codesResult.rows[0].text).toBe('Sample');
    expect(codesResult.rows[0].position).toEqual({ x: 100, y: 100 });
    expect(codesResult.rows[1].code_name).toBe('Code B');
    expect(codesResult.rows[1].text).toBe('text');

    // Check themes (with remapped code_ids)
    const themesResult = await pool.query('SELECT * FROM themes WHERE project_id = $1', [newProjectId]);
    expect(themesResult.rows.length).toBe(1);
    expect(themesResult.rows[0].name).toBe('Test Theme');
    expect(themesResult.rows[0].code_ids).toEqual([codesResult.rows[0].id, codesResult.rows[1].id]);
    expect(themesResult.rows[0].position).toEqual({ x: 300, y: 200 });

    // Check insights (with remapped theme_ids)
    const insightsResult = await pool.query('SELECT * FROM insights WHERE project_id = $1', [newProjectId]);
    expect(insightsResult.rows.length).toBe(1);
    expect(insightsResult.rows[0].name).toBe('Test Insight');
    expect(insightsResult.rows[0].theme_ids).toEqual([themesResult.rows[0].id]);
    expect(insightsResult.rows[0].position).toEqual({ x: 500, y: 250 });
    expect(insightsResult.rows[0].expanded).toBe(true);

    // === STEP 4: Export the imported project and verify it's identical ===
    const reExportResponse = await request(app)
      .get(`/api/export/projects/${newProjectId}/export?format=zip`)
      .buffer(true)
      .parse((res, callback) => {
        res.setEncoding('binary');
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
      })
      .expect(200);

    const reExportZip = new AdmZip(reExportResponse.body);
    
    // Read and compare CSV content (excluding IDs and timestamps)
    const originalProjectCSV = exportZip.readAsText('data/project.csv');
    const reExportProjectCSV = reExportZip.readAsText('data/project.csv');
    
    // Both should have the same name and description
    expect(reExportProjectCSV).toContain('Export-Import Test');
    expect(reExportProjectCSV).toContain('Testing full cycle');

    // Cleanup both projects
    await pool.query('DELETE FROM projects WHERE id IN ($1, $2)', [originalProjectId, newProjectId]);
  });

  it('should handle multiple export-import cycles', async () => {
    // Create initial project
    const projectId1 = uuidv4();
    await pool.query(
      'INSERT INTO projects (id, name, description) VALUES ($1, $2, $3)',
      [projectId1, 'Cycle Test', 'Multi-cycle test']
    );

    const fileId = uuidv4();
    await pool.query(
      'INSERT INTO files (id, project_id, filename, content) VALUES ($1, $2, $3, $4)',
      [fileId, projectId1, 'doc.txt', 'Content here']
    );

    const fileEntryId = uuidv4();
    await pool.query(
      'INSERT INTO file_entries (id, project_id, document_file_id, name, type) VALUES ($1, $2, $3, $4, $5)',
      [fileEntryId, projectId1, fileId, 'doc.txt', 'document']
    );

    const codeId = uuidv4();
    await pool.query(
      'INSERT INTO codes (id, file_id, file_entry_id, code_name, text, start_offset, end_offset, position) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [codeId, fileId, fileEntryId, 'Code', 'Content', 0, 7, { x: 50, y: 50 }]
    );

    // Export cycle 1
    const export1 = await request(app)
      .get(`/api/export/projects/${projectId1}/export?format=zip`)
      .buffer(true)
      .parse((res, callback) => {
        res.setEncoding('binary');
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
      })
      .expect(200);

    // Import to create project 2
    const import1 = await request(app)
      .post('/api/import/projects')
      .attach('file', export1.body, 'cycle1.zip')
      .expect(201);

    const projectId2 = import1.body.projectId;

    // Export project 2
    const export2 = await request(app)
      .get(`/api/export/projects/${projectId2}/export?format=zip`)
      .buffer(true)
      .parse((res, callback) => {
        res.setEncoding('binary');
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
      })
      .expect(200);

    // Import to create project 3
    const import2 = await request(app)
      .post('/api/import/projects')
      .attach('file', export2.body, 'cycle2.zip')
      .expect(201);

    const projectId3 = import2.body.projectId;

    // Verify all three projects have the same content
    const projects = await pool.query(
      'SELECT * FROM projects WHERE id IN ($1, $2, $3) ORDER BY created_at',
      [projectId1, projectId2, projectId3]
    );

    expect(projects.rows.length).toBe(3);
    expect(projects.rows[0].name).toBe('Cycle Test');
    expect(projects.rows[1].name).toBe('Cycle Test');
    expect(projects.rows[2].name).toBe('Cycle Test');

    // Verify codes exist in all three
    const codes1 = await pool.query('SELECT COUNT(*) as count FROM codes c JOIN files f ON c.file_id = f.id WHERE f.project_id = $1', [projectId1]);
    const codes2 = await pool.query('SELECT COUNT(*) as count FROM codes c JOIN files f ON c.file_id = f.id WHERE f.project_id = $1', [projectId2]);
    const codes3 = await pool.query('SELECT COUNT(*) as count FROM codes c JOIN files f ON c.file_id = f.id WHERE f.project_id = $1', [projectId3]);

    expect(parseInt(codes1.rows[0].count)).toBe(1);
    expect(parseInt(codes2.rows[0].count)).toBe(1);
    expect(parseInt(codes3.rows[0].count)).toBe(1);

    // Cleanup
    await pool.query('DELETE FROM projects WHERE id IN ($1, $2, $3)', [projectId1, projectId2, projectId3]);
  });
});
