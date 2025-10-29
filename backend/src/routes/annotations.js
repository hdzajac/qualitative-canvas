import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import asyncHandler from 'express-async-handler';

export default function annotationsRoutes(pool) {
  const router = Router();

  const map = (r) => ({ id: r.id, content: r.content, position: r.position, createdAt: r.created_at.toISOString() });

  router.get('/', asyncHandler(async (_req, res) => {
    const r = await pool.query('SELECT * FROM annotations ORDER BY created_at DESC');
    res.json(r.rows.map(map));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const { content, position } = req.body || {};
    if (!content || !position) return res.status(400).json({ error: 'Invalid body' });
    const id = uuidv4();
    const r = await pool.query(
      `INSERT INTO annotations (id, content, position) VALUES ($1,$2,$3) RETURNING *`,
      [id, content, position]
    );
    res.status(201).json(map(r.rows[0]));
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { content, position } = req.body || {};
    const r = await pool.query(
      `UPDATE annotations SET content=COALESCE($2,content), position=COALESCE($3,position)
       WHERE id=$1 RETURNING *`,
      [id, content ?? null, position ?? null]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(map(r.rows[0]));
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const r = await pool.query('DELETE FROM annotations WHERE id=$1 RETURNING id', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  }));

  return router;
}
