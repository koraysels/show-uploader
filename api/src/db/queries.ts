import type { Sql } from 'postgres';

export type ShowUpload = {
  id: string;
  show_id: string;
  title: string;
  description: string | null;
  tags: string[];
  image_url: string | null;
  video_s3_key: string;
  archive_s3_key: string | null;
  jingle_s3_key: string | null;
  created_at: Date;
};

export type PlatformJob = {
  id: string;
  upload_id: string;
  platform: 'youtube' | 'mixcloud' | 'archive';
  status: 'queued' | 'processing' | 'done' | 'failed';
  result_url: string | null;
  error: string | null;
  progress_pct: number;
  created_at: Date;
  updated_at: Date;
};

export function createUpload(
  db: Sql,
  data: Pick<ShowUpload, 'show_id' | 'title' | 'description' | 'tags' | 'image_url' | 'video_s3_key' | 'jingle_s3_key'>
) {
  return db<ShowUpload[]>`
    INSERT INTO show_uploads (show_id, title, description, tags, image_url, video_s3_key, jingle_s3_key)
    VALUES (
      ${data.show_id}, ${data.title}, ${data.description ?? null},
      ${db.array(data.tags)}, ${data.image_url ?? null},
      ${data.video_s3_key}, ${data.jingle_s3_key ?? null}
    )
    RETURNING *
  `.then((rows) => rows[0]);
}

export function createPlatformJob(
  db: Sql,
  data: Pick<PlatformJob, 'upload_id' | 'platform'>
) {
  return db<PlatformJob[]>`
    INSERT INTO platform_jobs (upload_id, platform)
    VALUES (${data.upload_id}, ${data.platform})
    RETURNING *
  `.then((rows) => rows[0]);
}

export function getUploadWithJobs(db: Sql, uploadId: string) {
  return db<(ShowUpload & { jobs: PlatformJob[] })[]>`
    SELECT
      u.*,
      COALESCE(
        json_agg(j ORDER BY j.created_at) FILTER (WHERE j.id IS NOT NULL),
        '[]'
      ) AS jobs
    FROM show_uploads u
    LEFT JOIN platform_jobs j ON j.upload_id = u.id
    WHERE u.id = ${uploadId}
    GROUP BY u.id
  `.then((rows) => rows[0] ?? null);
}

export function listUploadsWithJobs(db: Sql) {
  return db<(ShowUpload & { jobs: PlatformJob[] })[]>`
    SELECT
      u.*,
      COALESCE(
        json_agg(j ORDER BY j.created_at) FILTER (WHERE j.id IS NOT NULL),
        '[]'
      ) AS jobs
    FROM show_uploads u
    LEFT JOIN platform_jobs j ON j.upload_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
    LIMIT 50
  `;
}

export function updateJobStatus(
  db: Sql,
  jobId: string,
  update: Partial<Pick<PlatformJob, 'status' | 'result_url' | 'error' | 'progress_pct'>>
) {
  return db`
    UPDATE platform_jobs
    SET
      status = COALESCE(${update.status ?? null}, status),
      result_url = COALESCE(${update.result_url ?? null}, result_url),
      error = COALESCE(${update.error ?? null}, error),
      progress_pct = COALESCE(${update.progress_pct ?? null}, progress_pct),
      updated_at = NOW()
    WHERE id = ${jobId}
  `;
}

export function updateArchiveKey(db: Sql, uploadId: string, archiveS3Key: string) {
  return db`
    UPDATE show_uploads SET archive_s3_key = ${archiveS3Key} WHERE id = ${uploadId}
  `;
}

export function getPlatformJobsForUpload(db: Sql, uploadId: string) {
  return db<PlatformJob[]>`
    SELECT * FROM platform_jobs WHERE upload_id = ${uploadId}
  `;
}
