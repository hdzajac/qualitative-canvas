BEGIN;

-- Delete existing documents as per requirement
DELETE FROM files;

-- Ensure every file belongs to a project and cascade on project deletion
ALTER TABLE files DROP CONSTRAINT IF EXISTS files_project_id_fkey;
ALTER TABLE files ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE files
  ADD CONSTRAINT files_project_id_fkey FOREIGN KEY (project_id)
  REFERENCES projects(id) ON DELETE CASCADE;

COMMIT;
