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
  const r = await pool.query('SELECT * FROM transcripts_finalized WHERE media_file_id = $1', [mediaFileId]);
  return mapFinalized(r.rows[0]) || null;
}

export async function finalizeTranscript(pool, mediaFileId) {
  // Check media exists
  const media = await getMedia(pool, mediaFileId);
  if (!media) throw new Error('Media not found');
  // Idempotent finalize
  const existing = await getFinalized(pool, mediaFileId);
  if (existing) return existing; // return existing mapping
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
  const fr = await pool.query(
    'INSERT INTO transcripts_finalized (media_file_id, file_id, original_segment_count) VALUES ($1,$2,$3) RETURNING *',
    [mediaFileId, fileId, originalCount]
  );
  return mapFinalized(fr.rows[0]);
}
