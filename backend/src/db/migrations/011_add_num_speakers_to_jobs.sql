BEGIN;

ALTER TABLE transcription_jobs
  ADD COLUMN IF NOT EXISTS num_speakers INTEGER;

COMMIT;
