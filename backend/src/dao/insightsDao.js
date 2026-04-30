export function mapInsight(r) {
  return {
    id: r.id,
    name: r.name,
    themeIds: r.theme_ids || [],
    projectId: r.project_id,
    position: r.position || undefined,
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
    updatedAt: r.updated_at?.toISOString?.() ?? r.updated_at ?? undefined,
    expanded: r.expanded ?? undefined,
    size: r.size || undefined,
    style: r.style || undefined,
  };
}

export async function listInsights(pool, { projectId } = {}) {
  if (projectId) {
    const r = await pool.query(
      `SELECT * FROM insights WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId]
    );
    return r.rows.map(mapInsight);
  }
  const r = await pool.query('SELECT * FROM insights ORDER BY created_at DESC');
  return r.rows.map(mapInsight);
}

export async function createInsight(pool, { id, name, themeIds, projectId, position, expanded, size, style }) {
  const r = await pool.query(
    `INSERT INTO insights (id, name, theme_ids, project_id, position, expanded, size, style) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [id, name, Array.isArray(themeIds) ? themeIds : [], projectId ?? null, position ?? null, expanded ?? null, size ?? null, style ?? null]
  );
  return mapInsight(r.rows[0]);
}

export async function updateInsight(pool, id, userId, { name, themeIds, position, expanded, size, style, ifUnmodifiedSince }) {
  const r = await pool.query(
    `UPDATE insights
      SET name=COALESCE($3,name), theme_ids=COALESCE($4,theme_ids), position=COALESCE($5,position),
          expanded=COALESCE($6,expanded), size=COALESCE($7,size), style=COALESCE($8,style),
          updated_at=now()
     WHERE id=$1
       AND ($9::timestamptz IS NULL OR updated_at = $9)
       AND EXISTS (
         SELECT 1 FROM project_members WHERE project_id = insights.project_id AND user_id = $2
       )
     RETURNING *`,
    [id, userId, name ?? null, Array.isArray(themeIds) ? themeIds : null, position ?? null, expanded ?? null, size ?? null, style ?? null,
     ifUnmodifiedSince ?? null]
  );
  return r.rows[0] ? mapInsight(r.rows[0]) : null;
}

export async function deleteInsight(pool, id, userId) {
  const r = await pool.query(
    `DELETE FROM insights
     WHERE id=$1
       AND EXISTS (
         SELECT 1 FROM project_members WHERE project_id = insights.project_id AND user_id = $2
       )
     RETURNING project_id`,
    [id, userId]
  );
  return r.rows[0]?.project_id ?? null;
}
