export function mapCode(r) {
  return {
    id: r.id,
    fileId: r.file_entry_id || r.file_id, // Support both for backwards compatibility
    fileName: r.file_name || undefined, // Include the file/transcript name
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
    // Support querying by file_entry_id (which could be either a document or media file)
    const r = await pool.query(
      `SELECT c.*, fe.name as file_name 
       FROM codes c
       LEFT JOIN file_entries fe ON fe.id = c.file_entry_id
       WHERE c.file_entry_id = $1 OR c.file_id = $1 
       ORDER BY c.created_at DESC`,
      [fileId]
    );
    return r.rows.map(mapCode);
  }
  if (projectId) {
    const r = await pool.query(
      `SELECT c.*, fe.name as file_name FROM codes c
       LEFT JOIN file_entries fe ON fe.id = c.file_entry_id
       LEFT JOIN files f ON f.id = c.file_id
       WHERE fe.project_id = $1 OR f.project_id = $1
       ORDER BY c.created_at DESC`,
      [projectId]
    );
    return r.rows.map(mapCode);
  }
  const r = await pool.query(
    `SELECT c.*, fe.name as file_name 
     FROM codes c
     LEFT JOIN file_entries fe ON fe.id = c.file_entry_id
     ORDER BY c.created_at DESC`
  );
  return r.rows.map(mapCode);
}

export async function createCode(pool, { id, fileId, startOffset, endOffset, text, codeName, position, size, style }) {
  // Ensure file_entry exists for this fileId (it might be a media file or document file)
  const { ensureFileEntryForMedia, ensureFileEntryForDocument } = await import('./fileEntriesDao.js');
  
  // Check if this is a media file or document file
  const mediaCheck = await pool.query('SELECT id FROM media_files WHERE id = $1', [fileId]);
  const isMedia = mediaCheck.rows.length > 0;
  
  let fileEntry;
  let documentFileId = null; // Only set for document files (for backward compatibility)
  
  if (isMedia) {
    fileEntry = await ensureFileEntryForMedia(pool, fileId);
  } else {
    fileEntry = await ensureFileEntryForDocument(pool, fileId);
    documentFileId = fileId; // For documents, keep the file_id reference
  }
  
  const r = await pool.query(
    `INSERT INTO codes (id, file_entry_id, file_id, start_offset, end_offset, text, code_name, position, size, style)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [id, fileEntry.id, documentFileId, startOffset, endOffset, text, codeName, position ?? null, size ?? null, style ?? null]
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
