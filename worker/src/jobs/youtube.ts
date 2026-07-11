import type { Job } from 'bullmq';
import path from 'path';
import type { JobPayload } from '../types';
import { downloadFromS3 } from '../services/s3';
import { uploadToYoutube } from '../services/youtube-client';
import { setJobStatus } from '../db';
import { makeTempPath, cleanup, resolveTrim, trimVideoCopy } from '../services/ffmpeg';
import { maybeEnqueueArchive } from './archive';

export async function processYoutube(job: Job<JobPayload>): Promise<string> {
  const { jobId, uploadId, videoS3Key, title, description, tags, trimStart, trimEnd, autoTrimSilence } = job.data;

  await setJobStatus(jobId, 'processing', { progress_pct: 0 });

  const videoPath = makeTempPath(path.basename(videoS3Key));
  const trimmedPath = makeTempPath(`yt-trimmed${path.extname(videoS3Key) || '.mkv'}`);
  try {
    await job.updateProgress({ uploadId, platform: 'youtube', pct: 5 });
    await downloadFromS3(videoS3Key, videoPath);

    await setJobStatus(jobId, 'processing', { progress_pct: 20 });
    await job.updateProgress({ uploadId, platform: 'youtube', pct: 20 });

    // Trim dead air off the raw recording before upload (fast stream-copy).
    const trim = await resolveTrim(videoPath, { manualStart: trimStart, manualEnd: trimEnd, autoTrimSilence });
    let uploadPath = videoPath;
    if (trim.trimStart || trim.trimEnd) {
      await trimVideoCopy(videoPath, trimmedPath, trim);
      uploadPath = trimmedPath;
    }

    const resultUrl = await uploadToYoutube({
      videoPath: uploadPath,
      title,
      description,
      tags,
      onProgress: async (pct) => {
        const adjusted = 20 + Math.round(pct * 0.78);
        await setJobStatus(jobId, 'processing', { progress_pct: adjusted });
        await job.updateProgress({ uploadId, platform: 'youtube', pct: adjusted });
      },
    });

    await setJobStatus(jobId, 'done', { result_url: resultUrl, progress_pct: 100 });
    await job.updateProgress({ uploadId, platform: 'youtube', pct: 100 });

    // Write-back to PocketBase happens once ALL platforms finish (in maybeEnqueueArchive).
    await maybeEnqueueArchive(job.data);

    return JSON.stringify({ uploadId, platform: 'youtube', url: resultUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setJobStatus(jobId, 'failed', { error: msg });
    throw err;
  } finally {
    cleanup(videoPath, trimmedPath);
  }
}
