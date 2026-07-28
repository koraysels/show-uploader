import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db/client';
import {
  createUpload,
  createPlatformJob,
  listUploadsWithJobs,
  getUploadWithJobs,
  releaseClaimForShow,
  getStagedUpload,
  deleteStagedUpload,
  resetPlatformJobForRetry,
  updateUploadMetadata,
  listStagedShowIds,
  listUploadingShowIds,
} from '../../db/queries';
import { presenceHub } from '../../services/presence-hub';
import { uploadQueue } from '../../queue';
import { createDownloadPresignedUrl } from '../../services/s3';
import { withDownloadUrls } from '../../services/upload-urls';
import { getLiveState } from '../../services/live-guard';
import { updateArchiveRecord, resolveGenreIds } from '../../services/shows-api';
import { syncYoutubeMetadata, syncMixcloudMetadata } from '../../services/platform-metadata';
import { baseTitle } from '../../services/format';
import { env } from '../../env';

// tRPC mirror of routes/uploads.ts (non-SSE, non-multipart). Reuses the exact
// same db queries + services + zod validation, so behaviour matches the REST
// route. The multipart flow and the SSE event stream stay REST — file uploads +
// SSE don't fit tRPC's batch link.

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

const MetadataSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
});

// Re-throw domain TRPCErrors as-is; wrap anything else as INTERNAL_SERVER_ERROR
// (the REST route logged + returned 500 for these). Keeps try/catch parity with
// the Express handlers without swallowing intentional 404/409 errors.
function internal(err: unknown, logMessage: string, message: string): never {
  if (err instanceof TRPCError) throw err;
  console.error(logMessage, err);
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message });
}

