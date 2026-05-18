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
  `;
}

export async function getPlatformJobsForUpload(uploadId: string) {
  return db<{ id: string; platform: string; status: string }[]>`
    SELECT id, platform, status FROM platform_jobs WHERE upload_id = ${uploadId}
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

export async function createArchiveJobRecord(uploadId: string): Promise<string | null> {
  const rows = await db<{ id: string }[]>`
    INSERT INTO platform_jobs (upload_id, platform)
    VALUES (${uploadId}, 'archive')
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  return rows[0]?.id ?? null;
}
