/**
 * Complete Project Export Test
 * Tests the full project export with CSV data and VTT transcripts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { init, buildApp } from '../app.js';
import pool from '../db/pool.js';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';

describe('Complete Project Export', () => {
  let app;
  let projectId;
  let fileId;
  let mediaId;

  beforeAll(async () => {
    await init();
    app = buildApp();

    // Create test project with full data
    projectId = uuidv4();
    await pool.query(
      'INSERT INTO projects (id, name, description) VALUES ($1, $2, $3)',
      [projectId, 'Complete Test Project', 'Project with documents and media']
    );

    // Create a document file
    fileId = uuidv4();
    await pool.query(
      'INSERT INTO files (id, project_id, filename, content) VALUES ($1, $2, $3, $4)',
      [fileId, projectId, 'test-doc.txt', 'This is test document content for coding.']
    );

    // Create file entry for document
    const fileEntryId = uuidv4();
    await pool.query(
      'INSERT INTO file_entries (id, project_id, document_file_id, name, type) VALUES ($1, $2, $3, $4, $5)',
      [fileEntryId, projectId, fileId, 'test-doc.txt', 'document']
    );

    // Create a code
    const codeId = uuidv4();
    await pool.query(
      'INSERT INTO codes (id, file_id, file_entry_id, code_name, text, start_offset, end_offset, position) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [codeId, fileId, fileEntryId, 'Test Code', 'test document', 8, 21, { x: 100, y: 200 }]
    );

    // Create a theme
    const themeId = uuidv4();
    await pool.query(
      'INSERT INTO themes (id, project_id, name, code_ids, position) VALUES ($1, $2, $3, $4, $5)',
      [themeId, projectId, 'Test Theme', [codeId], { x: 300, y: 150 }]
    );

    // Create an insight
    const insightId = uuidv4();
    await pool.query(
      'INSERT INTO insights (id, project_id, name, theme_ids, position, expanded) VALUES ($1, $2, $3, $4, $5, $6)',
      [insightId, projectId, 'Test Insight', [themeId], { x: 500, y: 200 }, true]
    );

    // Create a media file with transcript
    mediaId = uuidv4();
    await pool.query(
      'INSERT INTO media_files (id, project_id, original_filename, mime_type, size_bytes, status, duration_sec, storage_path) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [mediaId, projectId, 'Interview.mp3', 'audio/mpeg', 1024000, 'done', 120, '/path/to/audio']
    );

    // Create participants
    const participantId1 = uuidv4();
    const participantId2 = uuidv4();
    await pool.query(
      'INSERT INTO participants (id, media_file_id, name, color) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)',
      [participantId1, mediaId, 'Alice', '#4A90E2', participantId2, mediaId, 'Bob', '#E24A90']
    );

    // Create transcript segments
    const segment1Id = uuidv4();
    const segment2Id = uuidv4();
    await pool.query(
      'INSERT INTO transcript_segments (id, media_file_id, participant_id, idx, start_ms, end_ms, text) VALUES ($1, $2, $3, $4, $5, $6, $7), ($8, $9, $10, $11, $12, $13, $14)',
      [
        segment1Id, mediaId, participantId1, 0, 0, 2000, 'Hello, how are you?',
        segment2Id, mediaId, participantId2, 1, 2000, 4500, 'I am doing great, thanks!'
      ]
    );
  });

  afterAll(async () => {
    // Clean up
    if (projectId) {
      await pool.query('DELETE FROM transcript_segments WHERE media_file_id = $1', [mediaId]);
      await pool.query('DELETE FROM participants WHERE media_file_id = $1', [mediaId]);
      await pool.query('DELETE FROM media_files WHERE id = $1', [mediaId]);
      await pool.query('DELETE FROM insights WHERE project_id = $1', [projectId]);
      await pool.query('DELETE FROM themes WHERE project_id = $1', [projectId]);
      await pool.query('DELETE FROM codes WHERE file_id = $1', [fileId]);
      await pool.query('DELETE FROM files WHERE project_id = $1', [projectId]);
      await pool.query('DELETE FROM file_entries WHERE project_id = $1', [projectId]);
      await pool.query('DELETE FROM projects WHERE id = $1', [projectId]);
    }
  });

  it('should export complete project as ZIP with CSVs and VTTs', async () => {
    const response = await request(app)
      .get(`/api/export/projects/${projectId}/export?format=zip`)
      .responseType('blob')
      .buffer(true)
      .parse((res, callback) => {
        res.setEncoding('binary');
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
      })
      .expect(200);

    expect(response.headers['content-type']).toContain('application/zip');
    expect(response.headers['content-disposition']).toContain('.zip');

    // Parse ZIP contents
    const zip = new AdmZip(response.body);
    const zipEntries = zip.getEntries();

    // Check for CSV files in data/ folder
    const csvFiles = zipEntries.filter(e => e.entryName.startsWith('data/') && e.entryName.endsWith('.csv'));
    expect(csvFiles.length).toBeGreaterThan(0);

    const csvNames = csvFiles.map(e => e.entryName);
    expect(csvNames).toContain('data/project.csv');
    expect(csvNames).toContain('data/files.csv');
    expect(csvNames).toContain('data/codes.csv');
    expect(csvNames).toContain('data/themes.csv');
    expect(csvNames).toContain('data/insights.csv');
    expect(csvNames).toContain('data/media.csv');
    expect(csvNames).toContain('data/segments.csv');
    expect(csvNames).toContain('data/participants.csv');

    // Check for VTT files in transcripts/ folder
    const vttFiles = zipEntries.filter(e => e.entryName.startsWith('transcripts/') && e.entryName.endsWith('.vtt'));
    expect(vttFiles.length).toBe(1);
    expect(vttFiles[0].entryName).toBe('transcripts/Interview.vtt');

    // Verify VTT content
    const vttContent = zip.readAsText(vttFiles[0]);
    expect(vttContent).toContain('WEBVTT');
    expect(vttContent).toContain('00:00:00.000 --> 00:00:02.000');
    expect(vttContent).toContain('<v Alice>Hello, how are you?</v>');
    expect(vttContent).toContain('00:00:02.000 --> 00:00:04.500');
    expect(vttContent).toContain('<v Bob>I am doing great, thanks!</v>');

    // Check for README
    const readmeEntry = zipEntries.find(e => e.entryName === 'README.txt');
    expect(readmeEntry).toBeDefined();

    const readmeContent = zip.readAsText(readmeEntry);
    expect(readmeContent).toContain('Complete Test Project');
    expect(readmeContent).toContain('data/');
    expect(readmeContent).toContain('transcripts/');
    expect(readmeContent).toContain('REIMPORTING');
  });

  it('should verify CSV content in export', async () => {
    const response = await request(app)
      .get(`/api/export/projects/${projectId}/export?format=zip`)
      .buffer(true)
      .parse((res, callback) => {
        res.setEncoding('binary');
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
      })
      .expect(200);

    const zip = new AdmZip(response.body);

    // Check project.csv
    const projectCsv = zip.readAsText('data/project.csv');
    expect(projectCsv).toContain('Complete Test Project');
    expect(projectCsv).toContain('Project with documents and media');

    // Check codes.csv
    const codesCsv = zip.readAsText('data/codes.csv');
    expect(codesCsv).toContain('Test Code');
    expect(codesCsv).toContain('test document');
    expect(codesCsv).toContain('100'); // position_x
    expect(codesCsv).toContain('200'); // position_y

    // Check themes.csv
    const themesCsv = zip.readAsText('data/themes.csv');
    expect(themesCsv).toContain('Test Theme');

    // Check media.csv
    const mediaCsv = zip.readAsText('data/media.csv');
    expect(mediaCsv).toContain('Interview.mp3');
    expect(mediaCsv).toContain('done');

    // Check participants.csv
    const participantsCsv = zip.readAsText('data/participants.csv');
    expect(participantsCsv).toContain('Alice');
    expect(participantsCsv).toContain('Bob');
  });

  it('should handle project with no media', async () => {
    // Create project without media
    const emptyProjectId = uuidv4();
    await pool.query(
      'INSERT INTO projects (id, name) VALUES ($1, $2)',
      [emptyProjectId, 'No Media Project']
    );

    try {
      const response = await request(app)
        .get(`/api/export/projects/${emptyProjectId}/export?format=zip`)
        .buffer(true)
        .parse((res, callback) => {
          res.setEncoding('binary');
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
        })
        .expect(200);

      const zip = new AdmZip(response.body);
      const zipEntries = zip.getEntries();

      // Should not have transcripts folder
      const vttFiles = zipEntries.filter(e => e.entryName.startsWith('transcripts/'));
      expect(vttFiles.length).toBe(0);

      // Should still have data folder
      const csvFiles = zipEntries.filter(e => e.entryName.startsWith('data/'));
      expect(csvFiles.length).toBeGreaterThan(0);
    } finally {
      await pool.query('DELETE FROM projects WHERE id = $1', [emptyProjectId]);
    }
  });
});
