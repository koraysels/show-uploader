-- Resumable multipart upload sessions. The S3 UploadId + key live here so an
-- upload survives a page reload (client re-selects the file, server ListParts
-- says which parts already landed) and stale sessions can be cleaned up.
CREATE TABLE IF NOT EXISTS multipart_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  s3_key TEXT NOT NULL,
  s3_upload_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  content_type TEXT NOT NULL,
  part_size INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | completed | aborted
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS multipart_uploads_status_created
  ON multipart_uploads (status, created_at);
