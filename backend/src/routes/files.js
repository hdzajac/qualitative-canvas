import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import asyncHandler from 'express-async-handler';

export default function filesRoutes(pool) {
  const router = Router();

  const map = (r) => ({ id: r.id, filename: r.filename, content: r.content, createdAt: r.created_at.toISOString() });

  router.get('/', asyncHandler(async (_req, res) => {
    const r = await pool.query('SELECT * FROM files ORDER BY created_at DESC');
    res.json(r.rows.map(map));
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const r = await pool.query('SELECT * FROM files WHERE id = $1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(map(r.rows[0]));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const { filename, content } = req.body || {};
    if (!filename || typeof content !== 'string') return res.status(400).json({ error: 'Invalid body' });
    const id = uuidv4();
    const r = await pool.query('INSERT INTO files (id, filename, content) VALUES ($1,$2,$3) RETURNING *', [id, filename, content]);
    res.status(201).json(map(r.rows[0]));
  }));

  return router;
}
