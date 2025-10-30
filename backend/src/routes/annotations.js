import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

export default function annotationsRoutes(pool) {
  const router = Router();

  const map = (r) => ({ id: r.id, content: r.content, position: r.position, size: r.size || undefined, style: r.style || undefined, createdAt: r.created_at.toISOString(), projectId: r.project_id ?? undefined });

  const PositionSchema = z.object({ x: z.number(), y: z.number() });
  const CreateSchema = z.object({ content: z.string().min(1), position: PositionSchema, projectId: z.string().uuid().optional(), size: z.any().optional(), style: z.any().optional() });
  const UpdateSchema = z.object({ content: z.string().min(1).optional(), position: PositionSchema.optional(), size: z.any().optional(), style: z.any().optional() });

  router.get('/', asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    if (projectId) {
      const r = await pool.query('SELECT * FROM annotations WHERE project_id = $1 ORDER BY created_at DESC', [projectId]);
      return res.json(r.rows.map(map));
    }
    const r = await pool.query('SELECT * FROM annotations ORDER BY created_at DESC');
    res.json(r.rows.map(map));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const parsed = CreateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const { content, position, projectId, size, style } = parsed.data;
    const id = uuidv4();
    const r = await pool.query(
      `INSERT INTO annotations (id, content, position, project_id, size, style) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, content, position, projectId ?? null, size ?? null, style ?? null]
    );
    res.status(201).json(map(r.rows[0]));
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const parsed = UpdateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const { content, position, size, style } = parsed.data;
    const r = await pool.query(
      `UPDATE annotations SET content=COALESCE($2,content), position=COALESCE($3,position), size=COALESCE($4,size), style=COALESCE($5,style)
       WHERE id=$1 RETURNING *`,
      [id, content ?? null, position ?? null, size ?? null, style ?? null]
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
