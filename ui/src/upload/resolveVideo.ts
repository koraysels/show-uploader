// The single, pure rule for "what video does this show have?" — derived from the
// three inputs, with no stored/derived state that can drift:
//   - live:    the in-memory upload for this show (progress / just-finished)
//   - staged:  the server-recorded staged video (the durable source of truth,
//              written when a multipart upload completes)
//   - pending: a manually-picked file from the drop folder
//
// Kept as a pure function so it can be unit-tested exhaustively.

export type LiveUpload = {
  status: 'uploading' | 'done' | 'error';
  key: string | null;
  filename: string;
  fraction: number;
  error: string | null;
};

export type StagedVideo = { s3_key: string; filename: string };

export type ResolvedVideo =
  | { state: 'uploading'; filename: string; fraction: number }
  | { state: 'error'; filename: string; error: string }
  | { state: 'ready'; key: string; filename: string }
  | { state: 'none' };

export function resolveVideo(input: {
  live?: LiveUpload | null;
  staged?: StagedVideo | null;
  pending?: StagedVideo | null;
}): ResolvedVideo {
  const { live, staged, pending } = input;

  // A live upload for THIS show drives the transient states.
  if (live?.status === 'uploading') return { state: 'uploading', filename: live.filename, fraction: live.fraction };
  if (live?.status === 'error') return { state: 'error', filename: live.filename, error: live.error ?? 'Upload failed' };

  // "ready" resolves to the first durable key available: a just-finished live
  // upload, a hand-picked drop-folder file, or the server-staged video.
  if (live?.status === 'done' && live.key) return { state: 'ready', key: live.key, filename: live.filename };
  if (pending) return { state: 'ready', key: pending.s3_key, filename: pending.filename };
  if (staged) return { state: 'ready', key: staged.s3_key, filename: staged.filename };

  return { state: 'none' };
}
