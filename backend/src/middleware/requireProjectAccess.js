/**
 * requireProjectAccess.js — Express middleware.
 * Checks that req.user is a member (owner or member) of the project
 * referenced in req.query.projectId or req.body.projectId or req.params.projectId.
 *
 * If no projectId is present in the request, access is allowed (route-level
 * resources like /api/codes?projectId=... still get filtered in the DAO).
 *
 * Attach AFTER requireAuth.
 */

export function requireProjectAccess(pool) {
  return async function (req, res, next) {
    const projectId =
      req.params.projectId ||
      req.query.projectId ||
      req.body?.projectId;

    if (!projectId) return next();

    try {
      const r = await pool.query(
        'SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2',
        [projectId, req.user.id]
      );
      if (r.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied to this project' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware that checks ownership of a project (role = 'owner').
 * Use on destructive or admin-only operations.
 */
export function requireProjectOwner(pool) {
  return async function (req, res, next) {
    const projectId = req.params.id || req.params.projectId;
    if (!projectId) return next();
    try {
      const r = await pool.query(
        "SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2 AND role='owner'",
        [projectId, req.user.id]
      );
      if (r.rows.length === 0) {
        return res.status(403).json({ error: 'Only the project owner can do this' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
