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
  // ±1 day, not the billed date alone: a show billed for one date is often
  // recorded the evening before (see show-slug.ts), so its folder can carry
  // either date — "Palmbomen II" is billed 2026-08-07 and filed under
  // 2026-08-08. Title scoring below is what actually picks between them.
  const day = (offset: number) => {
    const d = new Date(`${show.date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const dates = [show.date, day(-1), day(1)];
  const sameDay = listing.folders.filter((f) => dates.some((d) => f.name.startsWith(d)));
  if (sameDay.length === 0) return { status: 404, error: 'Not found' };

  // Several shows air on the same date, so the date alone doesn't identify a
  // folder. Folder names come from the recording's filename rather than the
  // agenda title ("Lina Ejdaa" sits in 2026-07-31-leena), so compare on shared
  // word-stems instead of requiring the slug to match.
  const words = (s: string) =>
    s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const showWords = words(show.title);
  const score = (folderName: string) => {
    // Strip the leading YYYY-MM-DD, whichever of the candidate dates it is.
    const fw = words(folderName.replace(/^\d{4}-\d{2}-\d{2}-?/, ''));
    return fw.filter((w) => showWords.some((s) => s.startsWith(w) || w.startsWith(s))).length;
  };

  const ranked = sameDay
    .map((f) => ({ folder: f, score: score(f.name) }))
    .sort((a, b) => b.score - a.score);
  // A tie (including everything scoring zero) can't be resolved from the
  // record alone — refuse rather than hand out another show's recording.
  if (ranked[0].score === 0 || (ranked[1] && ranked[1].score === ranked[0].score)) {
    return { status: 404, error: 'Not found' };
  }

  const key = `${ranked[0].folder.key}${which === 'video' ? 'video.mp4' : 'audio.m4a'}`;
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
  publicRouter.get(`/shows/:folder/${which}`, async (req, res) => {
    const result = await resolveShowFile(req.params.folder, which);
    if (result.status !== 302) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, result.url);
  });

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
