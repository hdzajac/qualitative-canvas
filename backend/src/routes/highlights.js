import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import asyncHandler from 'express-async-handler';

export default function highlightsRoutes(pool) {
  const router = Router();

  const map = (r) => ({
    id: r.id,
    fileId: r.file_id,
    startOffset: r.start_offset,
    endOffset: r.end_offset,
    text: r.text,
    codeName: r.code_name,
    position: r.position || undefined,
    createdAt: r.created_at.toISOString(),
  });

  router.get('/', asyncHandler(async (req, res) => {
    const { fileId, projectId } = req.query;
    // Filter by fileId
    if (fileId) {
      const r = await pool.query('SELECT * FROM highlights WHERE file_id = $1 ORDER BY created_at DESC', [fileId]);
      return res.json(r.rows.map(map));
    }
    // Filter by projectId via files join
    if (projectId) {
      const r = await pool.query(
        `SELECT h.* FROM highlights h
         JOIN files f ON f.id = h.file_id
         WHERE f.project_id = $1
         ORDER BY h.created_at DESC`,
        [projectId]
      );
      return res.json(r.rows.map(map));
    }
    // Default: return all
    const r = await pool.query('SELECT * FROM highlights ORDER BY created_at DESC');
    res.json(r.rows.map(map));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const { fileId, startOffset, endOffset, text, codeName, position } = req.body || {};
    if (!fileId || startOffset == null || endOffset == null || !text || !codeName)
      return res.status(400).json({ error: 'Invalid body' });
    const id = uuidv4();
    const r = await pool.query(
      `INSERT INTO highlights (id, file_id, start_offset, end_offset, text, code_name, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, fileId, startOffset, endOffset, text, codeName, position ?? null]
    );
    res.status(201).json(map(r.rows[0]));
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { startOffset, endOffset, text, codeName, position } = req.body || {};
    const r = await pool.query(
      `UPDATE highlights SET start_offset=COALESCE($2,start_offset), end_offset=COALESCE($3,end_offset),
        text=COALESCE($4,text), code_name=COALESCE($5,code_name), position=COALESCE($6,position)
       WHERE id=$1 RETURNING *`,
      [id, startOffset, endOffset, text, codeName, position ?? null]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(map(r.rows[0]));
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const r = await pool.query('DELETE FROM highlights WHERE id=$1 RETURNING id', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  }));

  return router;
}
