export function mapSegment(r) {
  return {
    id: r.id,
    mediaFileId: r.media_file_id,
    idx: r.idx,
    startMs: r.start_ms,
    endMs: r.end_ms,
    text: r.text,
    participantId: r.participant_id ?? undefined,
    participantName: r.participant_name ?? undefined,
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
  };
}

export async function listSegmentsForMedia(pool, mediaFileId) {
  const r = await pool.query(
    `SELECT ts.*, p.name AS participant_name
     FROM transcript_segments ts
     LEFT JOIN participants p ON p.id = ts.participant_id
     WHERE ts.media_file_id = $1
     ORDER BY ts.idx ASC`,
    [mediaFileId]
  );
  return r.rows.map(mapSegment);
}

export async function countSegmentsForMedia(pool, mediaFileId) {
  const r = await pool.query(
    'SELECT COUNT(*)::int AS count FROM transcript_segments WHERE media_file_id = $1',
    [mediaFileId]
  );
  return r.rows[0]?.count ?? 0;
}

export async function getSegment(pool, id) {
  const r = await pool.query('SELECT * FROM transcript_segments WHERE id = $1', [id]);
  return r.rows[0] ? mapSegment(r.rows[0]) : null;
}

export async function updateSegment(pool, id, { text, participantId } = {}) {
  const r = await pool.query(
    `UPDATE transcript_segments
     SET text = COALESCE($2, text),
         participant_id = $3
     WHERE id = $1
     RETURNING *`,
    [id, text ?? null, participantId ?? null]
  );
  return r.rows[0] ? mapSegment(r.rows[0]) : null;
}

export async function replaceSegmentsBulk(pool, mediaFileId, segments) {
  // Optionally delete existing then insert provided segments with given idx
  await pool.query('DELETE FROM transcript_segments WHERE media_file_id = $1', [mediaFileId]);
  if (!segments || segments.length === 0) return [];
  const values = [];
  const params = [];
  let p = 1;
  for (const s of segments) {
    // id uuid, media_file_id, idx, start_ms, end_ms, text, participant_id
    values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
    params.push(s.id, mediaFileId, s.idx, s.startMs, s.endMs, s.text, s.participantId ?? null);
  }
  const q = `INSERT INTO transcript_segments (id, media_file_id, idx, start_ms, end_ms, text, participant_id)
             VALUES ${values.join(', ')} RETURNING *`;
  const r = await pool.query(q, params);
  return r.rows.map(mapSegment);
}

/**
 * Bulk-assign a participant to segments by explicit IDs and/or by a time range intersection.
 * If participantId is null, clears the participant assignment.
 * Returns number of updated rows.
 */
export async function assignParticipantToSegments(pool, mediaFileId, { participantId, segmentIds, startMs, endMs }) {
  const clauses = ['media_file_id = $1'];
  const params = [mediaFileId];
  let p = 2;
  if (Array.isArray(segmentIds) && segmentIds.length > 0) {
    const inList = segmentIds.map((_id, i) => `$${p + i}`).join(',');
    clauses.push(`id IN (${inList})`);
    params.push(...segmentIds);
    p += segmentIds.length;
  }
  if (typeof startMs === 'number' || typeof endMs === 'number') {
    // Overlap condition: (start_ms < endMs) AND (end_ms > startMs). Missing bounds treated as open interval.
    if (typeof endMs === 'number') {
      clauses.push(`start_ms < $${p++}`);
      params.push(endMs);
    }
    if (typeof startMs === 'number') {
      clauses.push(`end_ms > $${p++}`);
      params.push(startMs);
    }
  }
  if (clauses.length === 1) {
    // No target selector provided other than media id
    return { updated: 0 };
  }
  const r = await pool.query(
    `UPDATE transcript_segments
     SET participant_id = $${p}
     WHERE ${clauses.join(' AND ')}`,
    [...params, participantId ?? null]
  );
  return { updated: r.rowCount };
}
