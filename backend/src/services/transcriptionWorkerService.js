import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool.js';
import { replaceSegmentsBulk } from '../dao/segmentsDao.js';
import { setJobStatus } from '../dao/jobsDao.js';
import { updateMedia, getMedia } from '../dao/mediaDao.js';

// This is a server-side helper that can be invoked to simulate generating segments
// until a real external worker posts them. Useful for development or a "local fast path".

export async function simulateTranscription(job) {
  // Ensure media exists
  const media = await getMedia(pool, job.mediaFileId);
  if (!media) throw new Error('Media not found for job');
  // Fake segments (two simple chunks) with placeholder timings
  const segments = [
    { id: uuidv4(), idx: 0, startMs: 0, endMs: 1500, text: 'This is a simulated transcription segment.' },
    { id: uuidv4(), idx: 1, startMs: 1500, endMs: 3200, text: 'Replace with real faster-whisper output soon.' },
  ];
  await replaceSegmentsBulk(pool, job.mediaFileId, segments);
  // Mark job done
  await setJobStatus(pool, job.id, { status: 'done', setCompleted: true });
  await updateMedia(pool, job.mediaFileId, { status: 'done' });
  
  // Create file entry for this transcript so it can be coded
  const { ensureFileEntryForMedia } = await import('../dao/fileEntriesDao.js');
  await ensureFileEntryForMedia(pool, job.mediaFileId);
  
  return segments.length;
}
