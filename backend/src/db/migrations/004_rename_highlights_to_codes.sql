BEGIN;

-- Rename table highlights -> codes if needed
DO $$
BEGIN
  IF to_regclass('public.codes') IS NULL AND to_regclass('public.highlights') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE highlights RENAME TO codes';
  END IF;
END
$$;

-- Ensure indexes exist on codes and drop old highlight indexes if present
DO $$
BEGIN
  IF to_regclass('public.idx_highlights_file_id') IS NOT NULL THEN
    EXECUTE 'DROP INDEX idx_highlights_file_id';
  END IF;
  IF to_regclass('public.idx_highlights_created_at') IS NOT NULL THEN
    EXECUTE 'DROP INDEX idx_highlights_created_at';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_codes_file_id ON codes(file_id);
CREATE INDEX IF NOT EXISTS idx_codes_created_at ON codes(created_at DESC);

-- Ensure visual columns exist on codes (for fresh DBs or after rename)
ALTER TABLE IF EXISTS codes
  ADD COLUMN IF NOT EXISTS size JSONB,
  ADD COLUMN IF NOT EXISTS style JSONB;

-- Themes: add code_ids and migrate data from highlight_ids if present
ALTER TABLE IF EXISTS themes
  ADD COLUMN IF NOT EXISTS code_ids UUID[] NOT NULL DEFAULT '{}';

-- Copy values from legacy highlight_ids when available
UPDATE themes SET code_ids = highlight_ids
WHERE highlight_ids IS NOT NULL AND (
  code_ids IS NULL OR array_length(code_ids,1) IS NULL OR array_length(code_ids,1) = 0
);

COMMIT;
