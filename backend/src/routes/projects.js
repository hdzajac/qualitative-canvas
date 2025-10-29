import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import asyncHandler from 'express-async-handler';

export default function projectsRoutes(pool) {
  const router = Router();

  const map = (r) => ({ id: r.id, name: r.name, description: r.description ?? undefined, createdAt: r.created_at.toISOString() });

  router.get('/', asyncHandler(async (_req, res) => {
    const r = await pool.query('SELECT * FROM projects ORDER BY created_at DESC');
    res.json(r.rows.map(map));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const { name, description } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Invalid body' });
    const id = uuidv4();
    const r = await pool.query('INSERT INTO projects (id, name, description) VALUES ($1,$2,$3) RETURNING *', [id, name, description ?? null]);
    res.status(201).json(map(r.rows[0]));
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body || {};
    const r = await pool.query('UPDATE projects SET name=COALESCE($2,name), description=COALESCE($3,description) WHERE id=$1 RETURNING *', [id, name ?? null, description ?? null]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(map(r.rows[0]));
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const r = await pool.query('DELETE FROM projects WHERE id=$1 RETURNING id', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  }));

  return router;
}
