-- Serialize this migration across concurrent test runners to avoid deadlocks
SELECT pg_advisory_lock(777000007);

-- Ensure all media files are linked to a project.
-- If orphaned media exist but at least one project exists, assign them to the earliest project.
DO $$
DECLARE fallback UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM media_files WHERE project_id IS NULL) THEN
    SELECT id INTO fallback FROM projects ORDER BY created_at LIMIT 1;
    IF fallback IS NULL THEN
      RAISE EXCEPTION 'Cannot enforce NOT NULL on media_files.project_id: no projects exist while orphaned media rows present.';
    END IF;
    UPDATE media_files SET project_id = fallback WHERE project_id IS NULL;
  END IF;
END $$;

ALTER TABLE media_files ALTER COLUMN project_id SET NOT NULL;

-- Release advisory lock (also released automatically at transaction commit)
SELECT pg_advisory_unlock(777000007);
