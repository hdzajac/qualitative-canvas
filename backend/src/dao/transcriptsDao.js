import { v4 as uuidv4 } from 'uuid';
import { mapSegment } from './segmentsDao.js';

function mapFinalized(r) {
  if (!r) return null;
  return {
    mediaFileId: r.media_file_id,
    fileId: r.file_id,
    finalizedAt: r.finalized_at?.toISOString?.() ?? r.finalized_at,
    originalSegmentCount: r.original_segment_count ?? undefined,
  };
}

export async function getFinalized(pool, mediaFileId) {
  // Check if a file_entry exists for this media (indicates finalization already done)
  const feResult = await pool.query(
    'SELECT created_at FROM file_entries WHERE media_file_id = $1 AND type = $2',
    [mediaFileId, 'transcript']
  );
  
  if (feResult.rows.length === 0) return null;
  
  // Find the associated transcript file by looking for the most recent .transcript.txt file in this project
  // created after the file_entry was created
  const fileResult = await pool.query(
    `SELECT f.id, f.created_at
     FROM files f
     JOIN media_files mf ON mf.project_id = f.project_id
     WHERE mf.id = $1
     AND f.filename LIKE '%.transcript.txt'
     AND f.created_at >= $2
     ORDER BY f.created_at DESC
     LIMIT 1`,
    [mediaFileId, feResult.rows[0].created_at]
  );
  
  // Count segments for original_segment_count
  const segmentCount = await pool.query(
    'SELECT COUNT(*) as count FROM transcript_segments WHERE media_file_id = $1',
    [mediaFileId]
  );
  
  return {
    mediaFileId: mediaFileId,
    fileId: fileResult.rows.length > 0 ? fileResult.rows[0].id : null,
    finalizedAt: feResult.rows[0].created_at?.toISOString?.() ?? feResult.rows[0].created_at,
    originalSegmentCount: parseInt(segmentCount.rows[0].count, 10)
  };
}

export async function finalizeTranscript(pool, mediaFileId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the media row to serialise concurrent finalisation calls for the same media file.
    const mediaLock = await client.query(
      'SELECT id, project_id, original_filename, status FROM media_files WHERE id = $1 FOR UPDATE',
      [mediaFileId]
    );
    if (!mediaLock.rows[0]) {
      await client.query('ROLLBACK');
      throw new Error('Media not found');
    }
    const mediaRow = mediaLock.rows[0];

    // Idempotent: if a file_entry already exists for this media, return it immediately.
    const existingEntry = await client.query(
      'SELECT id FROM file_entries WHERE media_file_id = $1 AND type = $2',
      [mediaFileId, 'transcript']
    );
    if (existingEntry.rows.length > 0) {
      await client.query('COMMIT');
      // Delegate to the read-only getFinalized path (uses pool, outside the released client).
      return getFinalized(pool, mediaFileId);
    }

    // Gather segments (read inside the lock so the count is consistent).
    const segsResult = await client.query(
      `SELECT ts.*, p.name AS participant_name
       FROM transcript_segments ts
       LEFT JOIN participants p ON p.id = ts.participant_id
       WHERE ts.media_file_id = $1
       ORDER BY ts.idx ASC`,
      [mediaFileId]
    );
    const segments = segsResult.rows.map(mapSegment);
    const originalCount = segments.length;

    // Build transcript text content.
    function fmt(ms) {
      const totalSec = Math.floor(ms / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
    const lines = segments.map(seg => `[${fmt(seg.startMs)} - ${fmt(seg.endMs)}] ${seg.text}`);
    const content = lines.join('\n');

    const fileId = uuidv4();
    const filename = (mediaRow.original_filename || 'transcript') + '.transcript.txt';

    // Insert the document file and the file_entry inside the same transaction.
    await client.query(
      'INSERT INTO files (id, project_id, filename, content) VALUES ($1, $2, $3, $4)',
      [fileId, mediaRow.project_id, filename, content]
    );

    // ON CONFLICT requires the unique partial index added in migration 013.
    await client.query(
      `INSERT INTO file_entries (id, project_id, media_file_id, name, type)
       VALUES ($1, $2, $3, $4, 'transcript')
       ON CONFLICT (media_file_id) WHERE media_file_id IS NOT NULL DO NOTHING`,
      [uuidv4(), mediaRow.project_id, mediaFileId, filename]
    );

    await client.query('COMMIT');

    return {
      mediaFileId,
      fileId,
      finalizedAt: new Date().toISOString(),
      originalSegmentCount: originalCount,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
