import type { Job } from 'bullmq';
import path from 'path';
import type { JobPayload } from '../types';
import { downloadFromS3, uploadToS3, deleteFromS3 } from '../services/s3';
import { transcodeToMp4, makeTempPath, cleanup } from '../services/ffmpeg';
import { setJobStatus, setArchiveKey, getPlatformJobsForUpload, createArchiveJobRecord } from '../db';
import { uploadQueue } from '../queue';

export async function maybeEnqueueArchive(payload: JobPayload): Promise<void> {
  const { uploadId, videoS3Key, title, description, tags, imageUrl, jingleS3Key, includeJingle } = payload;

  const jobs = await getPlatformJobsForUpload(uploadId);
  const platformJobs = jobs.filter((j) => j.platform !== 'archive');
  const allDone = platformJobs.length > 0 && platformJobs.every((j) => j.status === 'done');
  const archiveExists = jobs.some((j) => j.platform === 'archive');

  if (!allDone || archiveExists) return;

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
  });
}

export async function processArchive(job: Job<JobPayload>): Promise<string> {
  const { jobId, uploadId, videoS3Key } = job.data;

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

    await transcodeToMp4(inputPath, outputPath, async (pct) => {
      const adjusted = 15 + Math.round(pct * 0.7);
      await setJobStatus(jobId, 'processing', { progress_pct: adjusted });
      await job.updateProgress({ uploadId, platform: 'archive', pct: adjusted });
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
