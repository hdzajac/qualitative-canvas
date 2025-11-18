/**
 * Import Service Tests
 * Tests for CSV parsing and project import functionality
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { init, buildApp } from '../app.js';
import pool from '../db/pool.js';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import archiver from 'archiver';
import { Readable } from 'stream';

describe('Project Import', () => {
  let app;

  beforeAll(async () => {
    await init();
    app = buildApp();
  });

  afterAll(async () => {
    // Cleanup is handled by test framework
  });

  /**
   * Helper to create a ZIP buffer with CSV files
   */
  async function createImportZip(csvFiles) {
    return new Promise((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 9 } });
      const chunks = [];

      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      // Add CSV files to data/ folder
      for (const [name, content] of Object.entries(csvFiles)) {
        archive.append(content, { name: `data/${name}.csv` });
      }

      // Add README
      archive.append('Test Export README', { name: 'README.txt' });

      archive.finalize();
    });
  }

  it('should import a complete project from ZIP', async () => {
    const oldProjectId = uuidv4();
    const oldFileId = uuidv4();
    const oldCodeId = uuidv4();
    const oldThemeId = uuidv4();
    const oldInsightId = uuidv4();

    // Create CSV files
    const csvFiles = {
      project: `id,name,description,created_at
${oldProjectId},"Test Import Project","A project for import testing",2024-01-15T10:00:00.000Z`,

      files: `id,project_id,filename,content,created_at
${oldFileId},${oldProjectId},test.txt,"Sample document content",2024-01-15T10:01:00.000Z`,

      codes: `id,file_id,code_name,text,start_offset,end_offset,position_x,position_y,created_at
${oldCodeId},${oldFileId},"Test Code","Sample document",0,15,100,200,2024-01-15T10:02:00.000Z`,

      themes: `id,project_id,name,code_ids,position_x,position_y,created_at
${oldThemeId},${oldProjectId},"Test Theme","${oldCodeId}",300,150,2024-01-15T10:03:00.000Z`,

      insights: `id,project_id,name,theme_ids,position_x,position_y,expanded,created_at
${oldInsightId},${oldProjectId},"Test Insight","${oldThemeId}",500,200,true,2024-01-15T10:04:00.000Z`,

      annotations: `id,project_id,content,position_x,position_y,created_at
${uuidv4()},${oldProjectId},"Test annotation",100,100,2024-01-15T10:05:00.000Z`
    };

    const zipBuffer = await createImportZip(csvFiles);

    // Import the project
    const response = await request(app)
      .post('/api/import/projects')
      .attach('file', zipBuffer, 'test-import.zip')
      .expect(201);

    expect(response.body.message).toContain('imported successfully');
    expect(response.body.projectId).toBeDefined();
    expect(response.body.stats).toMatchObject({
      files: 1,
      codes: 1,
      themes: 1,
      insights: 1,
      annotations: 1
    });

    const newProjectId = response.body.projectId;

    // Verify project was created
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [newProjectId]);
    expect(projectResult.rows.length).toBe(1);
    expect(projectResult.rows[0].name).toBe('Test Import Project');
    expect(projectResult.rows[0].description).toBe('A project for import testing');

    // Verify files were created
    const filesResult = await pool.query('SELECT * FROM files WHERE project_id = $1', [newProjectId]);
    expect(filesResult.rows.length).toBe(1);
    expect(filesResult.rows[0].filename).toBe('test.txt');
    expect(filesResult.rows[0].content).toBe('Sample document content');

    // Verify codes were created with new IDs
    const fileEntryResult = await pool.query('SELECT id FROM file_entries WHERE document_file_id = $1', [filesResult.rows[0].id]);
    const codesResult = await pool.query('SELECT * FROM codes WHERE file_entry_id = $1', [fileEntryResult.rows[0].id]);
    expect(codesResult.rows.length).toBe(1);
    expect(codesResult.rows[0].code_name).toBe('Test Code');
    expect(codesResult.rows[0].position).toEqual({ x: 100, y: 200 });

    // Verify themes with mapped code_ids
    const themesResult = await pool.query('SELECT * FROM themes WHERE project_id = $1', [newProjectId]);
    expect(themesResult.rows.length).toBe(1);
    expect(themesResult.rows[0].name).toBe('Test Theme');
    expect(themesResult.rows[0].code_ids).toEqual([codesResult.rows[0].id]);

    // Verify insights with mapped theme_ids
    const insightsResult = await pool.query('SELECT * FROM insights WHERE project_id = $1', [newProjectId]);
    expect(insightsResult.rows.length).toBe(1);
    expect(insightsResult.rows[0].name).toBe('Test Insight');
    expect(insightsResult.rows[0].theme_ids).toEqual([themesResult.rows[0].id]);
    expect(insightsResult.rows[0].expanded).toBe(true);

    // Verify annotations
    const annotationsResult = await pool.query('SELECT * FROM annotations WHERE project_id = $1', [newProjectId]);
    expect(annotationsResult.rows.length).toBe(1);

    // Cleanup
    await pool.query('DELETE FROM projects WHERE id = $1', [newProjectId]);
  });

  it('should import project with media and transcripts', async () => {
    const oldProjectId = uuidv4();
    const oldMediaId = uuidv4();
    const oldParticipantId1 = uuidv4();
    const oldParticipantId2 = uuidv4();
    const oldSegmentId1 = uuidv4();
    const oldSegmentId2 = uuidv4();

    const csvFiles = {
      project: `id,name,description,created_at
${oldProjectId},"Media Project","Project with audio",2024-01-15T10:00:00.000Z`,

      files: `id,project_id,filename,content,created_at`,

      codes: `id,file_id,code_name,text,start_offset,end_offset,position_x,position_y,created_at`,

      themes: `id,project_id,name,code_ids,position_x,position_y,created_at`,

      insights: `id,project_id,name,theme_ids,position_x,position_y,expanded,created_at`,

      media: `id,project_id,original_filename,mime_type,size_bytes,status,duration_sec,storage_path,created_at
${oldMediaId},${oldProjectId},interview.mp3,audio/mpeg,1024000,done,120,/path/to/file,2024-01-15T10:00:00.000Z`,

      participants: `id,media_file_id,name,color
${oldParticipantId1},${oldMediaId},Alice,#4A90E2
${oldParticipantId2},${oldMediaId},Bob,#E24A90`,

      segments: `id,media_file_id,participant_id,idx,start_ms,end_ms,text,created_at
${oldSegmentId1},${oldMediaId},${oldParticipantId1},0,0,2000,"Hello there",2024-01-15T10:00:00.000Z
${oldSegmentId2},${oldMediaId},${oldParticipantId2},1,2000,4500,"Hi! How are you?",2024-01-15T10:00:00.000Z`
    };

    const zipBuffer = await createImportZip(csvFiles);

    const response = await request(app)
      .post('/api/import/projects')
      .attach('file', zipBuffer, 'media-import.zip')
      .expect(201);

    const newProjectId = response.body.projectId;

    expect(response.body.stats).toMatchObject({
      media: 1,
      participants: 2,
      segments: 2
    });

    // Verify media file
    const mediaResult = await pool.query('SELECT * FROM media_files WHERE project_id = $1', [newProjectId]);
    expect(mediaResult.rows.length).toBe(1);
    expect(mediaResult.rows[0].original_filename).toBe('interview.mp3');

    const newMediaId = mediaResult.rows[0].id;

    // Verify participants
    const participantsResult = await pool.query(
      'SELECT * FROM participants WHERE media_file_id = $1 ORDER BY name',
      [newMediaId]
    );
    expect(participantsResult.rows.length).toBe(2);
    expect(participantsResult.rows[0].name).toBe('Alice');
    expect(participantsResult.rows[1].name).toBe('Bob');

    // Verify segments with correct participant mapping
    const segmentsResult = await pool.query(
      'SELECT * FROM transcript_segments WHERE media_file_id = $1 ORDER BY idx',
      [newMediaId]
    );
    expect(segmentsResult.rows.length).toBe(2);
    expect(segmentsResult.rows[0].text).toBe('Hello there');
    expect(segmentsResult.rows[0].participant_id).toBe(participantsResult.rows[0].id);
    expect(segmentsResult.rows[1].text).toBe('Hi! How are you?');
    expect(segmentsResult.rows[1].participant_id).toBe(participantsResult.rows[1].id);

    // Cleanup
    await pool.query('DELETE FROM projects WHERE id = $1', [newProjectId]);
  });

  it('should validate ZIP structure before import', async () => {
    const csvFiles = {
      project: `id,name\n${uuidv4()},"Test"`,
      files: `id,project_id,filename,content`,
      codes: `id,file_id,code_name,text,start_offset,end_offset,position_x,position_y`
      // Missing themes and insights
    };

    const zipBuffer = await createImportZip(csvFiles);

    const response = await request(app)
      .post('/api/import/validate')
      .attach('file', zipBuffer, 'incomplete.zip')
      .expect(200);

    expect(response.body.valid).toBe(false);
    expect(response.body.missingFiles).toContain('themes');
    expect(response.body.missingFiles).toContain('insights');
  });

  it('should reject non-ZIP files', async () => {
    const response = await request(app)
      .post('/api/import/projects')
      .attach('file', Buffer.from('not a zip'), 'test.txt')
      .expect(500);

    expect(response.body.error).toBeDefined();
  });

  it('should reject ZIP without required files', async () => {
    const csvFiles = {
      project: `id,name\n${uuidv4()},"Test"`
      // Missing other required files
    };

    const zipBuffer = await createImportZip(csvFiles);

    const response = await request(app)
      .post('/api/import/projects')
      .attach('file', zipBuffer, 'incomplete.zip')
      .expect(400);

    expect(response.body.error).toContain('Missing required CSV file');
  });

  it('should handle complex relationships correctly', async () => {
    const oldProjectId = uuidv4();
    const oldFileId1 = uuidv4();
    const oldFileId2 = uuidv4();
    const oldCodeId1 = uuidv4();
    const oldCodeId2 = uuidv4();
    const oldCodeId3 = uuidv4();
    const oldThemeId1 = uuidv4();
    const oldThemeId2 = uuidv4();
    const oldInsightId = uuidv4();

    const csvFiles = {
      project: `id,name,description,created_at
${oldProjectId},"Complex Project","Testing relationships",2024-01-15T10:00:00.000Z`,

      files: `id,project_id,filename,content,created_at
${oldFileId1},${oldProjectId},doc1.txt,"First document",2024-01-15T10:01:00.000Z
${oldFileId2},${oldProjectId},doc2.txt,"Second document",2024-01-15T10:02:00.000Z`,

      codes: `id,file_id,code_name,text,start_offset,end_offset,position_x,position_y,created_at
${oldCodeId1},${oldFileId1},"Code A","First",0,5,100,100,2024-01-15T10:03:00.000Z
${oldCodeId2},${oldFileId1},"Code B","document",6,14,150,100,2024-01-15T10:04:00.000Z
${oldCodeId3},${oldFileId2},"Code C","Second",0,6,100,150,2024-01-15T10:05:00.000Z`,

      themes: `id,project_id,name,code_ids,position_x,position_y,created_at
${oldThemeId1},${oldProjectId},"Theme 1","${oldCodeId1};${oldCodeId2}",300,100,2024-01-15T10:06:00.000Z
${oldThemeId2},${oldProjectId},"Theme 2","${oldCodeId3}",300,200,2024-01-15T10:07:00.000Z`,

      insights: `id,project_id,name,theme_ids,position_x,position_y,expanded,created_at
${oldInsightId},${oldProjectId},"Combined Insight","${oldThemeId1};${oldThemeId2}",500,150,false,2024-01-15T10:08:00.000Z`,

      annotations: ``
    };

    const zipBuffer = await createImportZip(csvFiles);

    const response = await request(app)
      .post('/api/import/projects')
      .attach('file', zipBuffer, 'complex.zip')
      .expect(201);

    const newProjectId = response.body.projectId;

    // Verify theme has correct code references
    const themesResult = await pool.query(
      'SELECT * FROM themes WHERE project_id = $1 ORDER BY name',
      [newProjectId]
    );
    expect(themesResult.rows.length).toBe(2);
    expect(themesResult.rows[0].code_ids.length).toBe(2);
    expect(themesResult.rows[1].code_ids.length).toBe(1);

    // Verify insight has correct theme references
    const insightsResult = await pool.query(
      'SELECT * FROM insights WHERE project_id = $1',
      [newProjectId]
    );
    expect(insightsResult.rows.length).toBe(1);
    expect(insightsResult.rows[0].theme_ids.length).toBe(2);
    expect(insightsResult.rows[0].theme_ids).toEqual([
      themesResult.rows[0].id,
      themesResult.rows[1].id
    ]);

    // Cleanup
    await pool.query('DELETE FROM projects WHERE id = $1', [newProjectId]);
  });

  it('should append number to project name on duplicate import', async () => {
    const projectId = uuidv4();
    const projectName = 'Duplicate Test Project';
    
    const csvFiles = {
      project: `id,name,description,created_at\n${projectId},"${projectName}","Test description",2024-01-01T00:00:00Z`,
      files: 'id,project_id,filename,content,created_at\n',
      codes: 'id,file_id,code_name,text,start_offset,end_offset,position_x,position_y,created_at\n',
      themes: 'id,project_id,name,code_ids,created_at\n',
      insights: 'id,project_id,name,theme_ids,created_at\n',
      annotations: 'id,project_id,content,position_x,position_y,created_at\n'
    };

    // First import
    const zip1 = await createImportZip(csvFiles);
    const response1 = await request(app)
      .post('/api/import/projects')
      .attach('file', zip1, 'export.zip')
      .expect(201);

    const project1Id = response1.body.projectId;
    const project1 = await pool.query('SELECT * FROM projects WHERE id = $1', [project1Id]);
    expect(project1.rows[0].name).toBe(projectName);
    expect(project1.rows[0].imported_at).toBeTruthy();

    // Second import (should append (2))
    const zip2 = await createImportZip(csvFiles);
    const response2 = await request(app)
      .post('/api/import/projects')
      .attach('file', zip2, 'export.zip')
      .expect(201);

    const project2Id = response2.body.projectId;
    const project2 = await pool.query('SELECT * FROM projects WHERE id = $1', [project2Id]);
    expect(project2.rows[0].name).toBe(`${projectName} (2)`);
    expect(project2.rows[0].imported_at).toBeTruthy();

    // Third import (should append (3))
    const zip3 = await createImportZip(csvFiles);
    const response3 = await request(app)
      .post('/api/import/projects')
      .attach('file', zip3, 'export.zip')
      .expect(201);

    const project3Id = response3.body.projectId;
    const project3 = await pool.query('SELECT * FROM projects WHERE id = $1', [project3Id]);
    expect(project3.rows[0].name).toBe(`${projectName} (3)`);

    // Cleanup
    await pool.query('DELETE FROM projects WHERE id IN ($1, $2, $3)', [project1Id, project2Id, project3Id]);
  });
});
