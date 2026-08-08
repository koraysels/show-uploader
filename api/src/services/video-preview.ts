import { createHash } from 'crypto';

export type PreviewState =
  | { state: 'ready'; key: string }
  | { state: 'working'; pct: number }
  | { state: 'error'; message: string }
  | { state: 'idle' };

export type PreviewJobView = {
  status: 'waiting' | 'active' | 'delayed' | 'completed' | 'failed' | 'paused' | 'unknown';
  pct: number;
  failedReason?: string | null;
} | null;

/** The key the remux writes to: same path, `.mp4` extension. */
export function previewKeyFor(videoS3Key: string): string {
  const dot = videoS3Key.lastIndexOf('.');
  const slash = videoS3Key.lastIndexOf('/');
  // No extension (or the only dot is inside a directory name) — append rather
  // than truncate, so a key like "uploads/recording" never loses characters.
  if (dot <= slash) return `${videoS3Key}.mp4`;
  return `${videoS3Key.slice(0, dot)}.mp4`;
}

export function isPlayable(videoS3Key: string): boolean {
  return /\.mp4$/i.test(videoS3Key);
}

/**
 * BullMQ rejects custom job ids containing ':', and S3 keys are full of
 * characters that make poor ids, so the key is hashed. Deterministic on purpose:
 * it makes the enqueue idempotent, so two open tabs produce one remux.
 */
export function previewJobId(videoS3Key: string): string {
  return createHash('sha1').update(videoS3Key).digest('hex');
}

/**
 * What the prepare screen should show, given the key and the queue's view of the
 * remux. Pure so the state machine can be tested without Redis or S3.
 *
 * An MP4 key is itself the evidence that the work is done — the job having
 * repointed the row is what changes the key — so readiness never depends on the
 * queue retaining a completed job.
 */
export function derivePreviewState(input: { videoS3Key: string; job: PreviewJobView }): PreviewState {
  const { videoS3Key, job } = input;

  if (isPlayable(videoS3Key)) return { state: 'ready', key: videoS3Key };

  if (!job) return { state: 'idle' };

  switch (job.status) {
    case 'waiting':
    case 'delayed':
    case 'paused':
      return { state: 'working', pct: 0 };
    case 'active':
      // Clamp: a finished ffmpeg can report 100 before the upload+repoint lands,
      // and showing "100%" next to a spinner reads as stuck.
      return { state: 'working', pct: Math.min(99, Math.max(0, Math.round(job.pct))) };
    case 'completed':
      // The row is repointed but this caller still holds the old key; the client
      // refetches on 'ready' and picks up the new one.
      return { state: 'ready', key: previewKeyFor(videoS3Key) };
    case 'failed':
      return { state: 'error', message: job.failedReason || 'Could not convert this recording' };
    default:
      return { state: 'idle' };
  }
}
