export function mapProject(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    importedAt: r.imported_at?.toISOString?.() ?? r.imported_at ?? undefined,
    ownerId: r.owner_id ?? undefined,
  };
}

export async function listProjects(pool) {
  const r = await pool.query('SELECT * FROM projects ORDER BY created_at DESC');
  return r.rows.map(mapProject);
}

export async function listProjectsForUser(pool, userId) {
  const r = await pool.query(
    `SELECT p.*, pm.role
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = $1
     ORDER BY p.created_at DESC`,
    [userId]
  );
  return r.rows.map(row => ({ ...mapProject(row), role: row.role }));
}

export async function getProject(pool, id) {
  const r = await pool.query('SELECT * FROM projects WHERE id=$1', [id]);
  return r.rows[0] ? mapProject(r.rows[0]) : null;
}

export async function createProject(pool, { id, name, description, ownerId }) {
  const r = await pool.query(
    'INSERT INTO projects (id, name, description, owner_id) VALUES ($1,$2,$3,$4) RETURNING *',
    [id, name, description ?? null, ownerId ?? null]
  );
  return mapProject(r.rows[0]);
}

export async function updateProject(pool, id, { name, description }) {
  const r = await pool.query(
    'UPDATE projects SET name=COALESCE($2,name), description=COALESCE($3,description) WHERE id=$1 RETURNING *',
    [id, name ?? null, description ?? null]
  );
  return r.rows[0] ? mapProject(r.rows[0]) : null;
}

export async function deleteProject(pool, id) {
  const r = await pool.query('DELETE FROM projects WHERE id=$1 RETURNING id', [id]);
  return Boolean(r.rows[0]);
}

