CREATE TABLE IF NOT EXISTS show_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  image_url TEXT,
  video_s3_key TEXT NOT NULL,
  archive_s3_key TEXT,
  jingle_s3_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES show_uploads(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'mixcloud', 'archive')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  result_url TEXT,
  error TEXT,
  progress_pct INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_jobs_upload_id ON platform_jobs(upload_id);
CREATE INDEX IF NOT EXISTS idx_platform_jobs_status ON platform_jobs(status);
