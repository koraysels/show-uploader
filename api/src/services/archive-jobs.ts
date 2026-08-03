import type { Sql } from 'postgres';
import { createPlatformJob, resetPlatformJobForRetry } from '../db/queries';
import type { PlatformJob, ShowUpload } from '../db/queries';
import { uploadQueue } from '../queue';

/**
 * Drop an upload's not-yet-started jobs from the queue.
 *
 * Deleting the DB row alone isn't enough: BullMQ holds its own copy of the
 * payload, so a waiting job would still run and publish to YouTube or MixCloud
 * after the operator removed it. Jobs are matched on payload uploadId — the
 * BullMQ job id isn't stored anywhere.
 *
 * Returns the number of jobs still running, which can't be removed while a
 * worker holds their lock. Those finish, then write to rows that no longer
 * exist (a no-op UPDATE), so nothing breaks — but the work isn't stopped.
 */
export async function cancelQueuedJobs(uploadId: string): Promise<{ removed: number; active: number }> {
  const jobs = await uploadQueue.getJobs(['waiting', 'delayed', 'paused', 'failed']);
  let removed = 0;
  for (const job of jobs) {
    if (job.data?.uploadId !== uploadId) continue;
    // Racy by nature: a job can start between the fetch and the remove, which
    // throws. Treat that as "still active" rather than failing the delete.
    try {
      await job.remove();
      removed++;
    } catch {
      /* picked up by a worker in the meantime */
    }
  }
  const active = (await uploadQueue.getJobs(['active'])).filter((j) => j.data?.uploadId === uploadId).length;
  return { removed, active };
}

/**
 * Whether an upload's platform work has finished. The archive job rewrites the
 * source video on S3, so it must never run while YouTube or MixCloud still
 * needs the original file. Mirrors the worker's own auto-enqueue condition.
 */
export function readyToArchive(jobs: PlatformJob[]): boolean {
  const platform = jobs.filter((j) => j.platform !== 'archive');
  return platform.length > 0 && platform.every((j) => j.status === 'done');
}

/**
 * Queue the 'archive' job for an upload — it extracts the downloadable m4a and
 * remuxes the recording to MP4. Reuses the upload's existing archive job row
 * (resetting it) so re-running never piles up duplicate rows.
 *
 * Returns false when the job is already running; the caller decides whether
 * that's a conflict (single upload) or just a skip (backfill).
 */
export async function enqueueArchiveJob(
  db: Sql,
  upload: ShowUpload & { jobs: PlatformJob[] }
): Promise<boolean> {
  let job = upload.jobs.find((j) => j.platform === 'archive');
  if (job?.status === 'processing') return false;

  if (!job) job = await createPlatformJob(db, { upload_id: upload.id, platform: 'archive' });
  else await resetPlatformJobForRetry(db, job.id);

  await uploadQueue.add('archive', {
    jobId: job.id,
    uploadId: upload.id,
    platform: 'archive',
    videoS3Key: upload.video_s3_key,
    title: upload.title,
    description: upload.description ?? '',
    tags: upload.tags ?? [],
    imageUrl: upload.image_url,
    jingleS3Key: upload.jingle_s3_key,
    includeJingle: false,
    autoTrimSilence: true,
    trimStart: upload.trim_start,
    trimEnd: upload.trim_end,
  });
  return true;
}
