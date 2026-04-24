import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';
import projectsService from '../services/projectsService.js';
import { requireProjectOwner } from '../middleware/requireProjectAccess.js';

export default function projectsRoutes(pool) {
  const router = Router();
  const service = projectsService(pool);

  const CreateSchema = z.object({ name: z.string().min(1).max(256), description: z.string().max(2000).optional() });
  const UpdateSchema = z.object({ name: z.string().min(1).max(256).optional(), description: z.string().max(2000).optional() });

  // List only projects the current user belongs to
  router.get('/', asyncHandler(async (req, res) => {
    const list = await service.listForUser(req.user.id);
    res.json(list);
  }));

  // Get a single project (must be a member)
  router.get('/:id', asyncHandler(async (req, res) => {
    const access = await pool.query(
      'SELECT role FROM project_members WHERE project_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (access.rows.length === 0) return res.status(403).json({ error: 'Access denied' });
    const project = await service.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json({ ...project, role: access.rows[0].role });
  }));

  // Create a project — current user becomes owner
  router.post('/', asyncHandler(async (req, res) => {
    const parsed = CreateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const created = await service.createForUser(parsed.data, req.user.id);
    res.status(201).json(created);
  }));

  // Update a project (owner only)
  router.put('/:id', requireProjectOwner(pool), asyncHandler(async (req, res) => {
    const parsed = UpdateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const updated = await service.update(req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  }));

  // Delete a project (owner only)
  router.delete('/:id', requireProjectOwner(pool), asyncHandler(async (req, res) => {
    const ok = await service.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  }));

  // ── Member management ────────────────────────────────────────────────────────

  // List members (any project member can view)
  router.get('/:id/members', asyncHandler(async (req, res) => {
    const access = await pool.query(
      'SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (access.rows.length === 0) return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      `SELECT u.id, u.email, u.display_name, pm.role, pm.added_at
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1
       ORDER BY pm.added_at ASC`,
      [req.params.id]
    );
    res.json(r.rows.map(row => ({
      id: row.id, email: row.email, displayName: row.display_name ?? null,
      role: row.role, addedAt: row.added_at,
    })));
  }));

  // Add a member by email (owner only)
  router.post('/:id/members', requireProjectOwner(pool), asyncHandler(async (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      role:  z.enum(['owner', 'member']).default('member'),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const { email, role } = parsed.data;
    const userRow = await pool.query('SELECT id, email, display_name FROM users WHERE email=$1', [email.toLowerCase()]);
    if (userRow.rows.length === 0) return res.status(404).json({ error: 'No account found for that email' });
    const u = userRow.rows[0];
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1,$2,$3)
       ON CONFLICT (project_id, user_id) DO UPDATE SET role=$3`,
      [req.params.id, u.id, role]
    );
    res.status(201).json({ id: u.id, email: u.email, displayName: u.display_name ?? null, role });
  }));

  // Change a member's role (owner only)
  router.put('/:id/members/:userId', requireProjectOwner(pool), asyncHandler(async (req, res) => {
    const schema = z.object({ role: z.enum(['owner', 'member']) });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const r = await pool.query(
      'UPDATE project_members SET role=$1 WHERE project_id=$2 AND user_id=$3 RETURNING *',
      [parsed.data.role, req.params.id, req.params.userId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Member not found' });
    res.json({ role: r.rows[0].role });
  }));

  // Remove a member (owner only; cannot remove self if last owner)
  router.delete('/:id/members/:userId', requireProjectOwner(pool), asyncHandler(async (req, res) => {
    if (req.params.userId === req.user.id) {
      const owners = await pool.query(
        "SELECT COUNT(*)::int AS count FROM project_members WHERE project_id=$1 AND role='owner'",
        [req.params.id]
      );
      if (owners.rows[0].count <= 1) {
        return res.status(400).json({ error: 'Cannot remove the only owner. Transfer ownership first.' });
      }
    }
    await pool.query(
      'DELETE FROM project_members WHERE project_id=$1 AND user_id=$2',
      [req.params.id, req.params.userId]
    );
    res.status(204).send();
  }));

  return router;
}

