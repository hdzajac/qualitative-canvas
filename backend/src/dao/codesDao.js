export function mapCode(r) {
  return {
    id: r.id,
    fileId: r.file_id,
    startOffset: r.start_offset,
    endOffset: r.end_offset,
    text: r.text,
    codeName: r.code_name,
    position: r.position || undefined,
    size: r.size || undefined,
    style: r.style || undefined,
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
  };
}

export async function listCodes(pool, { fileId, projectId } = {}) {
  if (fileId) {
    const r = await pool.query('SELECT * FROM codes WHERE file_id = $1 ORDER BY created_at DESC', [fileId]);
    return r.rows.map(mapCode);
  }
  if (projectId) {
    const r = await pool.query(
      `SELECT c.* FROM codes c
       JOIN files f ON f.id = c.file_id
       WHERE f.project_id = $1
       ORDER BY c.created_at DESC`,
      [projectId]
    );
    return r.rows.map(mapCode);
  }
  const r = await pool.query('SELECT * FROM codes ORDER BY created_at DESC');
  return r.rows.map(mapCode);
}

export async function createCode(pool, { id, fileId, startOffset, endOffset, text, codeName, position, size, style }) {
  const r = await pool.query(
    `INSERT INTO codes (id, file_id, start_offset, end_offset, text, code_name, position, size, style)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [id, fileId, startOffset, endOffset, text, codeName, position ?? null, size ?? null, style ?? null]
  );
  return mapCode(r.rows[0]);
}

export async function updateCode(pool, id, { startOffset, endOffset, text, codeName, position, size, style }) {
  const r = await pool.query(
    `UPDATE codes SET start_offset=COALESCE($2,start_offset), end_offset=COALESCE($3,end_offset),
      text=COALESCE($4,text), code_name=COALESCE($5,code_name), position=COALESCE($6,position), size=COALESCE($7,size), style=COALESCE($8,style)
     WHERE id=$1 RETURNING *`,
    [id, startOffset, endOffset, text, codeName, position ?? null, size ?? null, style ?? null]
  );
  return r.rows[0] ? mapCode(r.rows[0]) : null;
}

export async function deleteCode(pool, id) {
  const r = await pool.query('DELETE FROM codes WHERE id=$1 RETURNING id', [id]);
  return Boolean(r.rows[0]);
}
