-- Add imported_at metadata field to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;

-- Index for querying imported projects
CREATE INDEX IF NOT EXISTS idx_projects_imported_at ON projects(imported_at) WHERE imported_at IS NOT NULL;
