-- 'compress' is a new platform_jobs kind: an operator-triggered re-encode that
-- shrinks an already-archived show's video, distinct from the original
-- youtube/mixcloud/archive publish jobs.

ALTER TABLE platform_jobs DROP CONSTRAINT platform_jobs_platform_check;
ALTER TABLE platform_jobs ADD CONSTRAINT platform_jobs_platform_check
  CHECK (platform IN ('youtube', 'mixcloud', 'archive', 'compress'));
