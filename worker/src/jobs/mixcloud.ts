import type { Job } from 'bullmq';
import path from 'path';
import fs from 'fs';
import type { JobPayload } from '../types';
import { downloadFromS3 } from '../services/s3';
import { uploadToMixcloud } from '../services/mixcloud-client';
import { extractAudio, prependJingle, captureSquareFrame, resolveTrim, makeTempPath, cleanup } from '../services/ffmpeg';
import { setJobStatus, getUploadRow } from '../db';
import { finalizeArchiveRecord } from '../services/shows-api';
import { baseTitle } from '../services/format';
import { maybeEnqueueArchive } from './archive';

export async function processMixcloud(job: Job<JobPayload>): Promise<string> {
  const { jobId, uploadId, videoS3Key, title, description, tags, jingleS3Key, includeJingle, trimStart, trimEnd, autoTrimSilence } = job.data;

  await setJobStatus(jobId, 'processing', { progress_pct: 0 });

  const videoPath = makeTempPath(path.basename(videoS3Key));
  const audioPath = makeTempPath('audio.m4a');
  const jinglePath = makeTempPath('jingle.m4a');
  const mergedPath = makeTempPath('merged.m4a');
  const thumbPath = makeTempPath('cover.jpg');

  try {
    await job.updateProgress({ uploadId, platform: 'mixcloud', pct: 5 });
    await downloadFromS3(videoS3Key, videoPath);

    await setJobStatus(jobId, 'processing', { progress_pct: 15 });
    await job.updateProgress({ uploadId, platform: 'mixcloud', pct: 15 });

    const trim = await resolveTrim(videoPath, { manualStart: trimStart, manualEnd: trimEnd, autoTrimSilence });

    await extractAudio(videoPath, audioPath, {
      trimStart: trim.trimStart,
      trimEnd: trim.trimEnd,
      onProgress: async (pct) => {
        const adjusted = 15 + Math.round(pct * 0.4);
        await setJobStatus(jobId, 'processing', { progress_pct: adjusted });
        await job.updateProgress({ uploadId, platform: 'mixcloud', pct: adjusted });
      },
    });

    let finalAudioPath = audioPath;

    if (includeJingle && jingleS3Key) {
      // A missing/misconfigured jingle must not fail the whole upload — publish
      // the audio as-is and warn instead.
      try {
        await downloadFromS3(jingleS3Key, jinglePath);
        await prependJingle(jinglePath, audioPath, mergedPath);
        finalAudioPath = mergedPath;
      } catch (err) {
        console.warn(
          `Jingle "${jingleS3Key}" unavailable — publishing without it:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    // Cover art = a square frame grabbed 20s into the video. Non-fatal.
    await captureSquareFrame(videoPath, thumbPath, 20).catch((err) =>
      console.warn('Cover frame capture failed:', err instanceof Error ? err.message : err)
    );

    await setJobStatus(jobId, 'processing', { progress_pct: 70 });
    await job.updateProgress({ uploadId, platform: 'mixcloud', pct: 70 });

    const resultUrl = await uploadToMixcloud({
      audioPath: finalAudioPath,
      title,
      description,
      tags,
      imagePath: fs.existsSync(thumbPath) ? thumbPath : undefined,
    });

    await setJobStatus(jobId, 'done', { result_url: resultUrl, progress_pct: 100 });
    await job.updateProgress({ uploadId, platform: 'mixcloud', pct: 100 });

    // Write MixCloud's link back immediately (merged with any existing links).
    const row = await getUploadRow(uploadId);
    if (row) {
      await finalizeArchiveRecord(row.show_id, {
        title: baseTitle(title),
        notes: description,
        tags,
        mediaLinks: [{ label: 'MixCloud', type: 'audio', url: resultUrl }],
      });
    }

    await maybeEnqueueArchive(job.data);

    return JSON.stringify({ uploadId, platform: 'mixcloud', url: resultUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setJobStatus(jobId, 'failed', { error: msg });
    throw err;
  } finally {
    cleanup(videoPath, audioPath, jinglePath, mergedPath, thumbPath);
  }
}
