-- Effective post-trim video length, set by the archive job once ffprobe has
-- run on the source. Null for uploads archived before this column existed.
ALTER TABLE show_uploads ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
