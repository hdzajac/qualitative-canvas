/**
 * auth.js — Routes for signup, login, logout, and current user.
 *
 * POST /api/auth/signup   { email, password, displayName? }
 * POST /api/auth/login    { email, password }
 * POST /api/auth/logout
 * GET  /api/auth/me
 * PUT  /api/auth/me       { displayName }
 */

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { hashPassword, verifyPassword, signToken } from '../services/authService.js';
import { requireAuth } from '../middleware/requireAuth.js';

const KU_EMAIL_RE = /^[^@]+@([^@]+\.)?ku\.dk$/i;

// Pre-computed bcrypt hash used for constant-time comparison when a user is not found,
// preventing timing-based user enumeration. Generated at cost 12.
const DUMMY_HASH = '$2b$12$eImiTXuWVxfM37uY4JANjO8uMkd0HnY8d2Rvf.G5FXRXzFNJcOam2';

const SignupSchema = z.object({
  email:       z.string().email().regex(KU_EMAIL_RE, 'Only @ku.dk email addresses are allowed'),
  password:    z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(1).max(128).optional(),
});

const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure:   process.env.NODE_ENV === 'production',
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path:     '/',
};

function setAuthCookie(res, user) {
  const token = signToken({ sub: user.id, email: user.email, displayName: user.display_name ?? null });
  res.cookie('auth_token', token, COOKIE_OPTS);
}

export default function authRoutes(pool) {
  const router = Router();

  // ── Sign up ──────────────────────────────────────────────────────────────────
  router.post('/signup', asyncHandler(async (req, res) => {
    const parsed = SignupSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }
    const { email, password, displayName } = parsed.data;

    const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    const passwordHash = await hashPassword(password);
    const id = uuidv4();
    const r = await pool.query(
      'INSERT INTO users (id, email, password_hash, display_name) VALUES ($1,$2,$3,$4) RETURNING *',
      [id, email.toLowerCase(), passwordHash, displayName ?? null]
    );
    const user = r.rows[0];
    setAuthCookie(res, user);
    res.status(201).json({ id: user.id, email: user.email, displayName: user.display_name ?? null });
  }));

  // ── Login ────────────────────────────────────────────────────────────────────
  router.post('/login', asyncHandler(async (req, res) => {
    const parsed = LoginSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid email or password' });

    const { email, password } = parsed.data;
    const r = await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    const user = r.rows[0];

    if (!user) {
      // Constant-time compare against a dummy hash to prevent timing-based user enumeration
      await verifyPassword(password, DUMMY_HASH);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    setAuthCookie(res, user);
    res.json({ id: user.id, email: user.email, displayName: user.display_name ?? null });
  }));

  // ── Logout ───────────────────────────────────────────────────────────────────
  router.post('/logout', (_req, res) => {
    res.clearCookie('auth_token', { path: '/' });
    res.status(204).send();
  });

  // ── Current user ─────────────────────────────────────────────────────────────
  router.get('/me', requireAuth, asyncHandler(async (req, res) => {
    const r = await pool.query('SELECT id, email, display_name, created_at FROM users WHERE id=$1', [req.user.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'User not found' });
    const u = r.rows[0];
    res.json({ id: u.id, email: u.email, displayName: u.display_name ?? null, createdAt: u.created_at });
  }));

  // ── Update profile ───────────────────────────────────────────────────────────
  router.put('/me', requireAuth, asyncHandler(async (req, res) => {
    const schema = z.object({ displayName: z.string().min(1).max(128) });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const r = await pool.query(
      'UPDATE users SET display_name=$1 WHERE id=$2 RETURNING id, email, display_name, created_at',
      [parsed.data.displayName, req.user.id]
    );
    const u = r.rows[0];
    // Re-issue cookie with updated display name
    setAuthCookie(res, u);
    res.json({ id: u.id, email: u.email, displayName: u.display_name ?? null, createdAt: u.created_at });
  }));

  return router;
}
