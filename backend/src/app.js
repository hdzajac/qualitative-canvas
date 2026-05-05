import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
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
import exportRoutes from './routes/export.js';
import importRoutes from './routes/import.js';
import authRoutes from './routes/auth.js';
import { requireAuth } from './middleware/requireAuth.js';
import { requireWorkerOrAuth } from './middleware/requireWorkerOrAuth.js';
import { requireProjectAccess } from './middleware/requireProjectAccess.js';
import { runMigrations } from './db/migrate.js';
import { subscribeToProject } from './services/projectEvents.js';

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
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
  }));

  // CORS
  const corsOrigin = process.env.FRONTEND_ORIGIN
    || process.env.CORS_ORIGIN
    || (process.env.NODE_ENV !== 'production' ? 'http://localhost:5173' : null);
  app.use(cors(corsOrigin ? {
    origin: corsOrigin,
    credentials: true,
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Disposition']
  } : {
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Disposition']
  }));

  // Exempt SSE stream from per-request rate limit — it is one long-lived connection, not a poll
  app.use('/api/projects/:projectId/events', (_req, _res, next) => next());

  // Worker requests are authenticated by a shared secret; they must not be throttled
  // by the browser-user rate limiter because diarization can trigger hundreds of
  // legitimate API calls per minute on large files.
  const workerSecret = process.env.WORKER_SECRET;
  const isWorkerRequest = (req) =>
    workerSecret && req.headers['x-worker-secret'] === workerSecret;

  // Rate limit — global (skipped for authenticated worker requests)
  const limiter = rateLimit({
    windowMs: 60_000,
    max: 600,
    skip: (req) => isWorkerRequest(req),
  });
  app.use(limiter);

  // Tighter rate limit on auth endpoints to prevent brute-force
  const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false });

  app.use(express.json({ limit: '5mb' }));
  app.use(morgan('dev'));
  app.use(cookieParser());

  // ── Public auth routes (no JWT required) ─────────────────────────────────────
  app.use('/api/auth/login',  authLimiter);
  app.use('/api/auth/signup', authLimiter);
  app.use('/api/auth', authRoutes(pool));

  // Health (public — used by load-balancers and docker health checks)
  app.get('/api/health', async (_req, res) => {
    try {
      const r = await pool.query('SELECT 1 as ok');
      const dbOk = r?.rows?.[0]?.ok === 1;
      res.json({ ok: true, dbOk, version: process.env.APP_VERSION || 'dev' });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message, version: process.env.APP_VERSION || 'dev' });
    }
  });

  // ── Protected routes — all require a valid JWT cookie ────────────────────────
  const projectGuard = requireProjectAccess(pool);

  app.use('/api/projects', requireAuth, projectsRoutes(pool));
  app.use('/api/files', requireAuth, projectGuard, filesRoutes(pool));
  app.use('/api/codes', requireAuth, projectGuard, codesRoutes(pool));
  app.use('/api/highlights', requireAuth, projectGuard, codesRoutes(pool));
  app.use('/api/themes', requireAuth, projectGuard, themesRoutes(pool));
  app.use('/api/insights', requireAuth, projectGuard, insightsRoutes(pool));
  app.use('/api/annotations', requireAuth, projectGuard, annotationsRoutes(pool));
  app.use('/api/media', requireWorkerOrAuth, projectGuard, mediaRoutes(pool));
  // Transcription: UI calls require user auth; worker calls require worker secret OR user auth
  app.use('/api', requireWorkerOrAuth, transcriptionRoutes(pool));
  app.use('/api/media/:mediaId/segments', requireWorkerOrAuth, segmentsRoutes(pool));
  app.use('/api/media/:mediaId/participants', requireWorkerOrAuth, participantsRoutes(pool));
  app.use('/api/export', requireAuth, exportRoutes(pool));
  app.use('/api/import', requireAuth, importRoutes(pool));

  // ── SSE: real-time canvas event stream (one long-lived connection per client) ─
  app.get('/api/projects/:projectId/events', requireAuth, projectGuard, (req, res) => {
    const { projectId } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx output buffering
    res.flushHeaders();

    // Immediate heartbeat so the client knows the connection is live
    res.write('event: connected\ndata: {}\n\n');

    // Keep-alive ping every 25 s (browser SSE timeout is ~30 s)
    const ping = setInterval(() => { try { res.write(':ping\n\n'); } catch {} }, 25_000);

    const unsub = subscribeToProject(projectId, (msg) => {
      try {
        if (msg.type === 'entity-changed') {
          res.write(`event: entity-changed\ndata: ${JSON.stringify(msg)}\n\n`);
        } else if (msg.type === 'job-progress') {
          res.write(`event: job-progress\ndata: ${JSON.stringify(msg)}\n\n`);
        }
      } catch {}
    });

    req.on('close', () => {
      clearInterval(ping);
      unsub();
    });
  });

  // Simple metrics endpoint (for observability) — requires authentication
  app.get('/api/metrics', requireAuth, async (_req, res) => {
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
