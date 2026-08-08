import { describe, it, expect } from 'vitest';
import {
  derivePreviewState,
  isPlayable,
  previewKeyFor,
  previewJobId,
  type PreviewJobView,
} from '../../src/services/video-preview';

const job = (over: Partial<NonNullable<PreviewJobView>> = {}): PreviewJobView => ({
  status: 'active',
  pct: 0,
  ...over,
});

describe('previewKeyFor', () => {
  it('swaps the extension for .mp4', () => {
    expect(previewKeyFor('uploads/123-show.mkv')).toBe('uploads/123-show.mp4');
    expect(previewKeyFor('uploads/123-show.avi')).toBe('uploads/123-show.mp4');
  });

  it('appends rather than truncating when there is no extension', () => {
    expect(previewKeyFor('uploads/recording')).toBe('uploads/recording.mp4');
  });

  // A dotted directory must not be mistaken for the file's extension — that
  // would slice the filename away and point at a key that never exists.
  it('ignores dots that belong to a directory', () => {
    expect(previewKeyFor('uploads/v1.2/recording')).toBe('uploads/v1.2/recording.mp4');
  });

  it('leaves a name with dots intact', () => {
    expect(previewKeyFor('uploads/show 8.8.2026 coming soon.mkv')).toBe(
      'uploads/show 8.8.2026 coming soon.mp4'
    );
  });
});

describe('isPlayable', () => {
  it('accepts mp4 in any case and rejects other containers', () => {
    expect(isPlayable('a/b.mp4')).toBe(true);
    expect(isPlayable('a/b.MP4')).toBe(true);
    expect(isPlayable('a/b.mkv')).toBe(false);
    expect(isPlayable('a/b.mp4.mkv')).toBe(false);
  });
});

describe('previewJobId', () => {
  it('is deterministic, so concurrent callers collapse onto one remux', () => {
    expect(previewJobId('uploads/a.mkv')).toBe(previewJobId('uploads/a.mkv'));
    expect(previewJobId('uploads/a.mkv')).not.toBe(previewJobId('uploads/b.mkv'));
  });

  // BullMQ rejects custom job ids containing ':', and S3 keys routinely have
  // characters that make poor ids.
  it('produces an id safe to hand to bullmq', () => {
    expect(previewJobId('uploads/show: the sequel.mkv')).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('derivePreviewState', () => {
  it('reports an mp4 as ready without consulting the queue', () => {
    expect(derivePreviewState({ videoS3Key: 'uploads/a.mp4', job: null })).toEqual({
      state: 'ready',
      key: 'uploads/a.mp4',
    });
  });

  // Readiness must not depend on the queue retaining a completed job, or a
  // pruned queue would make a converted recording look unconverted.
  it('still reports ready for an mp4 when the job is long gone', () => {
    expect(derivePreviewState({ videoS3Key: 'uploads/a.mp4', job: job({ status: 'unknown' }) })).toEqual({
      state: 'ready',
      key: 'uploads/a.mp4',
    });
  });

  it('is idle for a non-mp4 with no job', () => {
    expect(derivePreviewState({ videoS3Key: 'uploads/a.mkv', job: null })).toEqual({ state: 'idle' });
  });

  it('reports queued work as working at zero', () => {
    expect(derivePreviewState({ videoS3Key: 'uploads/a.mkv', job: job({ status: 'waiting' }) })).toEqual({
      state: 'working',
      pct: 0,
    });
  });

  it('passes through active progress', () => {
    expect(derivePreviewState({ videoS3Key: 'uploads/a.mkv', job: job({ pct: 42.4 }) })).toEqual({
      state: 'working',
      pct: 42,
    });
  });

  // ffmpeg hits 100 before the upload and repoint finish; showing 100% beside a
  // spinner reads as stuck.
  it('clamps active progress below 100', () => {
    expect(derivePreviewState({ videoS3Key: 'uploads/a.mkv', job: job({ pct: 100 }) })).toEqual({
      state: 'working',
      pct: 99,
    });
  });

  it('treats a completed job as ready at the remuxed key', () => {
    expect(derivePreviewState({ videoS3Key: 'uploads/a.mkv', job: job({ status: 'completed' }) })).toEqual({
      state: 'ready',
      key: 'uploads/a.mp4',
    });
  });

  it('surfaces the failure reason', () => {
    expect(
      derivePreviewState({
        videoS3Key: 'uploads/a.mkv',
        job: job({ status: 'failed', failedReason: 'ffmpeg exited 1' }),
      })
    ).toEqual({ state: 'error', message: 'ffmpeg exited 1' });
  });

  it('falls back to a readable message when the failure has no reason', () => {
    expect(
      derivePreviewState({ videoS3Key: 'uploads/a.mkv', job: job({ status: 'failed', failedReason: null }) })
    ).toEqual({ state: 'error', message: 'Could not convert this recording' });
  });
});
