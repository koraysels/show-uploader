import postgres from 'postgres';
import { env } from './env';

export const db = postgres(env.DATABASE_URI, { ssl: 'require', max: 5 });

export async function setJobStatus(
  jobId: string,
  status: string,
  extra: { result_url?: string; error?: string; progress_pct?: number } = {}
) {
  await db`
    UPDATE platform_jobs
    SET
      status = ${status},
      result_url = COALESCE(${extra.result_url ?? null}, result_url),
      error = COALESCE(${extra.error ?? null}, error),
      progress_pct = COALESCE(${extra.progress_pct ?? null}, progress_pct),
      updated_at = NOW()
    WHERE id = ${jobId}
      -- Never move a finished job back to processing/queued: a late upload
      -- progress callback firing after 'done' must not un-finish the job.
      AND (status NOT IN ('done', 'failed') OR ${status} IN ('done', 'failed'))
  `;
}

// On worker boot no job is running yet, so any row still in 'processing' belongs
// to a worker that died mid-run (redeploy/crash) — a permanent "processing"
// ghost in the UI. Mark them failed (retryable) before the Worker starts picking
// up new jobs, so nothing gets clobbered mid-flight.
export async function reconcileStalledJobs() {
  const rows = await db<{ id: string; platform: string; upload_id: string }[]>`
    UPDATE platform_jobs
    SET status = 'failed',
        error = 'Interrupted — worker restarted. Press retry to resume.',
        updated_at = NOW()
    WHERE status = 'processing'
    RETURNING id, platform, upload_id
  `;
  return rows;
}

export async function getPlatformJobsForUpload(uploadId: string) {
  return db<{ id: string; platform: string; status: string; result_url: string | null }[]>`
    SELECT id, platform, status, result_url FROM platform_jobs WHERE upload_id = ${uploadId}
  `;
}

export async function getUploadRow(uploadId: string) {
  const rows = await db<{ show_id: string; jingle_s3_key: string | null }[]>`
    SELECT show_id, jingle_s3_key FROM show_uploads WHERE id = ${uploadId}
  `;
  return rows[0] ?? null;
}

export async function setArchiveKey(uploadId: string, key: string) {
  await db`UPDATE show_uploads SET archive_s3_key = ${key} WHERE id = ${uploadId}`;
}

export async function setAudioKey(uploadId: string, key: string) {
  await db`UPDATE show_uploads SET audio_s3_key = ${key} WHERE id = ${uploadId}`;
}

export async function createArchiveJobRecord(uploadId: string): Promise<string | null> {
  const rows = await db<{ id: string }[]>`
    INSERT INTO platform_jobs (upload_id, platform)
    VALUES (${uploadId}, 'archive')
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  return rows[0]?.id ?? null;
}
