import { Router } from 'express';
import { db } from '../db/client';
import { getUploadWithJobs } from '../db/queries';
import { createDownloadPresignedUrl } from '../services/s3';

export const publicRouter = Router();

export type RecordingResult =
  | { status: 302; url: string }
  | { status: 404; error: string }
  | { status: 500; error: string };

/**
 * Resolve a permanent recording link to a freshly signed URL.
 *
 * The agenda app needs URLs it can store and render forever, but the objects
 * live in a private bucket and presigned URLs expire within hours. So the stored
 * link points here and this redirects: the bucket stays private, the stored link
 * never rots, and because callers get a 302 rather than a proxied stream no file
 * bytes flow through the api.
 *
 * Split out from the route so the guards below are testable without standing up
 * an HTTP server.
 */
export async function resolveRecording(
  uploadId: string,
  which: 'video' | 'audio'
): Promise<RecordingResult> {
  let upload;
  try {
    upload = await getUploadWithJobs(db, uploadId);
  } catch (err) {
    console.error('public recording lookup failed:', err);
    return { status: 500, error: 'Failed to resolve recording' };
  }
  if (!upload) return { status: 404, error: 'Not found' };

  // Only serve what the archive job actually finished. Before that the video key
  // still points at an unprocessed recording — wrong container, untrimmed, not
  // loudness-matched — and the audio archive does not exist at all.
  const archived = upload.jobs?.some((j) => j.platform === 'archive' && j.status === 'done');
  const key = which === 'video' ? upload.video_s3_key : upload.audio_s3_key;
  if (!archived || !key) return { status: 404, error: 'Not available' };

  try {
    return { status: 302, url: await createDownloadPresignedUrl(key) };
  } catch (err) {
    // Never surface the underlying error to an unauthenticated caller.
    console.error('public recording signing failed:', err);
    return { status: 500, error: 'Failed to resolve recording' };
  }
}

/**
 * Permanent, unauthenticated links to a published recording.
 *
 * Deliberately public: these are the same recordings already published to
 * YouTube and MixCloud, and the agenda site that renders them has no login.
 */
for (const which of ['video', 'audio'] as const) {
  publicRouter.get(`/recordings/:uploadId/${which}`, async (req, res) => {
    const result = await resolveRecording(req.params.uploadId, which);
    if (result.status !== 302) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    // The signed target expires, so the redirect itself must never be cached — a
    // cached 302 would keep sending listeners to a dead signature.
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, result.url);
  });
}
