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
import participantsRoutes from './routes/participants.js';
import { runMigrations } from './db/migrate.js';

dotenv.config();

// initDb no longer creates base schema; this is handled by migrations (000_base.sql)

export async function init() {
  // Serialize initialization to avoid concurrent DDL races across test files
  await pool.query('SELECT pg_advisory_lock(777000000)');
  try {
    await runMigrations();
  } finally {
    await pool.query('SELECT pg_advisory_unlock(777000000)');
  }
}

export function buildApp() {
  const app = express();

  // Security middleware
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS
  const corsOrigin = process.env.FRONTEND_ORIGIN || process.env.CORS_ORIGIN;
  app.use(cors(corsOrigin ? {
    origin: corsOrigin,
    credentials: true,
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length']
  } : {
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length']
  }));

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
  app.use('/api/media/:mediaId/participants', participantsRoutes(pool));

  // Simple metrics endpoint (for observability)
  app.get('/api/metrics', async (_req, res) => {
    try {
      const jobsCount = await pool.query('SELECT status, COUNT(*)::int AS count FROM transcription_jobs GROUP BY status');
      const mediaCount = await pool.query('SELECT status, COUNT(*)::int AS count FROM media_files GROUP BY status');
      const segmentsCount = await pool.query('SELECT COUNT(*)::int AS count FROM transcript_segments');
      const participantsCount = await pool.query('SELECT COUNT(*)::int AS count FROM participants');
      res.json({
        timestamp: new Date().toISOString(),
        jobs: jobsCount.rows,
        media: mediaCount.rows,
        segments: segmentsCount.rows[0].count,
        participants: participantsCount.rows[0].count,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}

export const app = buildApp();
