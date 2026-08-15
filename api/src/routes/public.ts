import { Router } from 'express';
import { db } from '../db/client';
import { getUploadWithJobs } from '../db/queries';
import { createDownloadPresignedUrl, objectInfo } from '../services/s3';
import { getArchiveShow } from '../services/shows-api';
import { findShowFolder } from '../services/show-folder';

export const publicRouter = Router();

// These links get opened by people (pasted in chats, clicked from the agenda),
// not only by machines — so a browser gets a small readable page instead of
// bare JSON, while API consumers keep the JSON contract.
function sendError(req: { headers: { accept?: string } }, res: any, status: number, error: string): void {
  if (!req.headers.accept?.includes('text/html')) {
    res.status(status).json({ error });
    return;
  }
  const hint =
    status === 404
      ? 'The recording may not be archived yet, or the link is outdated.'
      : 'Something went wrong on our side — try again in a minute.';
  res
    .status(status)
    .type('html')
    .send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${status} · show uploader</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fbfbfb;color:#1a1a1a;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  main{max-width:32rem;padding:2rem;text-align:center}
  h1{font-size:1rem;font-weight:700;margin:0 0 .5rem}
  p{font-size:.875rem;color:#666;margin:0;line-height:1.6}
</style></head>
<body><main><h1>${status} — ${error.toLowerCase()}</h1><p>${hint}</p></main></body></html>`);
}

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
 * to keep resolving after the job that produced it is gone. Folder matching
 * lives in services/show-folder.ts, shared with the backfill that migrates
 * these records to folder-keyed links.
 */
async function resolveByShowRecord(showId: string, which: 'video' | 'audio'): Promise<RecordingResult> {
  const show = await getArchiveShow(showId);
  if (!show?.date) return { status: 404, error: 'Not found' };

  const folder = await findShowFolder(show);
  if (!folder) return { status: 404, error: 'Not found' };

  const key = `${folder}${which === 'video' ? 'video.mp4' : 'audio.m4a'}`;
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

  const key = which === 'video' ? upload?.video_s3_key : upload?.audio_s3_key;

  // Only serve what the archive job actually finished: before that the video
  // key still points at an unprocessed recording — wrong container, untrimmed,
  // not loudness-matched — and the audio archive doesn't exist at all.
  //
  // The key itself proves that, and the job row doesn't: `shows/` is the
  // published layout, written only when the archive job completes, whereas a
  // job is a transient work record an operator may delete once it's done.
  // Checking the job instead took every recording offline the moment its
  // finished job was cleared from the queue.
  const archived = !!key && key.startsWith('shows/');

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
 * A show folder name: exactly what showSlug() produces, and nothing that could
 * step outside `shows/`. No slashes, no dots, so no traversal and no way to
 * address another prefix.
 */
const FOLDER = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Resolve a recording from the folder named in the URL.
 *
 * The durable form: the agenda record stores the S3 folder as part of the link
 * itself, so nothing has to be looked up or inferred at read time. The
 * uploadId form below has to find the key — through an upload row that may
 * have been deleted, or failing that by matching folders on date and title —
 * and that inference is exactly what kept breaking.
 *
 * The folder is a caller-supplied string, so it is pattern-checked and can
 * only ever name `shows/<folder>/{video.mp4,audio.m4a}`.
 */
export async function resolveShowFile(
  folder: string,
  which: 'video' | 'audio'
): Promise<RecordingResult> {
  if (!FOLDER.test(folder)) return { status: 404, error: 'Not found' };

  const key = `shows/${folder}/${which === 'video' ? 'video.mp4' : 'audio.m4a'}`;
  try {
    if (!(await objectInfo(key)).exists) return { status: 404, error: 'Not available' };
    return { status: 302, url: await createDownloadPresignedUrl(key) };
  } catch (err) {
    console.error('public show file lookup failed:', err);
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
  /**
   * The signed URL as JSON, instead of redirecting to it.
   *
   * For machine consumers that cannot follow the redirect safely. Liquidsoap
   * is the case that forced this: it probes an unknown URL with HEAD to work
   * out the file type, follows the 302 to the presigned target, and gets 403
   * — a SigV4 presigned URL is signed for GET, so HEAD is not covered by the
   * signature. With no content type it cannot infer an extension, saves the
   * download with none, and every decoder then refuses the file by
   * extension. Handing over the signed URL directly removes the redirect it
   * was tripping on: the URL is used once, immediately, so its expiry never
   * matters.
   *
   * Same resolution path as the redirect form below — this only changes how
   * the result is delivered, so the two can't diverge.
   */
  publicRouter.get(`/shows/:folder/${which}/url`, async (req, res) => {
    const result = await resolveShowFile(req.params.folder, which);
    if (result.status !== 302) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    // The URL inside is short-lived, so this response must not be cached
    // either — same reasoning as the redirect.
    res.setHeader('Cache-Control', 'no-store');
    res.json({ url: result.url });
  });

  publicRouter.get(`/shows/:folder/${which}`, async (req, res) => {
    const result = await resolveShowFile(req.params.folder, which);
    if (result.status !== 302) {
      sendError(req, res, result.status, result.error);
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, result.url);
  });

  publicRouter.get(`/recordings/:uploadId/${which}`, async (req, res) => {
    const result = await resolveRecording(req.params.uploadId, which);
    if (result.status !== 302) {
      sendError(req, res, result.status, result.error);
      return;
    }
    // The signed target expires, so the redirect itself must never be cached — a
    // cached 302 would keep sending listeners to a dead signature.
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, result.url);
  });
}
