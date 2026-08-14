import type { PlatformJob } from '../api/client';
import type { UploadItem } from './UploadProvider';

/**
 * The single rule for "what is this show's recording doing right now?",
 * derived from every source that knows part of the answer:
 *
 *   - live:      an upload running in THIS browser (the only byte-level %)
 *   - jobs:      the platform/archive jobs, once a recording is submitted
 *   - staged:    uploaded and waiting, recorded server-side
 *   - elsewhere: an upload running on another machine (server-computed %)
 *   - archived:  the show already has its archived recording
 *
 * Pure, so it can be tested exhaustively without a DOM — the same reason
 * resolveVideo() next door is. The three screens that show this (to-process,
 * attach, and anything after) render one component over this type instead of
 * each re-deriving it and drifting apart, which is what happened before.
 */

export type ShowStatus =
  | { state: 'uploading'; pct: number }
  | { state: 'upload-failed'; message: string }
  | { state: 'queued'; platform: string }
  | { state: 'processing'; platform: string; pct: number }
  | { state: 'job-failed'; platform: string; message: string }
  | { state: 'ready' }
  | { state: 'uploading-elsewhere'; pct: number | null }
  | { state: 'archived' }
  | { state: 'none' };

export function resolveShowStatus(input: {
  live?: UploadItem | null;
  jobs?: PlatformJob[] | null;
  staged?: boolean;
  elsewhere?: { present: boolean; pct: number | null };
  archived?: boolean;
}): ShowStatus {
  const { live, jobs, staged, elsewhere, archived } = input;

  // A live upload in this tab outranks everything: it's the most specific
  // thing known, and it's actively changing.
  if (live?.status === 'uploading') return { state: 'uploading', pct: Math.round(live.fraction * 100) };
  if (live?.status === 'error') return { state: 'upload-failed', message: live.error ?? 'upload failed' };

  // Work in flight. Processing beats queued: a job actually running is the
  // more useful thing to report when several exist.
  const running = jobs?.find((j) => j.status === 'processing');
  if (running) {
    return { state: 'processing', platform: running.platform, pct: running.progress_pct };
  }
  const queued = jobs?.find((j) => j.status === 'queued');
  if (queued) return { state: 'queued', platform: queued.platform };

  // Failures matter more than the finished work beside them — they're the
  // only state that needs the operator to do something.
  const failed = jobs?.find((j) => j.status === 'failed');
  if (failed) {
    return { state: 'job-failed', platform: failed.platform, message: failed.error ?? 'job failed' };
  }

  // A just-finished upload in this tab and a server-recorded staged file are
  // the same thing to the operator: a recording waiting to be started.
  if (live?.status === 'done' || staged) return { state: 'ready' };

  if (elsewhere?.present) return { state: 'uploading-elsewhere', pct: elsewhere.pct };

  if (archived) return { state: 'archived' };

  return { state: 'none' };
}

/**
 * Sort weight, highest first: whatever needs attention soonest sorts to the
 * top. Kept beside the states themselves so adding one can't silently sort
 * as zero.
 */
export function showStatusRank(status: ShowStatus): number {
  switch (status.state) {
    case 'uploading':
      return 7;
    case 'processing':
      return 6;
    case 'queued':
      return 5;
    case 'upload-failed':
    case 'job-failed':
      return 4;
    case 'ready':
      return 3;
    case 'uploading-elsewhere':
      return 2;
    case 'archived':
      return 1;
    case 'none':
      return 0;
  }
}
