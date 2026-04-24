/**
 * authService.js — bcrypt password hashing and JWT issuance/verification.
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRY    = '7d';

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s === 'REPLACE_WITH_RANDOM_SECRET') {
    throw new Error('JWT_SECRET env var is not set. Set a random string in .env.');
  }
  return s;
}

export function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

export function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

export function signToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token) {
  return jwt.verify(token, getSecret());
}
