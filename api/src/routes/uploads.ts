import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import {
  createUpload,
  createPlatformJob,
  listUploadsWithJobs,
  getUploadWithJobs,
  releaseClaimForShow,
  upsertStagedUpload,
  getStagedUpload,
  deleteStagedUpload,
  resetPlatformJobForRetry,
  updateUploadMetadata,
  getLatestUploadForShow,
  listStagedShowIds,
} from '../db/queries';
import { presenceHub } from '../services/presence-hub';
import { uploadQueue } from '../queue';
import { createUploadPresignedUrl, createDownloadPresignedUrl } from '../services/s3';
import { getLiveState } from '../services/live-guard';
import { updateArchiveRecord, resolveGenreIds } from '../services/shows-api';
import { syncYoutubeMetadata, syncMixcloudMetadata } from '../services/platform-metadata';
import { baseTitle } from '../services/format';
import { env } from '../env';

export const uploadsRouter = Router();

// HH:MM:SS or MM:SS format
const TimeCode = z.string().regex(/^(\d{1,2}:)?\d{2}:\d{2}$/).optional().nullable();

const CreateUploadSchema = z.object({
  showId: z.string(),
  title: z.string().min(1),
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
  imageUrl: z.string().url().nullable().default(null),
  videoS3Key: z.string().min(1),
  platforms: z.array(z.enum(['youtube', 'mixcloud'])).min(1),
  includeJingle: z.boolean().default(true),
  // Auto-detect and cut leading/trailing silence (dead air) via ffmpeg. Manual
  // trim below overrides it.
  autoTrimSilence: z.boolean().default(true),
  trimStart: TimeCode,
  trimEnd: TimeCode,
});

// Staged video (uploaded, not yet published) per show — survives refresh and is
// visible on any machine, so an upload can be finished/published elsewhere.
uploadsRouter.get('/staged/:showId', async (req, res) => {
  try {
    const staged = await getStagedUpload(db, req.params.showId);
    res.json(staged);
  } catch (err) {
    console.error('Failed to read staged upload:', err);
    res.status(500).json({ error: 'Failed to read staged upload' });
  }
});

const StagedBody = z.object({ s3Key: z.string().min(1), filename: z.string().min(1), sizeBytes: z.number().default(0) });
uploadsRouter.put('/staged/:showId', async (req, res) => {
  const parsed = StagedBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });
  try {
    await upsertStagedUpload(db, req.params.showId, parsed.data.s3Key, parsed.data.filename, parsed.data.sizeBytes);
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to save staged upload:', err);
    res.status(500).json({ error: 'Failed to save staged upload' });
  }
});

uploadsRouter.delete('/staged/:showId', async (req, res) => {
  await deleteStagedUpload(db, req.params.showId).catch(() => {});
  res.json({ ok: true });
});

// show_ids that already have a staged (uploaded, not-yet-published) video — for
// the "to process" table to flag which shows have a recording ready.
uploadsRouter.get('/staged', async (_req, res) => {
  try {
    res.json(await listStagedShowIds(db));
  } catch {
    res.status(500).json({ error: 'Failed to list staged shows' });
  }
});

// The most recent completed upload's video for a show — restores a published
// recording into the form (staged rows are cleared on publish). null if none.
uploadsRouter.get('/for-show/:showId', async (req, res) => {
  try {
    const row = await getLatestUploadForShow(db, req.params.showId);
    if (!row) return res.json(null);
    const filename = (row.video_s3_key.split('/').pop() ?? '').replace(/^\d+-/, '');
    res.json({ videoS3Key: row.video_s3_key, filename });
  } catch (err) {
    console.error('Failed to get show video:', err);
    res.status(500).json({ error: 'Failed to get show video' });
  }
});

// Presigned URL to preview the configured jingle (so the operator hears what
// gets prepended to the MixCloud audio). 404 when no jingle is set.
uploadsRouter.get('/jingle-preview', async (_req, res) => {
  if (!env.JINGLE_S3_KEY) return res.status(404).json({ error: 'No jingle configured' });
  try {
    const url = await createDownloadPresignedUrl(env.JINGLE_S3_KEY);
    res.json({ url, filename: env.JINGLE_S3_KEY.split('/').pop() ?? 'jingle' });
  } catch {
    res.status(500).json({ error: 'Failed to sign jingle URL' });
  }
});

