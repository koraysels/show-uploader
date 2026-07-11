-- A completed-but-not-yet-published video for a show. The file is already on S3;
-- this row keeps the reference so a page refresh (or another crew member's
-- browser) still sees the uploaded video ready to publish. One per show; a new
-- upload replaces the previous staged one. Cleared when the show is published.
CREATE TABLE IF NOT EXISTS staged_uploads (
  show_id     TEXT PRIMARY KEY,
  s3_key      TEXT NOT NULL,
  filename    TEXT NOT NULL,
  size_bytes  BIGINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
