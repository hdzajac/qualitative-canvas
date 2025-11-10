export function mapJob(r) {
  return {
    id: r.id,
    mediaFileId: r.media_file_id,
    model: r.model ?? undefined,
    languageHint: r.language_hint ?? undefined,
    status: r.status,
    startedAt: r.started_at?.toISOString?.() ?? r.started_at ?? undefined,
    completedAt: r.completed_at?.toISOString?.() ?? r.completed_at ?? undefined,
    errorMessage: r.error_message ?? undefined,
    processedMs: r.processed_ms ?? undefined,
    totalMs: r.total_ms ?? undefined,
    etaSeconds: r.eta_seconds ?? undefined,
    updatedAt: r.updated_at?.toISOString?.() ?? r.updated_at ?? undefined,
    createdAt: r.created_at?.toISOString?.() ?? r.created_at,
  };
}

export async function createJob(pool, { id, mediaFileId, model, languageHint }) {
  const r = await pool.query(
    `INSERT INTO transcription_jobs (id, media_file_id, model, language_hint, status)
     VALUES ($1,$2,$3,$4,'queued') RETURNING *`,
    [id, mediaFileId, model ?? null, languageHint ?? null]
  );
  return mapJob(r.rows[0]);
}

export async function getJob(pool, id) {
  const r = await pool.query('SELECT * FROM transcription_jobs WHERE id = $1', [id]);
  return r.rows[0] ? mapJob(r.rows[0]) : null;
}

export async function setJobStatus(pool, id, { status, errorMessage, setStarted, setCompleted }) {
  // setStarted/setCompleted are booleans to set timestamps to now()
  const r = await pool.query(
    `UPDATE transcription_jobs
     SET status = COALESCE($2, status),
         error_message = COALESCE($3, error_message),
         started_at = CASE WHEN $4::boolean IS TRUE THEN now() ELSE started_at END,
         completed_at = CASE WHEN $5::boolean IS TRUE THEN now() ELSE completed_at END
     WHERE id = $1 RETURNING *`,
    [id, status ?? null, errorMessage ?? null, Boolean(setStarted), Boolean(setCompleted)]
  );
  return r.rows[0] ? mapJob(r.rows[0]) : null;
}

export async function leaseNextQueuedJob(pool) {
  // Atomically pick one queued job and mark it processing
  const r = await pool.query(
    `WITH cte AS (
       SELECT id FROM transcription_jobs
       WHERE status = 'queued'
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE transcription_jobs t
     SET status = 'processing', started_at = now()
     FROM cte
     WHERE t.id = cte.id
     RETURNING t.*`
  );
  return r.rows[0] ? mapJob(r.rows[0]) : null;
}

export async function setJobProgress(pool, id, { processedMs, totalMs, etaSeconds }) {
  const r = await pool.query(
    `UPDATE transcription_jobs
     SET processed_ms = COALESCE($2, processed_ms),
         total_ms = COALESCE($3, total_ms),
         eta_seconds = COALESCE($4, eta_seconds),
         updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, processedMs ?? null, totalMs ?? null, etaSeconds ?? null]
  );
  return r.rows[0] ? mapJob(r.rows[0]) : null;
}

export async function getLatestJobForMedia(pool, mediaFileId) {
  const r = await pool.query(
    `SELECT * FROM transcription_jobs
     WHERE media_file_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [mediaFileId]
  );
  return r.rows[0] ? mapJob(r.rows[0]) : null;
}
