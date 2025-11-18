import { v4 as uuidv4 } from 'uuid';
import { listSegmentsForMedia } from './segmentsDao.js';
import { getMedia } from './mediaDao.js';
import { createFile } from './filesDao.js';

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
  // Check media exists
  const media = await getMedia(pool, mediaFileId);
  if (!media) throw new Error('Media not found');
  // Idempotent finalize - check if already done
  const existing = await getFinalized(pool, mediaFileId);
  if (existing && existing.fileId) return existing; // return existing mapping
  
  // Gather segments
  const segments = await listSegmentsForMedia(pool, mediaFileId);
  const originalCount = segments.length;
  // Build transcript content
  const lines = [];
  function fmt(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const mm = String(m).padStart(2,'0');
    const hh = String(h).padStart(2,'0'); // ensure 00:MM:SS format
    const ss = String(s).padStart(2,'0');
    return `${hh}:${mm}:${ss}`;
  }
  for (const seg of segments) {
    lines.push(`[${fmt(seg.startMs)} - ${fmt(seg.endMs)}] ${seg.text}`);
  }
  const content = lines.join('\n');
  const fileId = uuidv4();
  const filename = (media.originalFilename || 'transcript') + '.transcript.txt';
  const file = await createFile(pool, { id: fileId, filename, content, projectId: media.projectId });
  
  // Check if a file_entry already exists for this media (finalized state)
  const existingEntry = await pool.query(
    'SELECT id FROM file_entries WHERE media_file_id = $1 AND type = $2',
    [mediaFileId, 'transcript']
  );
  
  if (existingEntry.rows.length === 0) {
    // Create file_entry for the transcript (references media only, not the document file)
    await pool.query(
      'INSERT INTO file_entries (id, project_id, media_file_id, name, type) VALUES ($1, $2, $3, $4, $5)',
      [uuidv4(), media.projectId, mediaFileId, filename, 'transcript']
    );
  }
  
  return {
    mediaFileId: mediaFileId,
    fileId: fileId,
    finalizedAt: new Date().toISOString(),
    originalSegmentCount: originalCount
  };
}
