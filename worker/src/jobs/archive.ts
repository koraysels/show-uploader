import type { Job } from 'bullmq';
import path from 'path';
import type { JobPayload } from '../types';
import { downloadFromS3, uploadToS3, deleteFromS3, objectSize } from '../services/s3';
import { extractAudio, remuxToMp4, trimVideoCopy, resolveTrim, makeTempPath, cleanup } from '../services/ffmpeg';
import {
  setJobStatus,
  setAudioKey,
  setVideoKey,
  getPlatformJobsForUpload,
  createArchiveJobRecord,
} from '../db';
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
  const mp4Path = makeTempPath('archive.mp4');

  try {
    await job.updateProgress({ uploadId, platform: 'archive', pct: 5 });
    await downloadFromS3(videoS3Key, inputPath);

    await setJobStatus(jobId, 'processing', { progress_pct: 20 });
    await job.updateProgress({ uploadId, platform: 'archive', pct: 20 });

    // Two archives come out of the recording: a trimmed m4a the operator can
    // download on its own, and a trimmed MP4 that replaces the original upload
    // as the video archive (MKV doesn't play in a browser).
    const trim = await resolveTrim(inputPath, { manualStart: trimStart, manualEnd: trimEnd, autoTrimSilence });

    await extractAudio(inputPath, audioPath, {
      trimStart: trim.trimStart,
      trimEnd: trim.trimEnd,
      onProgress: async (pct) => {
        const adjusted = 20 + Math.round(pct * 0.3);
        await setJobStatus(jobId, 'processing', { progress_pct: adjusted });
        await job.updateProgress({ uploadId, platform: 'archive', pct: adjusted });
      },
    });

    const audioKey = `archive/${base}.m4a`;
    await uploadToS3(audioPath, audioKey, 'audio/mp4');
    await setAudioKey(uploadId, audioKey);

    await setJobStatus(jobId, 'processing', { progress_pct: 50 });
    await job.updateProgress({ uploadId, platform: 'archive', pct: 50 });

    await remuxVideoToMp4(job, { uploadId, jobId, videoS3Key, ext, inputPath, mp4Path, trim });

    await setJobStatus(jobId, 'done', { result_url: audioKey, progress_pct: 100 });
    await job.updateProgress({ uploadId, platform: 'archive', pct: 100 });

    return JSON.stringify({ uploadId, platform: 'archive', key: audioKey });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setJobStatus(jobId, 'failed', { error: msg });
    throw err;
  } finally {
    cleanup(inputPath, audioPath, mp4Path);
  }
}

/**
 * Rewrap the recording as MP4 and make it the video archive, replacing the
 * original upload on S3.
 *
 * Deletion order is deliberate: upload, prove the object landed, repoint the
 * DB, and only then drop the original. If anything throws before the repoint,
 * the source file is still on S3 and still referenced — retrying the archive
 * job picks up where it left off.
 */
async function remuxVideoToMp4(
  job: Job<JobPayload>,
  ctx: {
    uploadId: string;
    jobId: string;
    videoS3Key: string;
    ext: string;
    inputPath: string;
    mp4Path: string;
    trim: { trimStart: string | null; trimEnd: string | null };
  }
): Promise<void> {
  const { uploadId, jobId, videoS3Key, ext, inputPath, mp4Path, trim } = ctx;

  const isMp4 = ext.toLowerCase() === '.mp4';
  const hasTrim = !!(trim.trimStart || trim.trimEnd);

  // Already an MP4 with nothing to cut — no work to do, and re-running must stay
  // a no-op.
  if (isMp4 && !hasTrim) return;

  const onProgress = async (pct: number) => {
    const adjusted = 50 + Math.round(pct * 0.3);
    await setJobStatus(jobId, 'processing', { progress_pct: adjusted });
    await job.updateProgress({ uploadId, platform: 'archive', pct: adjusted });
  };

  if (isMp4) {
    // The preview remux already rewrapped this recording, so the container is
    // done and only the trim is outstanding. Stream copy — no re-encode, and the
    // result still replaces the source below exactly as a full remux would.
    await trimVideoCopy(inputPath, mp4Path, { trimStart: trim.trimStart, trimEnd: trim.trimEnd });
    await onProgress(100);
  } else {
    await remuxToMp4(inputPath, mp4Path, {
      trimStart: trim.trimStart,
      trimEnd: trim.trimEnd,
      onProgress,
    });
  }

  // Source file is no longer needed — drop it before the upload so /tmp isn't
  // holding the recording twice while a multi-GB PUT runs.
  cleanup(inputPath);

  const mp4Key = `${videoS3Key.slice(0, -ext.length)}.mp4`;
  await uploadToS3(mp4Path, mp4Key, 'video/mp4');

  const size = await objectSize(mp4Key);
  if (!size) throw new Error(`Remuxed MP4 missing or empty on S3: ${mp4Key}`);

  await setVideoKey(uploadId, mp4Key);

  await setJobStatus(jobId, 'processing', { progress_pct: 95 });
  await job.updateProgress({ uploadId, platform: 'archive', pct: 95 });

  // Past the point of no return for the original: the MP4 is verified on S3 and
  // the row points at it. A failure here leaves an orphan, never a dead link.
  //
  // Only when the key actually changed. A trimmed MP4 is written back over its
  // own key, so deleting "the original" here would delete the file just uploaded.
  if (mp4Key !== videoS3Key) {
    await deleteFromS3(videoS3Key).catch((err) =>
      console.warn(`Remuxed to ${mp4Key} but could not delete ${videoS3Key}:`, err)
    );
  }
}
