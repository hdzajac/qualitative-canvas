-- Projects table and relation to documents/files
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add project_id to files to treat them as documents belonging to a project
ALTER TABLE files ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id);

-- Optional: separate documents table referencing files by id for extensibility
-- Uncomment if you want a dedicated documents entity distinct from raw files
-- CREATE TABLE IF NOT EXISTS documents (
--   id UUID PRIMARY KEY,
--   file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
--   project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
-- );
-- CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id);
