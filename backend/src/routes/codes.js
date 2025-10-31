import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import asyncHandler from 'express-async-handler';

export default function codesRoutes(pool) {
  const router = Router();

  const map = (r) => ({
    id: r.id,
    fileId: r.file_id,
    startOffset: r.start_offset,
    endOffset: r.end_offset,
    text: r.text,
    codeName: r.code_name,
    position: r.position || undefined,
    size: r.size || undefined,
    style: r.style || undefined,
    createdAt: r.created_at.toISOString(),
  });

  router.get('/', asyncHandler(async (req, res) => {
    const { fileId, projectId } = req.query;
    if (fileId) {
      const r = await pool.query('SELECT * FROM codes WHERE file_id = $1 ORDER BY created_at DESC', [fileId]);
      return res.json(r.rows.map(map));
    }
    if (projectId) {
      const r = await pool.query(
        `SELECT c.* FROM codes c
         JOIN files f ON f.id = c.file_id
         WHERE f.project_id = $1
         ORDER BY c.created_at DESC`,
        [projectId]
      );
      return res.json(r.rows.map(map));
    }
    const r = await pool.query('SELECT * FROM codes ORDER BY created_at DESC');
    res.json(r.rows.map(map));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const { fileId, startOffset, endOffset, text, codeName, position, size, style } = req.body || {};
    if (!fileId || startOffset == null || endOffset == null || !text || !codeName)
      return res.status(400).json({ error: 'Invalid body' });
    const id = uuidv4();
    const r = await pool.query(
      `INSERT INTO codes (id, file_id, start_offset, end_offset, text, code_name, position, size, style)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [id, fileId, startOffset, endOffset, text, codeName, position ?? null, size ?? null, style ?? null]
    );
    res.status(201).json(map(r.rows[0]));
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { startOffset, endOffset, text, codeName, position, size, style } = req.body || {};
    const r = await pool.query(
      `UPDATE codes SET start_offset=COALESCE($2,start_offset), end_offset=COALESCE($3,end_offset),
        text=COALESCE($4,text), code_name=COALESCE($5,code_name), position=COALESCE($6,position), size=COALESCE($7,size), style=COALESCE($8,style)
       WHERE id=$1 RETURNING *`,
      [id, startOffset, endOffset, text, codeName, position ?? null, size ?? null, style ?? null]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(map(r.rows[0]));
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const r = await pool.query('DELETE FROM codes WHERE id=$1 RETURNING id', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  }));

  return router;
}
