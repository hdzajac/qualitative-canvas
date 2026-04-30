BEGIN;

-- Unique indexes required for ON CONFLICT upserts in ensureFileEntry* and finalizeTranscript.
-- The existing PK covers the case where id = media/document file id, but the partial unique
-- indexes below also guard finalizeTranscript which inserts with a fresh uuid as the PK.
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_entries_unique_media_file_id
  ON file_entries(media_file_id) WHERE media_file_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_file_entries_unique_document_file_id
  ON file_entries(document_file_id) WHERE document_file_id IS NOT NULL;

-- Add updated_at to canvas entities for optimistic-locking conflict detection.
ALTER TABLE annotations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE insights    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE themes      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE codes       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Document the extended job status vocabulary (status is free-form TEXT, no enum).
COMMENT ON COLUMN transcription_jobs.status IS
  'queued | processing | done | error | reset | cancelled';

COMMIT;
