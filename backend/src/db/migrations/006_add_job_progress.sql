BEGIN;

ALTER TABLE transcription_jobs
  ADD COLUMN IF NOT EXISTS processed_ms INTEGER,
  ADD COLUMN IF NOT EXISTS total_ms INTEGER,
  ADD COLUMN IF NOT EXISTS eta_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_transcription_jobs_media_status ON transcription_jobs(media_file_id, status);

COMMIT;
