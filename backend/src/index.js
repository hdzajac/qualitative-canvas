import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import pool from './db/pool.js';
import filesRoutes from './routes/files.js';
import highlightsRoutes from './routes/highlights.js';
import themesRoutes from './routes/themes.js';
import insightsRoutes from './routes/insights.js';
import annotationsRoutes from './routes/annotations.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5002;

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
      start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
      end_offset INTEGER NOT NULL CHECK (end_offset >= 0),
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

    CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_highlights_file_id ON highlights(file_id);
    CREATE INDEX IF NOT EXISTS idx_highlights_created_at ON highlights(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_themes_created_at ON themes(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_insights_created_at ON insights(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_annotations_created_at ON annotations(created_at DESC);
  `);
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

// Routes
app.use('/api/files', filesRoutes(pool));
app.use('/api/highlights', highlightsRoutes(pool));
app.use('/api/themes', themesRoutes(pool));
app.use('/api/insights', insightsRoutes(pool));
app.use('/api/annotations', annotationsRoutes(pool));

// Central error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start
initDb()
  .then(() => app.listen(port, () => console.log(`Backend listening on port ${port}`)))
  .catch((e) => {
    console.error('Failed to init DB', e);
    process.exit(1);
  });
