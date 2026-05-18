CREATE TABLE IF NOT EXISTS pending_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  s3_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  claimed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE show_uploads
  ADD COLUMN IF NOT EXISTS trim_start TEXT,
  ADD COLUMN IF NOT EXISTS trim_end TEXT;