export const uploadsRouter = router({
  // GET /api/uploads — every upload with its jobs + presigned download URLs.
  list: protectedProcedure.query(async () => {
    try {
      const uploads = await listUploadsWithJobs(db);
      return await Promise.all(uploads.map(withDownloadUrls));
    } catch (err) {
      internal(err, 'Failed to list uploads:', 'Failed to list uploads');
    }
  }),

  // GET /api/uploads/:id — one upload with its jobs + download URLs.
  get: protectedProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ input }) => {
    try {
      const upload = await getUploadWithJobs(db, input.id);
      if (!upload) throw new TRPCError({ code: 'NOT_FOUND', message: 'Not found' });
      return await withDownloadUrls(upload);
    } catch (err) {
      internal(err, 'Failed to get upload:', 'Failed to get upload');
    }
  }),

  // GET /api/uploads/staged/:showId — staged (uploaded, not-yet-published) video
  // for a show. Survives refresh and is visible on any machine.
  getStaged: protectedProcedure.input(z.object({ showId: z.string() })).query(async ({ input }) => {
    try {
      return await getStagedUpload(db, input.showId);
    } catch (err) {
      internal(err, 'Failed to read staged upload:', 'Failed to read staged upload');
    }
  }),

  // DELETE /api/uploads/staged/:showId — swallows errors, always ok (matches REST).
  deleteStaged: protectedProcedure.input(z.object({ showId: z.string() })).mutation(async ({ input }) => {
    await deleteStagedUpload(db, input.showId).catch(() => {});
    return { ok: true };
  }),

  // GET /api/uploads/staged — show_ids that already have a staged video, for the
  // "to process" table to flag which shows have a recording ready.
  getStagedShowIds: protectedProcedure.query(async () => {
    try {
      return await listStagedShowIds(db);
    } catch (err) {
      internal(err, 'Failed to list staged shows:', 'Failed to list staged shows');
    }
  }),

  // show_ids with an in-progress multipart upload — lets OTHER machines show
  // "uploading elsewhere" while a browser is mid-upload (the live % is local to
  // that browser; the staged row only lands on completion).
  getUploadingShowIds: protectedProcedure.query(async () => {
    try {
      return await listUploadingShowIds(db);
    } catch (err) {
      internal(err, 'Failed to list uploading shows:', 'Failed to list uploading shows');
    }
  }),

  // GET /api/uploads/jingle-preview — presigned URL to preview the configured
  // jingle. NOT_FOUND when no jingle is set.
  getJinglePreview: protectedProcedure.query(async () => {
    if (!env.JINGLE_S3_KEY) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'No jingle configured' });
    }
    try {
      const url = await createDownloadPresignedUrl(env.JINGLE_S3_KEY);
      return { url, filename: env.JINGLE_S3_KEY.split('/').pop() ?? 'jingle' };
    } catch (err) {
      internal(err, 'Failed to sign jingle URL:', 'Failed to sign jingle URL');
    }
  }),

  // POST /api/uploads — create an upload + a platform job per platform, enqueue
  // the BullMQ jobs (deferred while a show is on air), release the show claim and
  // clear the staged upload. Returns { uploadId, jobs, deferredUntil }.
  create: protectedProcedure.input(CreateUploadSchema).mutation(async ({ input: data }) => {
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
        data.platforms.map((platform) => createPlatformJob(db, { upload_id: upload.id, platform }))
      );

      // Don't run heavy work (transcode/upload) while a show is on air — defer
      // the jobs until the live window (plus buffer) clears. Fails open if PB is
      // down.
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

      return {
        uploadId: upload.id,
        jobs,
        deferredUntil: delay > 0 ? live.resumeAt!.toISOString() : null,
      };
    } catch (err) {
      internal(err, 'Failed to create upload:', 'Failed to create upload');
    }
  }),

  // POST /api/uploads/:uploadId/jobs/:platform/retry — re-run a single platform
  // job. Reconstructs the payload from the stored upload row and re-enqueues.
  retryJob: protectedProcedure
    .input(z.object({ uploadId: z.string(), platform: z.enum(['youtube', 'mixcloud', 'archive']) }))
    .mutation(async ({ input }) => {
      const { uploadId, platform } = input;
      try {
        const upload = await getUploadWithJobs(db, uploadId);
        if (!upload) throw new TRPCError({ code: 'NOT_FOUND', message: 'Upload not found' });
        const job = upload.jobs.find((j) => j.platform === platform);
        if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
        if (job.status === 'processing') {
          throw new TRPCError({ code: 'CONFLICT', message: 'Job already running' });
        }

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
        return { ok: true };
      } catch (err) {
        internal(err, 'Failed to retry job:', 'Failed to retry job');
      }
    }),

  // POST /api/uploads/:uploadId/archive — (re)generate the downloadable audio
  // archive (m4a). Reuses or creates the 'archive' job and enqueues extraction.
  generateAudio: protectedProcedure.input(z.object({ uploadId: z.string() })).mutation(async ({ input }) => {
    try {
      const upload = await getUploadWithJobs(db, input.uploadId);
      if (!upload) throw new TRPCError({ code: 'NOT_FOUND', message: 'Upload not found' });
      let job = upload.jobs.find((j) => j.platform === 'archive');
      if (job?.status === 'processing') {
        throw new TRPCError({ code: 'CONFLICT', message: 'Already generating' });
      }
      if (!job) job = await createPlatformJob(db, { upload_id: upload.id, platform: 'archive' });
      else await resetPlatformJobForRetry(db, job.id);
      await uploadQueue.add('archive', {
        jobId: job.id,
        uploadId: upload.id,
        platform: 'archive',
        videoS3Key: upload.video_s3_key,
        title: upload.title,
        description: upload.description ?? '',
        tags: upload.tags ?? [],
        imageUrl: upload.image_url,
        jingleS3Key: upload.jingle_s3_key,
        includeJingle: false,
        autoTrimSilence: true,
        trimStart: upload.trim_start,
        trimEnd: upload.trim_end,
      });
      return { ok: true };
    } catch (err) {
      internal(err, 'Failed to enqueue audio archive:', 'Failed to generate audio');
    }
  }),

  // POST /api/uploads/:uploadId/publish — flip the PocketBase archive record to
  // "published" (the explicit, separate step that makes it live on the agenda).
  publishRecord: protectedProcedure.input(z.object({ uploadId: z.string() })).mutation(async ({ input }) => {
    try {
      const upload = await getUploadWithJobs(db, input.uploadId);
      if (!upload) throw new TRPCError({ code: 'NOT_FOUND', message: 'Upload not found' });
      await updateArchiveRecord(upload.show_id, { status: 'published' });
      return { ok: true };
    } catch (err) {
      internal(err, 'Failed to publish archive record:', 'Failed to publish archive record');
    }
  }),

  // PATCH /api/uploads/:uploadId/metadata — edit published metadata and push it
  // to the local DB, each published platform, and the PocketBase archive record.
  // Platform failures are reported per-target (sync), not fatal — the DB always
  // updates so the operator's edit isn't lost.
  updateMetadata: protectedProcedure
    .input(z.object({ uploadId: z.string() }).merge(MetadataSchema))
    .mutation(async ({ input }) => {
      const edit = { title: input.title, description: input.description, tags: input.tags };
      try {
        const upload = await getUploadWithJobs(db, input.uploadId);
        if (!upload) throw new TRPCError({ code: 'NOT_FOUND', message: 'Upload not found' });

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
          // edited names to genre IDs (creating any new ones). Only write the
          // relation when tags are present, so clearing tags never wipes curated
          // genres.
          const genres = edit.tags.length ? await resolveGenreIds(edit.tags) : [];
          // Re-assert the published platform links too, so an edit fully re-syncs
          // the archive record (e.g. after a write-back that failed at publish
          // time).
          const mediaLinks: { label: string; type: string; url: string }[] = [];
          if (yt) mediaLinks.push({ label: 'YouTube', type: 'video', url: yt.result_url! });
          if (mc) mediaLinks.push({ label: 'MixCloud', type: 'audio', url: mc.result_url! });
          await updateArchiveRecord(upload.show_id, {
            // The archive record keeps the plain title; the date/@coming-soon
            // suffix is only for the platform titles.
            title: baseTitle(edit.title),
            notes: edit.description,
            ...(genres.length ? { genres } : {}),
            ...(mediaLinks.length ? { mediaLinks } : {}),
          });
          sync.pocketbase = 'ok';
        } catch (err) {
          sync.pocketbase = err instanceof Error ? err.message : String(err);
        }

        return { ok: true, sync };
      } catch (err) {
        internal(err, 'Failed to update metadata:', 'Failed to update metadata');
      }
    }),
});
