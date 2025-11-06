export function mapTheme(r) {
  return {
    id: r.id,
    name: r.name,
    highlightIds: r.code_ids || [],
    position: r.position || undefined,
    size: r.size || undefined,
    style: r.style || undefined,
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
  };
}

export async function listThemes(pool, { projectId } = {}) {
  if (projectId) {
    const r = await pool.query(
      `SELECT DISTINCT t.* FROM themes t
       JOIN LATERAL unnest(t.code_ids) AS cid ON true
       JOIN codes c ON c.id = cid
       JOIN files f ON f.id = c.file_id
       WHERE f.project_id = $1
       ORDER BY t.created_at DESC`,
      [projectId]
    );
    return r.rows.map(mapTheme);
  }
  const r = await pool.query('SELECT * FROM themes ORDER BY created_at DESC');
  return r.rows.map(mapTheme);
}

export async function createTheme(pool, { id, name, codeIds, highlightIds, position, size, style }) {
  const ids = Array.isArray(codeIds) ? codeIds : Array.isArray(highlightIds) ? highlightIds : [];
  const r = await pool.query(
    `INSERT INTO themes (id, name, code_ids, position, size, style) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [id, name, ids, position ?? null, size ?? null, style ?? null]
  );
  return mapTheme(r.rows[0]);
}

export async function updateTheme(pool, id, { name, codeIds, highlightIds, position, size, style }) {
  const ids = Array.isArray(codeIds) ? codeIds : Array.isArray(highlightIds) ? highlightIds : null;
  const r = await pool.query(
    `UPDATE themes SET name=COALESCE($2,name), code_ids=COALESCE($3,code_ids), position=COALESCE($4,position), size=COALESCE($5,size), style=COALESCE($6,style)
     WHERE id=$1 RETURNING *`,
    [id, name ?? null, ids, position ?? null, size ?? null, style ?? null]
  );
  return r.rows[0] ? mapTheme(r.rows[0]) : null;
}

export async function deleteTheme(pool, id) {
  const r = await pool.query('DELETE FROM themes WHERE id=$1 RETURNING id', [id]);
  return Boolean(r.rows[0]);
}
