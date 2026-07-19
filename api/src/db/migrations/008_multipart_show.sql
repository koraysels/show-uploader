-- Bind an upload session to its show from the start, so completion can record
-- the staged video server-side (the show record always knows it has a video,
-- instead of relying on the client to register it afterwards).
ALTER TABLE multipart_uploads ADD COLUMN IF NOT EXISTS show_id TEXT;
