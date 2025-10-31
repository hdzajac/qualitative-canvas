import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import asyncHandler from 'express-async-handler';

export default function themesRoutes(pool) {
  const router = Router();

  const map = (r) => ({
    id: r.id,
    name: r.name,
    highlightIds: r.code_ids || [],
    position: r.position || undefined,
    size: r.size || undefined,
    style: r.style || undefined,
    createdAt: r.created_at.toISOString(),
  });

  router.get('/', asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    if (projectId) {
      // Filter themes that reference codes from files in the given project
      const r = await pool.query(
        `SELECT DISTINCT t.* FROM themes t
         JOIN LATERAL unnest(t.code_ids) AS cid ON true
         JOIN codes c ON c.id = cid
         JOIN files f ON f.id = c.file_id
         WHERE f.project_id = $1
         ORDER BY t.created_at DESC`,
        [projectId]
      );
      return res.json(r.rows.map(map));
    }
    const r = await pool.query('SELECT * FROM themes ORDER BY created_at DESC');
    res.json(r.rows.map(map));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const { name, codeIds, highlightIds, position, size, style } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Invalid body' });
    const ids = Array.isArray(codeIds) ? codeIds : Array.isArray(highlightIds) ? highlightIds : [];
    const id = uuidv4();
    const r = await pool.query(
      `INSERT INTO themes (id, name, code_ids, position, size, style) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, name, ids, position ?? null, size ?? null, style ?? null]
    );
    res.status(201).json(map(r.rows[0]));
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, codeIds, highlightIds, position, size, style } = req.body || {};
    const ids = Array.isArray(codeIds) ? codeIds : Array.isArray(highlightIds) ? highlightIds : null;
    const r = await pool.query(
      `UPDATE themes SET name=COALESCE($2,name), code_ids=COALESCE($3,code_ids), position=COALESCE($4,position), size=COALESCE($5,size), style=COALESCE($6,style)
       WHERE id=$1 RETURNING *`,
      [id, name ?? null, ids, position ?? null, size ?? null, style ?? null]
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
