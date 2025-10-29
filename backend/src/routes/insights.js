import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import asyncHandler from 'express-async-handler';

export default function insightsRoutes(pool) {
  const router = Router();

  const map = (r) => ({
    id: r.id,
    name: r.name,
    themeIds: r.theme_ids || [],
    position: r.position || undefined,
    createdAt: r.created_at.toISOString(),
    expanded: r.expanded ?? undefined,
  });

  router.get('/', asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    if (projectId) {
      const r = await pool.query(
        `SELECT DISTINCT i.* FROM insights i
         JOIN LATERAL unnest(i.theme_ids) AS tid ON true
         JOIN themes t ON t.id = tid
         JOIN LATERAL unnest(t.highlight_ids) AS hid ON true
         JOIN highlights h ON h.id = hid
         JOIN files f ON f.id = h.file_id
         WHERE f.project_id = $1
         ORDER BY i.created_at DESC`,
        [projectId]
      );
      return res.json(r.rows.map(map));
    }
    const r = await pool.query('SELECT * FROM insights ORDER BY created_at DESC');
    res.json(r.rows.map(map));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const { name, themeIds, position, expanded } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Invalid body' });
    const id = uuidv4();
    const r = await pool.query(
      `INSERT INTO insights (id, name, theme_ids, position, expanded) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [id, name, Array.isArray(themeIds) ? themeIds : [], position ?? null, expanded ?? null]
    );
    res.status(201).json(map(r.rows[0]));
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, themeIds, position, expanded } = req.body || {};
    const r = await pool.query(
      `UPDATE insights SET name=COALESCE($2,name), theme_ids=COALESCE($3,theme_ids), position=COALESCE($4,position), expanded=COALESCE($5,expanded)
       WHERE id=$1 RETURNING *`,
      [id, name ?? null, Array.isArray(themeIds) ? themeIds : null, position ?? null, expanded ?? null]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(map(r.rows[0]));
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const r = await pool.query('DELETE FROM insights WHERE id=$1 RETURNING id', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  }));

  return router;
}
