// File entries DAO - unified abstraction for documents and transcripts

export function mapFileEntry(r) {
  return {
    id: r.id,
    projectId: r.project_id,
    documentFileId: r.document_file_id || undefined,
    mediaFileId: r.media_file_id || undefined,
    name: r.name,
    type: r.type, // 'document' | 'transcript'
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
  };
}

export async function listFileEntries(pool, { projectId } = {}) {
  if (projectId) {
    const r = await pool.query(
      'SELECT * FROM file_entries WHERE project_id = $1 ORDER BY created_at DESC',
      [projectId]
    );
    return r.rows.map(mapFileEntry);
  }
  const r = await pool.query('SELECT * FROM file_entries ORDER BY created_at DESC');
  return r.rows.map(mapFileEntry);
}

export async function getFileEntry(pool, id) {
  const r = await pool.query('SELECT * FROM file_entries WHERE id = $1', [id]);
  return r.rows[0] ? mapFileEntry(r.rows[0]) : null;
}

export async function createFileEntry(pool, { id, projectId, documentFileId, mediaFileId, name, type }) {
  const r = await pool.query(
    `INSERT INTO file_entries (id, project_id, document_file_id, media_file_id, name, type)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [id, projectId, documentFileId || null, mediaFileId || null, name, type]
  );
  return mapFileEntry(r.rows[0]);
}

export async function deleteFileEntry(pool, id) {
  const r = await pool.query('DELETE FROM file_entries WHERE id = $1 RETURNING id', [id]);
  return Boolean(r.rows[0]);
}

// Helper: Get or create file entry for a media file (transcript).
// Uses an upsert (ON CONFLICT) to eliminate the SELECT-then-INSERT TOCTOU race.
export async function ensureFileEntryForMedia(pool, mediaFileId) {
  const mediaResult = await pool.query(
    'SELECT id, project_id, original_filename FROM media_files WHERE id = $1',
    [mediaFileId]
  );
  if (!mediaResult.rows[0]) {
    throw new Error('Media file not found');
  }
  const media = mediaResult.rows[0];
  // id = media.id (same as media file) so ON CONFLICT (id) handles concurrent inserts.
  const r = await pool.query(
    `INSERT INTO file_entries (id, project_id, media_file_id, name, type)
     VALUES ($1, $2, $3, $4, 'transcript')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [media.id, media.project_id, media.id, media.original_filename]
  );
  return mapFileEntry(r.rows[0]);
}

// Helper: Get or create file entry for a document file.
// Uses an upsert (ON CONFLICT) to eliminate the SELECT-then-INSERT TOCTOU race.
export async function ensureFileEntryForDocument(pool, documentFileId) {
  const docResult = await pool.query(
    'SELECT id, project_id, filename FROM files WHERE id = $1',
    [documentFileId]
  );
  if (!docResult.rows[0]) {
    throw new Error('Document file not found');
  }
  const doc = docResult.rows[0];
  // id = doc.id (same as document file) so ON CONFLICT (id) handles concurrent inserts.
  const r = await pool.query(
    `INSERT INTO file_entries (id, project_id, document_file_id, name, type)
     VALUES ($1, $2, $3, $4, 'document')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [doc.id, doc.project_id, doc.id, doc.filename]
  );
  return mapFileEntry(r.rows[0]);
}
