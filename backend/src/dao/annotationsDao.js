export function mapAnnotation(r) {
  return {
    id: r.id,
    content: r.content,
    position: r.position,
    size: r.size || undefined,
    style: r.style || undefined,
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    updatedAt: r.updated_at?.toISOString?.() ?? r.updated_at ?? undefined,
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

export async function updateAnnotation(pool, id, userId, { content, position, size, style, ifUnmodifiedSince }) {
  const r = await pool.query(
    `UPDATE annotations
      SET content=COALESCE($3,content), position=COALESCE($4,position),
          size=COALESCE($5,size), style=COALESCE($6,style),
          updated_at=now()
     WHERE id=$1
       AND ($7::timestamptz IS NULL OR updated_at = $7)
       AND EXISTS (
         SELECT 1 FROM project_members WHERE project_id = annotations.project_id AND user_id = $2
       )
     RETURNING *`,
    [id, userId, content ?? null, position ?? null, size ?? null, style ?? null,
     ifUnmodifiedSince ?? null]
  );
  return r.rows[0] ? mapAnnotation(r.rows[0]) : null;
}

export async function deleteAnnotation(pool, id, userId) {
  const r = await pool.query(
    `DELETE FROM annotations
     WHERE id=$1
       AND EXISTS (
         SELECT 1 FROM project_members WHERE project_id = annotations.project_id AND user_id = $2
       )
     RETURNING project_id`,
    [id, userId]
  );
  return r.rows[0]?.project_id ?? null;
}
