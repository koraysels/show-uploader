import type { Job } from 'bullmq';
import path from 'path';
import type { JobPayload } from '../types';
import { downloadFromS3 } from '../services/s3';
import { uploadToMixcloud } from '../services/mixcloud-client';
import { extractAudio, prependJingle, makeTempPath, cleanup } from '../services/ffmpeg';
import { setJobStatus } from '../db';
import { maybeEnqueueArchive } from './archive';

export async function processMixcloud(job: Job<JobPayload>): Promise<string> {
  const { jobId, uploadId, videoS3Key, title, description, tags, jingleS3Key, includeJingle, trimStart, trimEnd } = job.data;

  await setJobStatus(jobId, 'processing', { progress_pct: 0 });

  const videoPath = makeTempPath(path.basename(videoS3Key));
  const audioPath = makeTempPath('audio.m4a');
  const jinglePath = makeTempPath('jingle.m4a');
  const mergedPath = makeTempPath('merged.m4a');

  try {
    await job.updateProgress({ uploadId, platform: 'mixcloud', pct: 5 });
    await downloadFromS3(videoS3Key, videoPath);

    await setJobStatus(jobId, 'processing', { progress_pct: 15 });
    await job.updateProgress({ uploadId, platform: 'mixcloud', pct: 15 });

    await extractAudio(videoPath, audioPath, {
      trimStart,
      trimEnd,
      onProgress: async (pct) => {
        const adjusted = 15 + Math.round(pct * 0.4);
        await setJobStatus(jobId, 'processing', { progress_pct: adjusted });
        await job.updateProgress({ uploadId, platform: 'mixcloud', pct: adjusted });
      },
    });

    let finalAudioPath = audioPath;

    if (includeJingle && jingleS3Key) {
      await downloadFromS3(jingleS3Key, jinglePath);
      await prependJingle(jinglePath, audioPath, mergedPath);
      finalAudioPath = mergedPath;
    }

    await setJobStatus(jobId, 'processing', { progress_pct: 70 });
    await job.updateProgress({ uploadId, platform: 'mixcloud', pct: 70 });

    const resultUrl = await uploadToMixcloud({
      audioPath: finalAudioPath,
      title,
      description,
      tags,
    });

    await setJobStatus(jobId, 'done', { result_url: resultUrl, progress_pct: 100 });
    await job.updateProgress({ uploadId, platform: 'mixcloud', pct: 100 });

    // Write-back to PocketBase happens once ALL platforms finish (in maybeEnqueueArchive).
    await maybeEnqueueArchive(job.data);

    return JSON.stringify({ uploadId, platform: 'mixcloud', url: resultUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setJobStatus(jobId, 'failed', { error: msg });
    throw err;
  } finally {
    cleanup(videoPath, audioPath, jinglePath, mergedPath);
  }
}
