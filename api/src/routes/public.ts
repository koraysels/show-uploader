import { Router } from 'express';
import { db } from '../db/client';
import { getUploadWithJobs } from '../db/queries';
import { createDownloadPresignedUrl, objectInfo } from '../services/s3';
import { getArchiveShow } from '../services/shows-api';
import { browse } from '../services/storage-browse';

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
/**
 * The archived file for a PocketBase archive record, found on S3 directly.
 *
 * The fallback for an id that isn't (or is no longer) an upload row: jobs are
 * transient and deletable by design, so a link stored on an agenda record has
 * to keep resolving after the job that produced it is gone. The files
 * themselves are the durable thing, and they sit in one folder per show.
 *
 * Matched on the record's own date, not the slugified title: plenty of folders
 * predate the current naming convention (a show titled "Lina Ejdaa" lives in
 * shows/2026-07-31-leena/), and the date is the part that doesn't drift.
 */
async function resolveByShowRecord(showId: string, which: 'video' | 'audio'): Promise<RecordingResult> {
  const show = await getArchiveShow(showId);
  if (!show?.date) return { status: 404, error: 'Not found' };

  const listing = await browse('shows/');
  const matches = listing.folders.filter((f) => f.name.startsWith(show.date));
  // Two shows on one date can't be told apart from the record alone; refuse
  // rather than hand out someone else's recording.
  if (matches.length !== 1) return { status: 404, error: 'Not found' };

  const key = `${matches[0].key}${which === 'video' ? 'video.mp4' : 'audio.m4a'}`;
  if (!(await objectInfo(key)).exists) return { status: 404, error: 'Not available' };

  return { status: 302, url: await createDownloadPresignedUrl(key) };
}

export async function resolveRecording(
  id: string,
  which: 'video' | 'audio'
): Promise<RecordingResult> {
  let upload;
  try {
    upload = await getUploadWithJobs(db, id);
  } catch {
    // Not a UUID at all — a PocketBase record id (15 chars) makes Postgres
    // throw on the uuid cast. That's the show-record case below, not an error.
    upload = null;
  }

  // Only serve what the archive job actually finished. Before that the video key
  // still points at an unprocessed recording — wrong container, untrimmed, not
  // loudness-matched — and the audio archive does not exist at all.
  const archived = upload?.jobs?.some((j) => j.platform === 'archive' && j.status === 'done');
  const key = which === 'video' ? upload?.video_s3_key : upload?.audio_s3_key;

  if (!upload || !archived || !key) {
    // No usable upload row — resolve straight from the archive record instead.
    try {
      return await resolveByShowRecord(id, which);
    } catch (err) {
      console.error('public recording lookup failed:', err);
      return { status: 500, error: 'Failed to resolve recording' };
    }
  }

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
