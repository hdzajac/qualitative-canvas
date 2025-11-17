BEGIN;

-- Add project_id to themes table
ALTER TABLE themes ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- Add project_id to insights table
ALTER TABLE insights ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- Create indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_themes_project_id ON themes(project_id);
CREATE INDEX IF NOT EXISTS idx_insights_project_id ON insights(project_id);

-- Migrate existing themes to a project by finding the project through their codes
-- For themes with codes, assign them to the project of their first code's file
UPDATE themes t
SET project_id = (
  SELECT f.project_id
  FROM codes c
  JOIN files f ON f.id = c.file_id
  WHERE c.id = ANY(t.code_ids)
  LIMIT 1
)
WHERE t.project_id IS NULL AND array_length(t.code_ids, 1) > 0;

-- Migrate existing insights to a project by finding the project through their themes
-- For insights with themes, assign them to the project of their first theme
UPDATE insights i
SET project_id = (
  SELECT t.project_id
  FROM themes t
  WHERE t.id = ANY(i.theme_ids)
  AND t.project_id IS NOT NULL
  LIMIT 1
)
WHERE i.project_id IS NULL AND array_length(i.theme_ids, 1) > 0;

-- For any remaining orphaned themes/insights without codes/themes, 
-- we could assign them to the first project or leave them NULL to be handled manually
-- Leaving them NULL for now so they can be manually assigned or cleaned up

COMMIT;
