import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import asyncHandler from 'express-async-handler';

export default function themesRoutes(pool) {
  const router = Router();

  const map = (r) => ({
    id: r.id,
    name: r.name,
    highlightIds: r.highlight_ids || [],
    position: r.position || undefined,
    createdAt: r.created_at.toISOString(),
  });

  router.get('/', asyncHandler(async (_req, res) => {
    const r = await pool.query('SELECT * FROM themes ORDER BY created_at DESC');
    res.json(r.rows.map(map));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const { name, highlightIds, position } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Invalid body' });
    const id = uuidv4();
    const r = await pool.query(
      `INSERT INTO themes (id, name, highlight_ids, position) VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, name, Array.isArray(highlightIds) ? highlightIds : [], position ?? null]
    );
    res.status(201).json(map(r.rows[0]));
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, highlightIds, position } = req.body || {};
    const r = await pool.query(
      `UPDATE themes SET name=COALESCE($2,name), highlight_ids=COALESCE($3,highlight_ids), position=COALESCE($4,position)
       WHERE id=$1 RETURNING *`,
      [id, name ?? null, Array.isArray(highlightIds) ? highlightIds : null, position ?? null]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(map(r.rows[0]));
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const r = await pool.query('DELETE FROM themes WHERE id=$1 RETURNING id', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  }));

  return router;
}
