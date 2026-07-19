import type { Job } from 'bullmq';
import path from 'path';
import type { JobPayload } from '../types';
import { downloadFromS3, uploadToS3 } from '../services/s3';
import { extractAudio, resolveTrim, makeTempPath, cleanup } from '../services/ffmpeg';
import { setJobStatus, setAudioKey, getPlatformJobsForUpload, createArchiveJobRecord } from '../db';
import { uploadQueue } from '../queue';

// PocketBase write-back now happens per-platform (in each job) the moment that
// platform finishes — no waiting on the others. This only enqueues the archive.
export async function maybeEnqueueArchive(payload: JobPayload): Promise<void> {
  const { uploadId, videoS3Key, title, description, tags, imageUrl, jingleS3Key, includeJingle, trimStart, trimEnd } = payload;

  const jobs = await getPlatformJobsForUpload(uploadId);
  const platformJobs = jobs.filter((j) => j.platform !== 'archive');
  const allDone = platformJobs.length > 0 && platformJobs.every((j) => j.status === 'done');
  const archiveExists = jobs.some((j) => j.platform === 'archive');

  // Once every platform is done, always extract the downloadable audio archive
  // (the original upload is already the video archive on S3). Runs once per
  // upload — archiveExists guards re-runs when a platform is added later.
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
    trimStart,
    trimEnd,
  });
}

export async function processArchive(job: Job<JobPayload>): Promise<string> {
  const { jobId, uploadId, videoS3Key, trimStart, trimEnd, autoTrimSilence } = job.data;

  await setJobStatus(jobId, 'processing', { progress_pct: 0 });

  const ext = path.extname(videoS3Key) || '.mkv';
  const base = path.basename(videoS3Key, ext);
  const inputPath = makeTempPath(`input${ext}`);
  const audioPath = makeTempPath('archive.m4a');

  try {
    await job.updateProgress({ uploadId, platform: 'archive', pct: 5 });
    await downloadFromS3(videoS3Key, inputPath);

    await setJobStatus(jobId, 'processing', { progress_pct: 20 });
    await job.updateProgress({ uploadId, platform: 'archive', pct: 20 });

    // The original upload (any format, incl. MKV) is the video archive and
    // stays on S3 as video_s3_key. Here we produce the separate audio archive:
    // a trimmed m4a the operator can download on its own.
    const trim = await resolveTrim(inputPath, { manualStart: trimStart, manualEnd: trimEnd, autoTrimSilence });

    await extractAudio(inputPath, audioPath, {
      trimStart: trim.trimStart,
      trimEnd: trim.trimEnd,
      onProgress: async (pct) => {
        const adjusted = 20 + Math.round(pct * 0.65);
        await setJobStatus(jobId, 'processing', { progress_pct: adjusted });
        await job.updateProgress({ uploadId, platform: 'archive', pct: adjusted });
      },
    });

    const audioKey = `archive/${base}.m4a`;
    await uploadToS3(audioPath, audioKey, 'audio/mp4');

    await setJobStatus(jobId, 'processing', { progress_pct: 95 });
    await job.updateProgress({ uploadId, platform: 'archive', pct: 95 });

    await setAudioKey(uploadId, audioKey);

    await setJobStatus(jobId, 'done', { result_url: audioKey, progress_pct: 100 });
    await job.updateProgress({ uploadId, platform: 'archive', pct: 100 });

    return JSON.stringify({ uploadId, platform: 'archive', key: audioKey });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setJobStatus(jobId, 'failed', { error: msg });
    throw err;
  } finally {
    cleanup(inputPath, audioPath);
  }
}
