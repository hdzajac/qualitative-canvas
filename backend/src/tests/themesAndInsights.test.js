import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { app, init } from '../app.js';
import pool from '../db/pool.js';
import { createTestUser } from './testAuth.js';

let authCookie; let projectId; let fileId; let codeId1; let codeId2; let themeId; let insightId;

beforeAll(async () => {
  await init();
  ({ cookie: authCookie } = await createTestUser());
  const proj = await request(app).post('/api/projects').set('Cookie', authCookie).send({ name: 'ThemesInsightsProj' });
  projectId = proj.body.id;

  // Seed a file entry + two codes via pool.query (no upload API for document files)
  fileId = uuidv4();
  await pool.query(
    'INSERT INTO files (id, project_id, filename, content) VALUES ($1, $2, $3, $4)',
    [fileId, projectId, 'doc.txt', 'hello world']
  );
  await pool.query(
    'INSERT INTO file_entries (id, project_id, document_file_id, name, type) VALUES ($1, $2, $3, $4, $5)',
    [fileId, projectId, fileId, 'doc.txt', 'document']
  );
  codeId1 = uuidv4();
  codeId2 = uuidv4();
  await pool.query(
    `INSERT INTO codes (id, file_entry_id, code_name, text, start_offset, end_offset) VALUES ($1,$2,$3,$4,$5,$6)`,
    [codeId1, fileId, 'Code One', 'hello', 0, 5]
  );
  await pool.query(
    `INSERT INTO codes (id, file_entry_id, code_name, text, start_offset, end_offset) VALUES ($1,$2,$3,$4,$5,$6)`,
    [codeId2, fileId, 'Code Two', 'world', 6, 11]
  );
});

afterAll(async () => {
  if (insightId) await pool.query('DELETE FROM insights WHERE id = $1', [insightId]);
  if (themeId) await pool.query('DELETE FROM themes WHERE id = $1', [themeId]);
  await pool.query('DELETE FROM codes WHERE file_entry_id = $1', [fileId]);
  await pool.query('DELETE FROM file_entries WHERE id = $1', [fileId]);
  await pool.query('DELETE FROM files WHERE id = $1', [fileId]);
  await pool.query('DELETE FROM projects WHERE id = $1', [projectId]);
});

// ─── Themes CRUD ──────────────────────────────────────────────────────────────

describe('Themes CRUD', () => {
  it('creates a theme with no codes', async () => {
    const res = await request(app)
      .post('/api/themes')
      .set('Cookie', authCookie)
      .send({ name: 'Theme Alpha', projectId });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Theme Alpha', highlightIds: [] });
    themeId = res.body.id;
  });

  it('appears in the theme list', async () => {
    const res = await request(app).get(`/api/themes?projectId=${projectId}`).set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body.find(t => t.id === themeId)).toBeTruthy();
  });

  it('updates the theme name', async () => {
    const res = await request(app)
      .put(`/api/themes/${themeId}`)
      .set('Cookie', authCookie)
      .send({ name: 'Theme Alpha Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Theme Alpha Renamed');
  });

  it('adds a code to the theme', async () => {
    const res = await request(app)
      .put(`/api/themes/${themeId}`)
      .set('Cookie', authCookie)
      .send({ highlightIds: [codeId1] });
    expect(res.status).toBe(200);
    expect(res.body.highlightIds).toContain(codeId1);
  });

  it('removes the code from the theme', async () => {
    const res = await request(app)
      .put(`/api/themes/${themeId}`)
      .set('Cookie', authCookie)
      .send({ highlightIds: [] });
    expect(res.status).toBe(200);
    expect(res.body.highlightIds).toHaveLength(0);
  });

  it('returns 404 for an unknown theme id', async () => {
    const res = await request(app)
      .put(`/api/themes/${uuidv4()}`)
      .set('Cookie', authCookie)
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for an empty name', async () => {
    const res = await request(app)
      .put(`/api/themes/${themeId}`)
      .set('Cookie', authCookie)
      .send({ name: '' });
    expect(res.status).toBe(400);
  });
});

// ─── Insights CRUD ────────────────────────────────────────────────────────────

