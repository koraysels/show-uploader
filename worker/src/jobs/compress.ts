import type { Job } from 'bullmq';
import type { JobPayload } from '../types';
import { downloadFromS3, uploadToS3, objectSize } from '../services/s3';
import { compressVideo, cleanup } from '../services/ffmpeg';
import { setJobStatus } from '../db';
import { createWorkspace } from '../services/workspace';

/**
 * Shrink an already-archived show's video in place: same S3 key, smaller file.
 *
 * Operator-triggered, on-demand (see uploads.compressArchiveVideo) — unlike the
 * other platform jobs this never auto-enqueues. Only ever runs against a show
 * already sitting in the browser-playable MP4 layout, so unlike processArchive
 * there is no container/trim/loudness branching: one input, one re-encode, one
 * upload back over the same key.
 */
export async function processCompress(job: Job<JobPayload>): Promise<string> {
  const { jobId, uploadId, videoS3Key } = job.data;

  if (!/\.mp4$/i.test(videoS3Key)) {
    const msg = `Cannot shrink ${videoS3Key} — not an mp4 archive yet (run remux first)`;
    await setJobStatus(jobId, 'failed', { error: msg });
    throw new Error(msg);
  }

  await setJobStatus(jobId, 'processing', { progress_pct: 0 });

  const ws = createWorkspace(jobId);
  const inputPath = ws.path('input.mp4');
  const outputPath = ws.path('compressed.mp4');

  try {
    await job.updateProgress({ uploadId, platform: 'compress', pct: 5 });
    await downloadFromS3(videoS3Key, inputPath);

    await setJobStatus(jobId, 'processing', { progress_pct: 10 });
    await job.updateProgress({ uploadId, platform: 'compress', pct: 10 });

    await compressVideo(inputPath, outputPath, {
      onProgress: async (pct) => {
        const adjusted = 10 + Math.round(pct * 0.8);
        await setJobStatus(jobId, 'processing', { progress_pct: adjusted });
        await job.updateProgress({ uploadId, platform: 'compress', pct: adjusted });
      },
    });

    // Original no longer needed — drop it before the upload so /tmp isn't
    // holding the recording twice while a multi-GB PUT runs.
    cleanup(inputPath);

    await uploadToS3(outputPath, videoS3Key, 'video/mp4');

    const size = await objectSize(videoS3Key);
    if (!size) throw new Error(`Compressed MP4 missing or empty on S3: ${videoS3Key}`);

    await setJobStatus(jobId, 'done', { progress_pct: 100 });
    await job.updateProgress({ uploadId, platform: 'compress', pct: 100 });

    return JSON.stringify({ uploadId, platform: 'compress', key: videoS3Key });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setJobStatus(jobId, 'failed', { error: msg });
    throw err;
  } finally {
    ws.cleanup();
  }
}
