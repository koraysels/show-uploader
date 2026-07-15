-- Separate extracted-audio archive, downloadable independently of the video.
-- The original upload (video_s3_key, any format incl. MKV) stays the video
-- archive; this holds the trimmed audio track (m4a) the worker extracts.
ALTER TABLE show_uploads ADD COLUMN IF NOT EXISTS audio_s3_key TEXT;
