-- A given upload has at most one job per platform. Without this constraint the
-- ON CONFLICT DO NOTHING in createArchiveJobRecord never fires, so two platform
-- jobs finishing concurrently could each enqueue a duplicate archive job.

-- Drop any existing duplicates, keeping the earliest row per (upload_id, platform).
DELETE FROM platform_jobs a
USING platform_jobs b
WHERE a.upload_id = b.upload_id
  AND a.platform = b.platform
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS platform_jobs_upload_platform_uniq
  ON platform_jobs (upload_id, platform);
