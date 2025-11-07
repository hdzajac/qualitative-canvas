import { v4 as uuidv4 } from 'uuid';

export function mapParticipant(r) {
  return {
    id: r.id,
    mediaFileId: r.media_file_id,
    name: r.name,
    canonicalKey: r.canonical_key ?? undefined,
    color: r.color ?? undefined,
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
  };
}

export async function listParticipants(pool, mediaFileId) {
  const r = await pool.query('SELECT * FROM participants WHERE media_file_id = $1 ORDER BY created_at', [mediaFileId]);
  return r.rows.map(mapParticipant);
}

export async function createParticipant(pool, { mediaFileId, name, canonicalKey, color }) {
  const id = uuidv4();
  const r = await pool.query(
    `INSERT INTO participants (id, media_file_id, name, canonical_key, color)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [id, mediaFileId, name, canonicalKey ?? null, color ?? null]
  );
  return mapParticipant(r.rows[0]);
}

export async function updateParticipant(pool, id, { name, canonicalKey, color }) {
  const r = await pool.query(
    `UPDATE participants
     SET name = COALESCE($2, name),
         canonical_key = COALESCE($3, canonical_key),
         color = COALESCE($4, color)
     WHERE id = $1
     RETURNING *`,
    [id, name ?? null, canonicalKey ?? null, color ?? null]
  );
  return r.rows[0] ? mapParticipant(r.rows[0]) : null;
}

export async function deleteParticipant(pool, id) {
  await pool.query('DELETE FROM participants WHERE id = $1', [id]);
}