describe('Insights CRUD', () => {
  it('creates an insight with no themes', async () => {
    const res = await request(app)
      .post('/api/insights')
      .set('Cookie', authCookie)
      .send({ name: 'Insight Beta', projectId });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Insight Beta', themeIds: [] });
    insightId = res.body.id;
  });

  it('appears in the insight list', async () => {
    const res = await request(app).get(`/api/insights?projectId=${projectId}`).set('Cookie', authCookie);
    expect(res.status).toBe(200);
    expect(res.body.find(i => i.id === insightId)).toBeTruthy();
  });

  it('adds a theme to the insight', async () => {
    const res = await request(app)
      .put(`/api/insights/${insightId}`)
      .set('Cookie', authCookie)
      .send({ themeIds: [themeId] });
    expect(res.status).toBe(200);
    expect(res.body.themeIds).toContain(themeId);
  });

  it('removes the theme from the insight', async () => {
    const res = await request(app)
      .put(`/api/insights/${insightId}`)
      .set('Cookie', authCookie)
      .send({ themeIds: [] });
    expect(res.status).toBe(200);
    expect(res.body.themeIds).toHaveLength(0);
  });

  it('returns 404 for an unknown insight id', async () => {
    const res = await request(app)
      .put(`/api/insights/${uuidv4()}`)
      .set('Cookie', authCookie)
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for an empty name', async () => {
    const res = await request(app)
      .put(`/api/insights/${insightId}`)
      .set('Cookie', authCookie)
      .send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('deletes the insight', async () => {
    const res = await request(app).delete(`/api/insights/${insightId}`).set('Cookie', authCookie);
    expect(res.status).toBe(204);
    const check = await request(app).get(`/api/insights?projectId=${projectId}`).set('Cookie', authCookie);
    expect(check.body.find(i => i.id === insightId)).toBeFalsy();
    insightId = null;
  });
});

// ─── Move semantics: code moves between themes ────────────────────────────────
// This mirrors the Analysis.tsx handleDrop "move not copy" logic:
// 1. Remove code from old theme (PUT with filtered highlightIds)
// 2. Add code to new theme (PUT with appended highlightIds)
// After both calls the code should appear only in the new theme.

describe('Move code between themes', () => {
  let themeA; let themeB;

  beforeAll(async () => {
    const a = await request(app).post('/api/themes').set('Cookie', authCookie).send({ name: 'Theme A', projectId, highlightIds: [codeId1] });
    const b = await request(app).post('/api/themes').set('Cookie', authCookie).send({ name: 'Theme B', projectId });
    themeA = a.body.id;
    themeB = b.body.id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM themes WHERE id = ANY($1)', [[themeA, themeB].filter(Boolean)]);
  });

  it('code starts in theme A only', async () => {
    const res = await request(app).get(`/api/themes?projectId=${projectId}`).set('Cookie', authCookie);
    const a = res.body.find(t => t.id === themeA);
    const b = res.body.find(t => t.id === themeB);
    expect(a.highlightIds).toContain(codeId1);
    expect(b.highlightIds).not.toContain(codeId1);
  });

  it('removes code from theme A', async () => {
    const res = await request(app)
      .put(`/api/themes/${themeA}`)
      .set('Cookie', authCookie)
      .send({ highlightIds: [] });
    expect(res.status).toBe(200);
    expect(res.body.highlightIds).not.toContain(codeId1);
  });

  it('adds code to theme B', async () => {
    const res = await request(app)
      .put(`/api/themes/${themeB}`)
      .set('Cookie', authCookie)
      .send({ highlightIds: [codeId1] });
    expect(res.status).toBe(200);
    expect(res.body.highlightIds).toContain(codeId1);
  });

  it('code is now in theme B only', async () => {
    const res = await request(app).get(`/api/themes?projectId=${projectId}`).set('Cookie', authCookie);
    const a = res.body.find(t => t.id === themeA);
    const b = res.body.find(t => t.id === themeB);
    expect(a.highlightIds).not.toContain(codeId1);
    expect(b.highlightIds).toContain(codeId1);
  });
});

// ─── Move semantics: theme moves between insights ─────────────────────────────

describe('Move theme between insights', () => {
  let moveTheme; let insightX; let insightY;

  beforeAll(async () => {
    const t = await request(app).post('/api/themes').set('Cookie', authCookie).send({ name: 'Moveable Theme', projectId });
    moveTheme = t.body.id;
    const x = await request(app).post('/api/insights').set('Cookie', authCookie).send({ name: 'Insight X', projectId, themeIds: [moveTheme] });
    const y = await request(app).post('/api/insights').set('Cookie', authCookie).send({ name: 'Insight Y', projectId });
    insightX = x.body.id;
    insightY = y.body.id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM insights WHERE id = ANY($1)', [[insightX, insightY].filter(Boolean)]);
    await pool.query('DELETE FROM themes WHERE id = $1', [moveTheme]);
  });

  it('theme starts in insight X only', async () => {
    const res = await request(app).get(`/api/insights?projectId=${projectId}`).set('Cookie', authCookie);
    const x = res.body.find(i => i.id === insightX);
    const y = res.body.find(i => i.id === insightY);
    expect(x.themeIds).toContain(moveTheme);
    expect(y.themeIds).not.toContain(moveTheme);
  });

  it('removes theme from insight X', async () => {
    const res = await request(app)
      .put(`/api/insights/${insightX}`)
      .set('Cookie', authCookie)
      .send({ themeIds: [] });
    expect(res.status).toBe(200);
    expect(res.body.themeIds).not.toContain(moveTheme);
  });

  it('adds theme to insight Y', async () => {
    const res = await request(app)
      .put(`/api/insights/${insightY}`)
      .set('Cookie', authCookie)
      .send({ themeIds: [moveTheme] });
    expect(res.status).toBe(200);
    expect(res.body.themeIds).toContain(moveTheme);
  });

  it('theme is now in insight Y only', async () => {
    const res = await request(app).get(`/api/insights?projectId=${projectId}`).set('Cookie', authCookie);
    const x = res.body.find(i => i.id === insightX);
    const y = res.body.find(i => i.id === insightY);
    expect(x.themeIds).not.toContain(moveTheme);
    expect(y.themeIds).toContain(moveTheme);
  });
});
