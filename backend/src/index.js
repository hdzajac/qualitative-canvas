import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import pool from './db/pool.js';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

// Initialize schema if not exists
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS files (
      id UUID PRIMARY KEY,
      filename TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS highlights (
      id UUID PRIMARY KEY,
      file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      start_offset INTEGER NOT NULL,
      end_offset INTEGER NOT NULL,
      text TEXT NOT NULL,
      code_name TEXT NOT NULL,
      position JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS themes (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      highlight_ids UUID[] NOT NULL DEFAULT '{}',
      position JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS insights (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      theme_ids UUID[] NOT NULL DEFAULT '{}',
      position JSONB,
      expanded BOOLEAN,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS annotations (
      id UUID PRIMARY KEY,
      content TEXT NOT NULL,
      position JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

// Convert DB rows to frontend shapes
function mapFile(r) {
  return { id: r.id, filename: r.filename, content: r.content, createdAt: r.created_at.toISOString() };
}
function mapHighlight(r) {
  return {
    id: r.id,
    fileId: r.file_id,
    startOffset: r.start_offset,
    endOffset: r.end_offset,
    text: r.text,
    codeName: r.code_name,
    position: r.position || undefined,
    createdAt: r.created_at.toISOString(),
  };
}
function mapTheme(r) {
  return {
    id: r.id,
    name: r.name,
    highlightIds: r.highlight_ids || [],
    position: r.position || undefined,
    createdAt: r.created_at.toISOString(),
  };
}
function mapInsight(r) {
  return {
    id: r.id,
    name: r.name,
    themeIds: r.theme_ids || [],
    position: r.position || undefined,
    createdAt: r.created_at.toISOString(),
    expanded: r.expanded ?? undefined,
  };
}
function mapAnnotation(r) {
  return {
    id: r.id,
    content: r.content,
    position: r.position,
    createdAt: r.created_at.toISOString(),
  };
}

// Health
app.get('/api/health', async (_req, res) => {
  try {
    const r = await pool.query('SELECT 1 as ok');
    const dbOk = r?.rows?.[0]?.ok === 1;
    res.json({ ok: true, dbOk });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Files CRUD
app.get('/api/files', async (_req, res) => {
  const r = await pool.query('SELECT * FROM files ORDER BY created_at DESC');
  res.json(r.rows.map(mapFile));
});

app.get('/api/files/:id', async (req, res) => {
  const { id } = req.params;
  const r = await pool.query('SELECT * FROM files WHERE id = $1', [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(mapFile(r.rows[0]));
});

app.post('/api/files', async (req, res) => {
  const { filename, content } = req.body || {};
  if (!filename || typeof content !== 'string') return res.status(400).json({ error: 'Invalid body' });
  const id = uuidv4();
  const r = await pool.query(
    'INSERT INTO files (id, filename, content) VALUES ($1,$2,$3) RETURNING *',
    [id, filename, content]
  );
  res.status(201).json(mapFile(r.rows[0]));
});

// Highlights CRUD
app.get('/api/highlights', async (_req, res) => {
  const r = await pool.query('SELECT * FROM highlights ORDER BY created_at DESC');
  res.json(r.rows.map(mapHighlight));
});

app.post('/api/highlights', async (req, res) => {
  const { fileId, startOffset, endOffset, text, codeName, position } = req.body || {};
  if (!fileId || startOffset == null || endOffset == null || !text || !codeName)
    return res.status(400).json({ error: 'Invalid body' });
  const id = uuidv4();
  const r = await pool.query(
    `INSERT INTO highlights (id, file_id, start_offset, end_offset, text, code_name, position)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id, fileId, startOffset, endOffset, text, codeName, position ?? null]
  );
  res.status(201).json(mapHighlight(r.rows[0]));
});

app.put('/api/highlights/:id', async (req, res) => {
  const { id } = req.params;
  const { startOffset, endOffset, text, codeName, position } = req.body || {};
  const r = await pool.query(
    `UPDATE highlights SET start_offset=COALESCE($2,start_offset), end_offset=COALESCE($3,end_offset),
      text=COALESCE($4,text), code_name=COALESCE($5,code_name), position=COALESCE($6,position)
     WHERE id=$1 RETURNING *`,
    [id, startOffset, endOffset, text, codeName, position ?? null]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(mapHighlight(r.rows[0]));
});

app.delete('/api/highlights/:id', async (req, res) => {
  const { id } = req.params;
  const r = await pool.query('DELETE FROM highlights WHERE id=$1 RETURNING id', [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

// Themes CRUD
app.get('/api/themes', async (_req, res) => {
  const r = await pool.query('SELECT * FROM themes ORDER BY created_at DESC');
  res.json(r.rows.map(mapTheme));
});

app.post('/api/themes', async (req, res) => {
  const { name, highlightIds, position } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Invalid body' });
  const id = uuidv4();
  const r = await pool.query(
    `INSERT INTO themes (id, name, highlight_ids, position) VALUES ($1,$2,$3,$4) RETURNING *`,
    [id, name, Array.isArray(highlightIds) ? highlightIds : [], position ?? null]
  );
  res.status(201).json(mapTheme(r.rows[0]));
});

app.put('/api/themes/:id', async (req, res) => {
  const { id } = req.params;
  const { name, highlightIds, position } = req.body || {};
  const r = await pool.query(
    `UPDATE themes SET name=COALESCE($2,name), highlight_ids=COALESCE($3,highlight_ids), position=COALESCE($4,position)
     WHERE id=$1 RETURNING *`,
    [id, name ?? null, Array.isArray(highlightIds) ? highlightIds : null, position ?? null]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(mapTheme(r.rows[0]));
});

app.delete('/api/themes/:id', async (req, res) => {
  const { id } = req.params;
  const r = await pool.query('DELETE FROM themes WHERE id=$1 RETURNING id', [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

// Insights CRUD
app.get('/api/insights', async (_req, res) => {
  const r = await pool.query('SELECT * FROM insights ORDER BY created_at DESC');
  res.json(r.rows.map(mapInsight));
});

app.post('/api/insights', async (req, res) => {
  const { name, themeIds, position, expanded } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Invalid body' });
  const id = uuidv4();
  const r = await pool.query(
    `INSERT INTO insights (id, name, theme_ids, position, expanded) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [id, name, Array.isArray(themeIds) ? themeIds : [], position ?? null, expanded ?? null]
  );
  res.status(201).json(mapInsight(r.rows[0]));
});

app.put('/api/insights/:id', async (req, res) => {
  const { id } = req.params;
  const { name, themeIds, position, expanded } = req.body || {};
  const r = await pool.query(
    `UPDATE insights SET name=COALESCE($2,name), theme_ids=COALESCE($3,theme_ids), position=COALESCE($4,position), expanded=COALESCE($5,expanded)
     WHERE id=$1 RETURNING *`,
    [id, name ?? null, Array.isArray(themeIds) ? themeIds : null, position ?? null, expanded ?? null]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(mapInsight(r.rows[0]));
});

app.delete('/api/insights/:id', async (req, res) => {
  const { id } = req.params;
  const r = await pool.query('DELETE FROM insights WHERE id=$1 RETURNING id', [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

// Annotations CRUD
app.get('/api/annotations', async (_req, res) => {
  const r = await pool.query('SELECT * FROM annotations ORDER BY created_at DESC');
  res.json(r.rows.map(mapAnnotation));
});

app.post('/api/annotations', async (req, res) => {
  const { content, position } = req.body || {};
  if (!content || !position) return res.status(400).json({ error: 'Invalid body' });
  const id = uuidv4();
  const r = await pool.query(
    `INSERT INTO annotations (id, content, position) VALUES ($1,$2,$3) RETURNING *`,
    [id, content, position]
  );
  res.status(201).json(mapAnnotation(r.rows[0]));
});

app.put('/api/annotations/:id', async (req, res) => {
  const { id } = req.params;
  const { content, position } = req.body || {};
  const r = await pool.query(
    `UPDATE annotations SET content=COALESCE($2,content), position=COALESCE($3,position)
     WHERE id=$1 RETURNING *`,
    [id, content ?? null, position ?? null]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(mapAnnotation(r.rows[0]));
});

app.delete('/api/annotations/:id', async (req, res) => {
  const { id } = req.params;
  const r = await pool.query('DELETE FROM annotations WHERE id=$1 RETURNING id', [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

// Start
initDb()
  .then(() => app.listen(port, () => console.log(`Backend listening on port ${port}`)))
  .catch((e) => {
    console.error('Failed to init DB', e);
    process.exit(1);
  });
