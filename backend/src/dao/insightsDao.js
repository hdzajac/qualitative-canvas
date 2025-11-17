export function mapInsight(r) {
  return {
    id: r.id,
    name: r.name,
    themeIds: r.theme_ids || [],
    projectId: r.project_id,
    position: r.position || undefined,
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
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

export async function updateInsight(pool, id, { name, themeIds, position, expanded, size, style }) {
  const r = await pool.query(
    `UPDATE insights SET name=COALESCE($2,name), theme_ids=COALESCE($3,theme_ids), position=COALESCE($4,position), expanded=COALESCE($5,expanded), size=COALESCE($6,size), style=COALESCE($7,style)
     WHERE id=$1 RETURNING *`,
    [id, name ?? null, Array.isArray(themeIds) ? themeIds : null, position ?? null, expanded ?? null, size ?? null, style ?? null]
  );
  return r.rows[0] ? mapInsight(r.rows[0]) : null;
}

export async function deleteInsight(pool, id) {
  const r = await pool.query('DELETE FROM insights WHERE id=$1 RETURNING id', [id]);
  return Boolean(r.rows[0]);
}
