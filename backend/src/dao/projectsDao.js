export function mapProject(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
  };
}

export async function listProjects(pool) {
  const r = await pool.query('SELECT * FROM projects ORDER BY created_at DESC');
  return r.rows.map(mapProject);
}

export async function getProject(pool, id) {
  const r = await pool.query('SELECT * FROM projects WHERE id=$1', [id]);
  return r.rows[0] ? mapProject(r.rows[0]) : null;
}

export async function createProject(pool, { id, name, description }) {
  const r = await pool.query(
    'INSERT INTO projects (id, name, description) VALUES ($1,$2,$3) RETURNING *',
    [id, name, description ?? null]
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
