BEGIN;

-- Base schema extracted from previous initDb logic
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY,
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS codes (
  id UUID PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
  end_offset INTEGER NOT NULL CHECK (end_offset >= 0),
  text TEXT NOT NULL,
  code_name TEXT NOT NULL,
  position JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS themes (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  code_ids UUID[] NOT NULL DEFAULT '{}',
  position JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS insights (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  theme_ids UUID[] NOT NULL DEFAULT '{}',
  position JSONB,
  expanded BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS annotations (
  id UUID PRIMARY KEY,
  content TEXT NOT NULL,
  position JSONB NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE annotations ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_codes_file_id ON codes(file_id);
CREATE INDEX IF NOT EXISTS idx_codes_created_at ON codes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_themes_created_at ON themes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insights_created_at ON insights(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_annotations_created_at ON annotations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_annotations_project_id ON annotations(project_id);

COMMIT;