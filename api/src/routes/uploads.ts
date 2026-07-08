import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { createUpload, createPlatformJob, listUploadsWithJobs, getUploadWithJobs } from '../db/queries';
import { uploadQueue } from '../queue';
import { createUploadPresignedUrl } from '../services/s3';
import { getLiveState } from '../services/live-guard';
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
  trimStart: TimeCode,
  trimEnd: TimeCode,
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
            trimStart: data.trimStart ?? null,
            trimEnd: data.trimEnd ?? null,
          },
          { delay }
        )
      )
    );

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

uploadsRouter.get('/', async (_req, res) => {
  try {
    const uploads = await listUploadsWithJobs(db);
    res.json(uploads);
  } catch {
    res.status(500).json({ error: 'Failed to list uploads' });
  }
});

uploadsRouter.get('/:id', async (req, res) => {
  try {
    const upload = await getUploadWithJobs(db, req.params.id);
    if (!upload) return res.status(404).json({ error: 'Not found' });
    res.json(upload);
  } catch {
    res.status(500).json({ error: 'Failed to get upload' });
  }
});