uploadsRouter.post('/presign', async (req, res) => {
  const { filename, contentType } = req.body as { filename: string; contentType: string };
  if (!filename || !contentType) {
    return res.status(400).json({ error: 'filename and contentType required' });
  }
  const key = `uploads/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  try {
    const url = await createUploadPresignedUrl(key, contentType);
    res.json({ url, key });
  } catch {
    res.status(500).json({ error: 'Failed to create presigned URL' });
  }
});

uploadsRouter.post('/', async (req, res) => {
  const parsed = CreateUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const data = parsed.data;
  const jingleS3Key = env.JINGLE_S3_KEY ?? null;

  try {
    const upload = await createUpload(db, {
      show_id: data.showId,
      title: data.title,
      description: data.description,
      tags: data.tags,
      image_url: data.imageUrl,
      video_s3_key: data.videoS3Key,
      jingle_s3_key: jingleS3Key,
      trim_start: data.trimStart ?? null,
      trim_end: data.trimEnd ?? null,
    });

    const jobs = await Promise.all(
      data.platforms.map((platform) =>
        createPlatformJob(db, { upload_id: upload.id, platform })
      )
    );

    // Don't run heavy work (transcode/upload) while a show is on air — defer the
    // jobs until the live window (plus buffer) clears. Fails open if PB is down.
    const live = await getLiveState(new Date());
    const delay = live.isLive && live.resumeAt ? Math.max(0, live.resumeAt.getTime() - Date.now()) : 0;
    if (delay > 0) {
      console.log(`Show live — deferring upload ${upload.id} jobs until ${live.resumeAt!.toISOString()}`);
    }

    await Promise.all(
      jobs.map((job) =>
        uploadQueue.add(
          job.platform,
          {
            jobId: job.id,
            uploadId: upload.id,
            platform: job.platform,
            videoS3Key: data.videoS3Key,
            title: data.title,
            description: data.description,
            tags: data.tags,
            imageUrl: data.imageUrl,
            jingleS3Key,
            includeJingle: data.includeJingle,
            autoTrimSilence: data.autoTrimSilence,
            trimStart: data.trimStart ?? null,
            trimEnd: data.trimEnd ?? null,
          },
          { delay }
        )
      )
    );

    // The show is now published — free its claim so it drops off everyone's
    // "being processed" list immediately, and clear the staged upload.
    await releaseClaimForShow(db, data.showId);
    await deleteStagedUpload(db, data.showId).catch(() => {});
    void presenceHub.broadcastClaims();

    res.status(201).json({
      uploadId: upload.id,
      jobs,
      deferredUntil: delay > 0 ? live.resumeAt!.toISOString() : null,
    });
  } catch (err) {
    console.error('Failed to create upload:', err);
    res.status(500).json({ error: 'Failed to create upload' });
  }
});

// Re-run a single platform job that failed (or was interrupted by a worker
// restart). Reconstructs the payload from the stored upload row and re-enqueues.
uploadsRouter.post('/:uploadId/jobs/:platform/retry', async (req, res) => {
  const { uploadId, platform } = req.params;
  if (platform !== 'youtube' && platform !== 'mixcloud' && platform !== 'archive') {
    return res.status(400).json({ error: 'Invalid platform' });
  }
  try {
    const upload = await getUploadWithJobs(db, uploadId);
    if (!upload) return res.status(404).json({ error: 'Upload not found' });
    const job = upload.jobs.find((j) => j.platform === platform);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status === 'processing') return res.status(409).json({ error: 'Job already running' });

    await resetPlatformJobForRetry(db, job.id);
    await uploadQueue.add(platform, {
      jobId: job.id,
      uploadId,
      platform,
      videoS3Key: upload.video_s3_key,
      title: upload.title,
      description: upload.description ?? '',
      tags: upload.tags ?? [],
      imageUrl: upload.image_url,
      jingleS3Key: upload.jingle_s3_key,
      includeJingle: !!upload.jingle_s3_key,
      autoTrimSilence: true,
      trimStart: upload.trim_start,
      trimEnd: upload.trim_end,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to retry job:', err);
    res.status(500).json({ error: 'Failed to retry job' });
  }
});

// Flip the PocketBase archive record to "published" — the explicit, separate
// step that makes the show live on the agenda site (distinct from uploading to
// the platforms). Everywhere else deliberately never touches `status`.
uploadsRouter.post('/:uploadId/publish', async (req, res) => {
  try {
    const upload = await getUploadWithJobs(db, req.params.uploadId);
    if (!upload) return res.status(404).json({ error: 'Upload not found' });
    await updateArchiveRecord(upload.show_id, { status: 'published' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to publish archive record:', err);
    res.status(502).json({ error: 'Failed to publish archive record' });
  }
});

// Edit published metadata (title/description/tags) and push it to every place
// the show lives: the local DB, each published platform, and the PocketBase
// archive record. Platform failures are reported per-target, not fatal — the DB
// always updates so the operator's edit isn't lost.
const MetadataSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
});
uploadsRouter.patch('/:uploadId/metadata', async (req, res) => {
  const parsed = MetadataSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const edit = parsed.data;
  try {
    const upload = await getUploadWithJobs(db, req.params.uploadId);
    if (!upload) return res.status(404).json({ error: 'Upload not found' });

    await updateUploadMetadata(db, upload.id, edit);

    const sync: Record<string, 'ok' | string> = {};
    const yt = upload.jobs.find((j) => j.platform === 'youtube' && j.status === 'done' && j.result_url);
    const mc = upload.jobs.find((j) => j.platform === 'mixcloud' && j.status === 'done' && j.result_url);

    const [ytErr, mcErr] = await Promise.all([
      yt ? syncYoutubeMetadata(yt.result_url!, edit) : Promise.resolve<string | null>(null),
      mc ? syncMixcloudMetadata(mc.result_url!, edit) : Promise.resolve<string | null>(null),
    ]);
    if (yt) sync.youtube = ytErr ?? 'ok';
    if (mc) sync.mixcloud = mcErr ?? 'ok';

    try {
      // Tags are the PocketBase genres relation (PB is master) — resolve the
      // edited names to genre IDs (creating any new ones). Only write the relation
      // when tags are present, so clearing tags never wipes curated genres.
      const genres = edit.tags.length ? await resolveGenreIds(edit.tags) : [];
      // Re-assert the published platform links too, so an edit fully re-syncs the
      // archive record (e.g. after a write-back that failed at publish time).
      const mediaLinks: { label: string; type: string; url: string }[] = [];
      if (yt) mediaLinks.push({ label: 'YouTube', type: 'video', url: yt.result_url! });
      if (mc) mediaLinks.push({ label: 'MixCloud', type: 'audio', url: mc.result_url! });
      await updateArchiveRecord(upload.show_id, {
        // The archive record keeps the plain title; the date/@coming-soon suffix
        // is only for the platform titles.
        title: baseTitle(edit.title),
        notes: edit.description,
        ...(genres.length ? { genres } : {}),
        ...(mediaLinks.length ? { mediaLinks } : {}),
      });
      sync.pocketbase = 'ok';
    } catch (err) {
      sync.pocketbase = err instanceof Error ? err.message : String(err);
    }

    res.json({ ok: true, sync });
  } catch (err) {
    console.error('Failed to update metadata:', err);
    res.status(500).json({ error: 'Failed to update metadata' });
  }
});

// Replace private S3 keys with browser-reachable presigned download URLs so the
// UI can download the original video (any format) and the extracted audio
// independently — the bucket itself stays private.
async function withDownloadUrls<
  T extends {
    video_s3_key: string;
    audio_s3_key: string | null;
    archive_s3_key: string | null;
    jobs: { platform: string; result_url: string | null }[];
  }
>(upload: T): Promise<T & { video_url: string; audio_url: string | null; archive_url: string | null }> {
  const [video_url, audio_url, archive_url] = await Promise.all([
    createDownloadPresignedUrl(upload.video_s3_key),
    upload.audio_s3_key ? createDownloadPresignedUrl(upload.audio_s3_key) : Promise.resolve(null),
    upload.archive_s3_key ? createDownloadPresignedUrl(upload.archive_s3_key) : Promise.resolve(null),
  ]);
  const jobs = await Promise.all(
    upload.jobs.map(async (j) =>
      j.platform === 'archive' && j.result_url
        ? { ...j, result_url: await createDownloadPresignedUrl(j.result_url) }
        : j
    )
  );
  return { ...upload, video_url, audio_url, archive_url, jobs };
}

uploadsRouter.get('/', async (_req, res) => {
  try {
    const uploads = await listUploadsWithJobs(db);
    res.json(await Promise.all(uploads.map(withDownloadUrls)));
  } catch {
    res.status(500).json({ error: 'Failed to list uploads' });
  }
});

uploadsRouter.get('/:id', async (req, res) => {
  try {
    const upload = await getUploadWithJobs(db, req.params.id);
    if (!upload) return res.status(404).json({ error: 'Not found' });
    res.json(await withDownloadUrls(upload));
  } catch {
    res.status(500).json({ error: 'Failed to get upload' });
  }
});
