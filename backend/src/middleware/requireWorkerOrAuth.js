/**
 * requireWorkerOrAuth.js — Express middleware for internal worker routes.
 * Accepts either:
 *   - A valid user JWT cookie (for UI polling job status), OR
 *   - The X-Worker-Secret header matching WORKER_SECRET env var.
 *
 * This lets the Python worker call internal job routes without a user session.
 */

import { verifyToken } from '../services/authService.js';

export function requireWorkerOrAuth(req, res, next) {
  // Check worker secret first (fast path for the Python service)
  const workerSecret = process.env.WORKER_SECRET;
  if (workerSecret && workerSecret !== 'REPLACE_WITH_RANDOM_WORKER_SECRET') {
    if (req.headers['x-worker-secret'] === workerSecret) {
      req.user = { id: 'worker', email: 'worker', displayName: 'Worker' };
      return next();
    }
  }

  // Fall through to standard JWT auth
  const token = req.cookies?.auth_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, email: payload.email, displayName: payload.displayName };
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }
}
