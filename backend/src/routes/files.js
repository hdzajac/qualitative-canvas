import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import asyncHandler from 'express-async-handler';

export default function filesRoutes(pool) {
  const router = Router();

  const map = (r) => ({ id: r.id, filename: r.filename, content: r.content, createdAt: r.created_at.toISOString(), projectId: r.project_id ?? undefined });

  router.get('/', asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    if (projectId) {
      const r = await pool.query('SELECT * FROM files WHERE project_id = $1 ORDER BY created_at DESC', [projectId]);
      return res.json(r.rows.map(map));
    }
    const r = await pool.query('SELECT * FROM files ORDER BY created_at DESC');
    res.json(r.rows.map(map));
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const r = await pool.query('SELECT * FROM files WHERE id = $1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(map(r.rows[0]));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const { filename, content, projectId } = req.body || {};
    if (!filename || typeof content !== 'string') return res.status(400).json({ error: 'Invalid body' });
    const id = uuidv4();
    const r = await pool.query('INSERT INTO files (id, filename, content, project_id) VALUES ($1,$2,$3,$4) RETURNING *', [id, filename, content, projectId ?? null]);
    res.status(201).json(map(r.rows[0]));
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { filename, content, projectId } = req.body || {};
    const r = await pool.query(
      `UPDATE files SET filename = COALESCE($2, filename), content = COALESCE($3, content), project_id = COALESCE($4, project_id)
       WHERE id = $1 RETURNING *`,
      [id, filename ?? null, content ?? null, projectId ?? null]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(map(r.rows[0]));
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const r = await pool.query('DELETE FROM files WHERE id=$1 RETURNING id', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  }));

  return router;
}
