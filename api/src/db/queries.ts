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
  audio_s3_key: string | null;
  jingle_s3_key: string | null;
  trim_start: string | null;
  trim_end: string | null;
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
  data: Pick<ShowUpload, 'show_id' | 'title' | 'description' | 'tags' | 'image_url' | 'video_s3_key' | 'jingle_s3_key' | 'trim_start' | 'trim_end'>
) {
  return db<ShowUpload[]>`
    INSERT INTO show_uploads (show_id, title, description, tags, image_url, video_s3_key, jingle_s3_key, trim_start, trim_end)
    VALUES (
      ${data.show_id}, ${data.title}, ${data.description ?? null},
      ${db.array(data.tags)}, ${data.image_url ?? null},
      ${data.video_s3_key}, ${data.jingle_s3_key ?? null},
      ${data.trim_start ?? null}, ${data.trim_end ?? null}
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

// All show_ids that currently have a staged (uploaded-but-unpublished) video —
// so the "to process" table can flag which shows already have a recording.
export function listStagedShowIds(db: Sql) {
  return db<{ show_id: string }[]>`SELECT show_id FROM staged_uploads`.then((r) => r.map((x) => x.show_id));
}

// Most recent upload for a show — used to restore its (published) video into the
// form after the staged row has been cleared.
export function getLatestUploadForShow(db: Sql, showId: string) {
  return db<{ video_s3_key: string }[]>`
    SELECT video_s3_key FROM show_uploads WHERE show_id = ${showId} ORDER BY created_at DESC LIMIT 1
  `.then((rows) => rows[0] ?? null);
}

// Operator-edited archive metadata, kept in sync with the published platforms.
export function updateUploadMetadata(
  db: Sql,
  uploadId: string,
  data: { title: string; description: string; tags: string[] }
) {
  return db`
    UPDATE show_uploads
    SET title = ${data.title}, description = ${data.description}, tags = ${db.array(data.tags)}
    WHERE id = ${uploadId}
  `;
}

// Clear a failed job back to a clean queued state so it can be re-enqueued.
// Unlike updateJobStatus this explicitly nulls error/result_url (COALESCE can't).
export function resetPlatformJobForRetry(db: Sql, jobId: string) {
  return db`
    UPDATE platform_jobs
    SET status = 'queued', progress_pct = 0, error = NULL, result_url = NULL, updated_at = NOW()
    WHERE id = ${jobId}
  `;
}

export type ShowClaim = {
  show_id: string;
  user_sub: string;
  user_name: string;
  claimed_at: Date;
  last_seen_at: Date;
};

// Claim (or steal) a show for a user. A conflicting claim by anyone is
// overwritten — claims are soft/advisory, so "open anyway" just re-claims.
export function upsertClaim(db: Sql, showId: string, userSub: string, userName: string) {
  return db<ShowClaim[]>`
    INSERT INTO show_claims (show_id, user_sub, user_name, claimed_at, last_seen_at)
    VALUES (${showId}, ${userSub}, ${userName}, NOW(), NOW())
    ON CONFLICT (show_id) DO UPDATE SET
      user_sub = EXCLUDED.user_sub,
      user_name = EXCLUDED.user_name,
      claimed_at = CASE
        WHEN show_claims.user_sub = EXCLUDED.user_sub THEN show_claims.claimed_at
        ELSE NOW()
      END,
      last_seen_at = NOW()
    RETURNING *
  `.then((rows) => rows[0]);
}

// Refresh last_seen only while the claim is still held by this user (a steal
// by someone else must not be kept alive by the previous owner's heartbeat).
export function heartbeatClaim(db: Sql, showId: string, userSub: string) {
  return db`
    UPDATE show_claims SET last_seen_at = NOW()
    WHERE show_id = ${showId} AND user_sub = ${userSub}
  `;
}

// Release only if still owned by this user.
export function releaseClaim(db: Sql, showId: string, userSub: string) {
  return db`
    DELETE FROM show_claims WHERE show_id = ${showId} AND user_sub = ${userSub}
  `;
}

// Publish-time release: drop the claim regardless of owner.
export function releaseClaimForShow(db: Sql, showId: string) {
  return db`DELETE FROM show_claims WHERE show_id = ${showId}`;
}

// Sweep claims with no heartbeat for `olderThanMs`; returns the freed show_ids.
export function releaseStaleClaims(db: Sql, olderThanMs: number) {
  const cutoff = new Date(Date.now() - olderThanMs);
  return db<{ show_id: string }[]>`
    DELETE FROM show_claims WHERE last_seen_at < ${cutoff} RETURNING show_id
  `;
}

export function listClaims(db: Sql) {
  return db<ShowClaim[]>`SELECT * FROM show_claims`;
}

export type StagedUpload = {
  show_id: string;
  s3_key: string;
  filename: string;
  size_bytes: number;
  created_at: Date;
};

// One staged (uploaded-but-unpublished) video per show; a new upload replaces it.
export function upsertStagedUpload(
  db: Sql,
  showId: string,
  s3Key: string,
  filename: string,
  sizeBytes: number
) {
  return db`
    INSERT INTO staged_uploads (show_id, s3_key, filename, size_bytes, created_at)
    VALUES (${showId}, ${s3Key}, ${filename}, ${sizeBytes}, NOW())
    ON CONFLICT (show_id) DO UPDATE SET
      s3_key = EXCLUDED.s3_key,
      filename = EXCLUDED.filename,
      size_bytes = EXCLUDED.size_bytes,
      created_at = NOW()
  `;
}

export function getStagedUpload(db: Sql, showId: string) {
  return db<StagedUpload[]>`SELECT * FROM staged_uploads WHERE show_id = ${showId}`.then((r) => r[0] ?? null);
}

export function deleteStagedUpload(db: Sql, showId: string) {
  return db`DELETE FROM staged_uploads WHERE show_id = ${showId}`;
}
