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

// Helper: Get or create file entry for a media file (transcript)
export async function ensureFileEntryForMedia(pool, mediaFileId) {
  // Check if entry already exists
  const existing = await pool.query(
    'SELECT * FROM file_entries WHERE media_file_id = $1',
    [mediaFileId]
  );
  if (existing.rows[0]) {
    return mapFileEntry(existing.rows[0]);
  }
  
  // Get media file info
  const mediaResult = await pool.query(
    'SELECT id, project_id, original_filename, created_at FROM media_files WHERE id = $1',
    [mediaFileId]
  );
  if (!mediaResult.rows[0]) {
    throw new Error('Media file not found');
  }
  
  const media = mediaResult.rows[0];
  
  // Create file entry
  return createFileEntry(pool, {
    id: media.id, // Use same ID as media file
    projectId: media.project_id,
    documentFileId: null,
    mediaFileId: media.id,
    name: media.original_filename,
    type: 'transcript',
  });
}

// Helper: Get or create file entry for a document file
export async function ensureFileEntryForDocument(pool, documentFileId) {
  // Check if entry already exists
  const existing = await pool.query(
    'SELECT * FROM file_entries WHERE document_file_id = $1',
    [documentFileId]
  );
  if (existing.rows[0]) {
    return mapFileEntry(existing.rows[0]);
  }
  
  // Get document file info
  const docResult = await pool.query(
    'SELECT id, project_id, filename, created_at FROM files WHERE id = $1',
    [documentFileId]
  );
  if (!docResult.rows[0]) {
    throw new Error('Document file not found');
  }
  
  const doc = docResult.rows[0];
  
  // Create file entry
  return createFileEntry(pool, {
    id: doc.id, // Use same ID as document file
    projectId: doc.project_id,
    documentFileId: doc.id,
    mediaFileId: null,
    name: doc.filename,
    type: 'document',
  });
}
