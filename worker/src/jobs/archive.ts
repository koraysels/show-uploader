import type { Job } from 'bullmq';
import path from 'path';
import type { JobPayload } from '../types';
import { downloadFromS3, uploadToS3, deleteFromS3 } from '../services/s3';
import { transcodeToMp4, makeTempPath, cleanup } from '../services/ffmpeg';
import { setJobStatus, setArchiveKey, getPlatformJobsForUpload, createArchiveJobRecord, getUploadRow } from '../db';
import { uploadQueue } from '../queue';
import { finalizeArchiveRecord, type MediaLink } from '../services/shows-api';

// Map a completed platform job to the archive record's mediaLinks shape.
function toMediaLink(platform: string, url: string): MediaLink | null {
  if (platform === 'youtube') return { label: 'YouTube', type: 'video', url };
  if (platform === 'mixcloud') return { label: 'MixCloud', type: 'audio', url };
  return null;
}

export async function maybeEnqueueArchive(payload: JobPayload): Promise<void> {
  const { uploadId, videoS3Key, title, description, tags, imageUrl, jingleS3Key, includeJingle, trimStart, trimEnd } = payload;

  const jobs = await getPlatformJobsForUpload(uploadId);
  const platformJobs = jobs.filter((j) => j.platform !== 'archive');
  const allDone = platformJobs.length > 0 && platformJobs.every((j) => j.status === 'done');
  const archiveExists = jobs.some((j) => j.platform === 'archive');

  if (!allDone || archiveExists) return;

  // All platforms published — write the links + finalised metadata back onto the
  // PocketBase archive record (status stays draft; a human publishes in agenda).
  const row = await getUploadRow(uploadId);
  if (row) {
    const mediaLinks = platformJobs
      .map((j) => (j.result_url ? toMediaLink(j.platform, j.result_url) : null))
      .filter((l): l is MediaLink => l !== null);
    await finalizeArchiveRecord(row.show_id, { title, notes: description, mediaLinks });
  }

  // Skip the archive transcode when the operator opted out (e.g. adding a second
  // platform to a show that's already archived). PB write-back above still runs.
  if (payload.includeArchive === false) return;

  const archiveJobId = await createArchiveJobRecord(uploadId);
  if (!archiveJobId) return;

  await uploadQueue.add('archive', {
    jobId: archiveJobId,
    uploadId,
    platform: 'archive',
    videoS3Key,
    title,
    description,
    tags,
    imageUrl,
    jingleS3Key,
    includeJingle,
    trimStart,
    trimEnd,
  });
}

export async function processArchive(job: Job<JobPayload>): Promise<string> {
  const { jobId, uploadId, videoS3Key, trimStart, trimEnd } = job.data;

  await setJobStatus(jobId, 'processing', { progress_pct: 0 });

  const ext = path.extname(videoS3Key) || '.mkv';
  const base = path.basename(videoS3Key, ext);
  const inputPath = makeTempPath(`input${ext}`);
  const outputPath = makeTempPath('archive.mp4');

  try {
    await job.updateProgress({ uploadId, platform: 'archive', pct: 5 });
    await downloadFromS3(videoS3Key, inputPath);

    await setJobStatus(jobId, 'processing', { progress_pct: 15 });
    await job.updateProgress({ uploadId, platform: 'archive', pct: 15 });

    await transcodeToMp4(inputPath, outputPath, {
      trimStart,
      trimEnd,
      onProgress: async (pct) => {
        const adjusted = 15 + Math.round(pct * 0.7);
        await setJobStatus(jobId, 'processing', { progress_pct: adjusted });
        await job.updateProgress({ uploadId, platform: 'archive', pct: adjusted });
      },
    });

    const archiveKey = `archive/${base}.mp4`;
    await uploadToS3(outputPath, archiveKey, 'video/mp4');

    await setJobStatus(jobId, 'processing', { progress_pct: 95 });
    await job.updateProgress({ uploadId, platform: 'archive', pct: 95 });

    await deleteFromS3(videoS3Key);
    await setArchiveKey(uploadId, archiveKey);

    await setJobStatus(jobId, 'done', { result_url: archiveKey, progress_pct: 100 });
    await job.updateProgress({ uploadId, platform: 'archive', pct: 100 });

    return JSON.stringify({ uploadId, platform: 'archive', key: archiveKey });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setJobStatus(jobId, 'failed', { error: msg });
    throw err;
  } finally {
    cleanup(inputPath, outputPath);
  }
}
