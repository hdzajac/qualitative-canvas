BEGIN;

-- Media files table to store uploaded audio/video and metadata
CREATE TABLE IF NOT EXISTS media_files (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  size_bytes BIGINT,
  duration_sec INTEGER,
  status TEXT NOT NULL DEFAULT 'uploaded', -- uploaded | processing | done | error
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_media_files_project_id ON media_files(project_id);
CREATE INDEX IF NOT EXISTS idx_media_files_created_at ON media_files(created_at DESC);

-- Transcription jobs table to track processing lifecycle
CREATE TABLE IF NOT EXISTS transcription_jobs (
  id UUID PRIMARY KEY,
  media_file_id UUID NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  model TEXT,
  language_hint TEXT,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | processing | done | error
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_media_id ON transcription_jobs(media_file_id);
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_created_at ON transcription_jobs(created_at DESC);

-- Participants per media (speakers)
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY,
  media_file_id UUID NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  canonical_key TEXT,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_participants_media_id ON participants(media_file_id);

-- Transcript segments with timings and optional participant
CREATE TABLE IF NOT EXISTS transcript_segments (
  id UUID PRIMARY KEY,
  media_file_id UUID NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
  end_ms INTEGER NOT NULL CHECK (end_ms >= 0),
  text TEXT NOT NULL,
  participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_segments_media_id ON transcript_segments(media_file_id);
CREATE INDEX IF NOT EXISTS idx_segments_media_idx ON transcript_segments(media_file_id, idx);

-- Finalization mapping (link media transcript to files table for coding)
CREATE TABLE IF NOT EXISTS transcripts_finalized (
  media_file_id UUID PRIMARY KEY REFERENCES media_files(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  original_segment_count INTEGER
);

COMMIT;
