BEGIN;

-- Create a unified file_entries table that can represent both text documents and media transcripts
-- This allows codes to reference either type uniformly
CREATE TABLE IF NOT EXISTS file_entries (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  -- One and only one of these should be set:
  document_file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  media_file_id UUID REFERENCES media_files(id) ON DELETE CASCADE,
  -- Display metadata
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('document', 'transcript')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Ensure exactly one source is set
  CONSTRAINT file_entries_one_source CHECK (
    (document_file_id IS NOT NULL AND media_file_id IS NULL) OR
    (document_file_id IS NULL AND media_file_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_file_entries_project ON file_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_file_entries_document ON file_entries(document_file_id);
CREATE INDEX IF NOT EXISTS idx_file_entries_media ON file_entries(media_file_id);
CREATE INDEX IF NOT EXISTS idx_file_entries_created_at ON file_entries(created_at DESC);

-- Migrate existing files to file_entries
INSERT INTO file_entries (id, project_id, document_file_id, media_file_id, name, type, created_at)
SELECT 
  id,
  project_id,
  id as document_file_id,
  NULL as media_file_id,
  filename as name,
  'document' as type,
  created_at
FROM files
ON CONFLICT (id) DO NOTHING;

-- Migrate existing media files to file_entries (as transcripts)
INSERT INTO file_entries (id, project_id, document_file_id, media_file_id, name, type, created_at)
SELECT 
  id,
  project_id,
  NULL as document_file_id,
  id as media_file_id,
  original_filename as name,
  'transcript' as type,
  created_at
FROM media_files
WHERE status = 'done'  -- Only create entries for completed transcripts
ON CONFLICT (id) DO NOTHING;

-- Update codes table to reference file_entries instead of files directly
-- First, add the new column
ALTER TABLE codes ADD COLUMN IF NOT EXISTS file_entry_id UUID REFERENCES file_entries(id) ON DELETE CASCADE;

-- Migrate existing codes to use file_entry_id (document files already have matching file_entries)
UPDATE codes SET file_entry_id = file_id WHERE file_entry_id IS NULL AND file_id IS NOT NULL;

-- Once all codes are migrated, we can make file_entry_id NOT NULL and drop the old file_id
-- But we'll do this in a way that's backwards compatible for now
-- Update the constraint: codes now require file_entry_id
ALTER TABLE codes ALTER COLUMN file_id DROP NOT NULL;
ALTER TABLE codes ADD CONSTRAINT codes_require_file_entry CHECK (file_entry_id IS NOT NULL);

-- Create index for the new column
CREATE INDEX IF NOT EXISTS idx_codes_file_entry ON codes(file_entry_id);

-- Drop the old finalized transcripts table as it's no longer needed
-- (We'll handle transcript coding through file_entries now)
DROP TABLE IF EXISTS transcripts_finalized;

COMMIT;
