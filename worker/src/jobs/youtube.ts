import type { Job } from 'bullmq';
import path from 'path';
import type { JobPayload } from '../types';
import { downloadFromS3 } from '../services/s3';
import { uploadToYoutube } from '../services/youtube-client';
import { setJobStatus, getUploadRow } from '../db';
import { cleanup, resolveTrim, trimVideoCopy, measureLoudness } from '../services/ffmpeg';
import { createWorkspace } from '../services/workspace';
import { finalizeArchiveRecord } from '../services/shows-api';
import { baseTitle, htmlToText } from '../services/format';
import { maybeEnqueueArchive } from './archive';

export async function processYoutube(job: Job<JobPayload>): Promise<string> {
  const { jobId, uploadId, videoS3Key, title, description, tags, trimStart, trimEnd, autoTrimSilence } = job.data;

  await setJobStatus(jobId, 'processing', { progress_pct: 0 });

  const ws = createWorkspace(jobId);
  const videoPath = ws.path(path.basename(videoS3Key));
  const trimmedPath = ws.path(`yt-trimmed${path.extname(videoS3Key) || '.mkv'}`);
  try {
    await job.updateProgress({ uploadId, platform: 'youtube', pct: 5 });
    await downloadFromS3(videoS3Key, videoPath);

    await setJobStatus(jobId, 'processing', { progress_pct: 20 });
    await job.updateProgress({ uploadId, platform: 'youtube', pct: 20 });

    // Trim dead air off the raw recording before upload, and bring it to the
    // delivery target. Video is still stream-copied; only the audio is re-encoded.
    const trim = await resolveTrim(videoPath, { manualStart: trimStart, manualEnd: trimEnd, autoTrimSilence });
    const loudness = await measureLoudness(videoPath, {
      trimStart: trim.trimStart,
      trimEnd: trim.trimEnd,
    });

    let uploadPath = videoPath;
    // Normalising is work in its own right, so this no longer short-circuits on
    // "no trim" — the raw recording is only uploaded when there is nothing to do.
    if (trim.trimStart || trim.trimEnd || loudness) {
      await trimVideoCopy(videoPath, trimmedPath, { ...trim, loudness });
      uploadPath = trimmedPath;
    }

    const resultUrl = await uploadToYoutube({
      videoPath: uploadPath,
      title,
      // YouTube wants plain text; the description is rich-text HTML (the PB master).
      description: htmlToText(description),
      tags,
      onProgress: async (pct) => {
        const adjusted = 20 + Math.round(pct * 0.78);
        await setJobStatus(jobId, 'processing', { progress_pct: adjusted });
        await job.updateProgress({ uploadId, platform: 'youtube', pct: adjusted });
      },
    });

    // No custom thumbnail — YouTube's auto-chosen frame is fine.
    await setJobStatus(jobId, 'done', { result_url: resultUrl, progress_pct: 100 });
    await job.updateProgress({ uploadId, platform: 'youtube', pct: 100 });

    // Write this platform's link back to PocketBase immediately (merged), so the
    // archive record is updated the moment YouTube is done — no waiting on MixCloud.
    const row = await getUploadRow(uploadId);
    if (row) {
      await finalizeArchiveRecord(row.show_id, {
        title: baseTitle(title),
        notes: description,
        tags,
        mediaLinks: [{ label: 'YouTube', type: 'video', url: resultUrl }],
      });
    }

    await maybeEnqueueArchive(job.data);

    return JSON.stringify({ uploadId, platform: 'youtube', url: resultUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setJobStatus(jobId, 'failed', { error: msg });
    throw err;
  } finally {
    ws.cleanup();
  }
}
