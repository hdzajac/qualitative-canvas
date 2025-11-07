import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pool from './db/pool.js';
import filesRoutes from './routes/files.js';
import codesRoutes from './routes/codes.js';
import themesRoutes from './routes/themes.js';
import insightsRoutes from './routes/insights.js';
import annotationsRoutes from './routes/annotations.js';
import projectsRoutes from './routes/projects.js';
import mediaRoutes from './routes/media.js';
import transcriptionRoutes from './routes/transcription.js';
import segmentsRoutes from './routes/segments.js';
import { runMigrations } from './db/migrate.js';

dotenv.config();

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS files (
      id UUID PRIMARY KEY,
      filename TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS codes (
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
      code_ids UUID[] NOT NULL DEFAULT '{}',
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
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE annotations ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

    CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_codes_file_id ON codes(file_id);
    CREATE INDEX IF NOT EXISTS idx_codes_created_at ON codes(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_themes_created_at ON themes(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_insights_created_at ON insights(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_annotations_created_at ON annotations(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_annotations_project_id ON annotations(project_id);
  `);
}

export async function init() {
  await runMigrations();
  await initDb();
}

export function buildApp() {
  const app = express();

  // Security middleware
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS
  const corsOrigin = process.env.FRONTEND_ORIGIN || process.env.CORS_ORIGIN;
  app.use(cors(corsOrigin ? { origin: corsOrigin, credentials: true } : {}));

  // Rate limit
  const limiter = rateLimit({ windowMs: 60_000, max: 600 });
  app.use(limiter);

  app.use(express.json({ limit: '5mb' }));
  app.use(morgan('dev'));

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
  app.use('/api/projects', projectsRoutes(pool));
  app.use('/api/files', filesRoutes(pool));
  app.use('/api/codes', codesRoutes(pool));
  app.use('/api/highlights', codesRoutes(pool));
  app.use('/api/themes', themesRoutes(pool));
  app.use('/api/insights', insightsRoutes(pool));
  app.use('/api/annotations', annotationsRoutes(pool));
  app.use('/api/media', mediaRoutes(pool));
  app.use('/api', transcriptionRoutes(pool));
  // nested: /api/media/:mediaId/segments
  app.use('/api/media/:mediaId/segments', segmentsRoutes(pool));

  // Error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}

export const app = buildApp();
