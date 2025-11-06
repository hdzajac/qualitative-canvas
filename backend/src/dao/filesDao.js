export function mapFile(r) {
  return { id: r.id, filename: r.filename, content: r.content, createdAt: r.created_at?.toISOString?.() ?? r.created_at, projectId: r.project_id ?? undefined };
}

export async function listFiles(pool, { projectId } = {}) {
  if (projectId) {
    const r = await pool.query('SELECT * FROM files WHERE project_id = $1 ORDER BY created_at DESC', [projectId]);
    return r.rows.map(mapFile);
    
  }
  const r = await pool.query('SELECT * FROM files ORDER BY created_at DESC');
  return r.rows.map(mapFile);
}

export async function getFile(pool, id) {
  const r = await pool.query('SELECT * FROM files WHERE id = $1', [id]);
  return r.rows[0] ? mapFile(r.rows[0]) : null;
}

export async function createFile(pool, { id, filename, content, projectId }) {
  const r = await pool.query('INSERT INTO files (id, filename, content, project_id) VALUES ($1,$2,$3,$4) RETURNING *', [id, filename, content, projectId ?? null]);
  return mapFile(r.rows[0]);
}

export async function updateFile(pool, id, { filename, content, projectId }) {
  const r = await pool.query(
    `UPDATE files SET filename = COALESCE($2, filename), content = COALESCE($3, content), project_id = COALESCE($4, project_id)
     WHERE id = $1 RETURNING *`,
    [id, filename ?? null, content ?? null, projectId ?? null]
  );
  return r.rows[0] ? mapFile(r.rows[0]) : null;
}

export async function deleteFile(pool, id) {
  const r = await pool.query('DELETE FROM files WHERE id=$1 RETURNING id', [id]);
  return Boolean(r.rows[0]);
}
