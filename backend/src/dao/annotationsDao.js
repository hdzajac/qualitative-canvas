export function mapAnnotation(r) {
  return {
    id: r.id,
    content: r.content,
    position: r.position,
    size: r.size || undefined,
    style: r.style || undefined,
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    projectId: r.project_id ?? undefined,
  };
}

export async function listAnnotations(pool, { projectId } = {}) {
  if (projectId) {
    const r = await pool.query('SELECT * FROM annotations WHERE project_id = $1 ORDER BY created_at DESC', [projectId]);
    return r.rows.map(mapAnnotation);
  }
  const r = await pool.query('SELECT * FROM annotations ORDER BY created_at DESC');
  return r.rows.map(mapAnnotation);
}

export async function createAnnotation(pool, { id, content, position, projectId, size, style }) {
  const r = await pool.query(
    `INSERT INTO annotations (id, content, position, project_id, size, style) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [id, content, position, projectId ?? null, size ?? null, style ?? null]
  );
  return mapAnnotation(r.rows[0]);
}

export async function updateAnnotation(pool, id, { content, position, size, style }) {
  const r = await pool.query(
    `UPDATE annotations SET content=COALESCE($2,content), position=COALESCE($3,position), size=COALESCE($4,size), style=COALESCE($5,style)
     WHERE id=$1 RETURNING *`,
    [id, content ?? null, position ?? null, size ?? null, style ?? null]
  );
  return r.rows[0] ? mapAnnotation(r.rows[0]) : null;
}

export async function deleteAnnotation(pool, id) {
  const r = await pool.query('DELETE FROM annotations WHERE id=$1 RETURNING id', [id]);
  return Boolean(r.rows[0]);
}
