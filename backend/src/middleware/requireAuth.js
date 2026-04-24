/**
 * requireAuth.js — Express middleware.
 * Reads JWT from the auth_token HttpOnly cookie, verifies it,
 * and attaches req.user = { id, email, displayName }.
 * Returns 401 if the cookie is absent or the token is invalid/expired.
 */

import { verifyToken } from '../services/authService.js';

export function requireAuth(req, res, next) {
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
