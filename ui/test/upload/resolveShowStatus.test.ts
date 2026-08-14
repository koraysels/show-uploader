import { describe, it, expect } from 'vitest';
import { resolveShowStatus, showStatusRank } from '../../src/upload/resolveShowStatus';

const live = (over: Record<string, unknown> = {}) =>
  ({ status: 'uploading', fraction: 0.5, filename: 'a.mkv', key: null, error: null, ...over }) as any;
const job = (over: Record<string, unknown> = {}) =>
  ({ platform: 'archive', status: 'processing', progress_pct: 40, error: null, ...over }) as any;

describe('resolveShowStatus', () => {
  it('reports nothing when nothing is happening', () => {
    expect(resolveShowStatus({})).toEqual({ state: 'none' });
  });

  it('reports this browser\'s upload as a whole percentage', () => {
    expect(resolveShowStatus({ live: live({ fraction: 0.376 }) })).toEqual({ state: 'uploading', pct: 38 });
  });

  it('carries the upload error through', () => {
    expect(resolveShowStatus({ live: live({ status: 'error', error: 'network died' }) })).toEqual({
      state: 'upload-failed',
      message: 'network died',
    });
  });

  // The live upload is the most specific thing known and it's actively
  // changing, so it wins over the older job rows sitting beside it.
  it('prefers a live upload over existing jobs', () => {
    expect(resolveShowStatus({ live: live(), jobs: [job()], staged: true })).toMatchObject({
      state: 'uploading',
    });
  });

  it('reports a running job with its progress', () => {
    expect(resolveShowStatus({ jobs: [job({ platform: 'mixcloud', progress_pct: 72 })] })).toEqual({
      state: 'processing',
      platform: 'mixcloud',
      pct: 72,
    });
  });

  // Several jobs run per upload; the one actually working is the useful one.
  it('prefers a processing job over a queued one', () => {
    expect(
      resolveShowStatus({ jobs: [job({ platform: 'youtube', status: 'queued' }), job({ platform: 'archive' })] })
    ).toMatchObject({ state: 'processing', platform: 'archive' });
  });

  it('reports a queued job when nothing is running yet', () => {
    expect(resolveShowStatus({ jobs: [job({ status: 'queued', platform: 'youtube' })] })).toEqual({
      state: 'queued',
      platform: 'youtube',
    });
  });

  // A failure is the only state that needs the operator to act, so it must not
  // be hidden by the finished jobs next to it.
  it('surfaces a failure over finished work', () => {
    expect(
      resolveShowStatus({
        jobs: [job({ platform: 'youtube', status: 'done' }), job({ platform: 'mixcloud', status: 'failed', error: 'bad codec' })],
      })
    ).toEqual({ state: 'job-failed', platform: 'mixcloud', message: 'bad codec' });
  });

  it('falls back to a generic message when a failed job carries none', () => {
    expect(resolveShowStatus({ jobs: [job({ status: 'failed', error: null })] })).toMatchObject({
      message: 'job failed',
    });
  });

  // A finished upload here and a server-recorded staged file mean the same
  // thing to the operator: a recording waiting to be started.
  it('treats a finished local upload and a staged file alike', () => {
    expect(resolveShowStatus({ live: live({ status: 'done' }) })).toEqual({ state: 'ready' });
    expect(resolveShowStatus({ staged: true })).toEqual({ state: 'ready' });
  });

  it('reports another machine\'s upload, with or without a percentage', () => {
    expect(resolveShowStatus({ elsewhere: { present: true, pct: 37 } })).toEqual({
      state: 'uploading-elsewhere',
      pct: 37,
    });
    expect(resolveShowStatus({ elsewhere: { present: true, pct: null } })).toEqual({
      state: 'uploading-elsewhere',
      pct: null,
    });
  });

  it('reports an already-archived show last', () => {
    expect(resolveShowStatus({ archived: true })).toEqual({ state: 'archived' });
    // Anything live outranks it.
    expect(resolveShowStatus({ archived: true, staged: true })).toEqual({ state: 'ready' });
  });
});

describe('showStatusRank', () => {
  it('sorts what needs attention soonest to the top', () => {
    const order = [
      { state: 'uploading', pct: 1 },
      { state: 'processing', platform: 'a', pct: 1 },
      { state: 'queued', platform: 'a' },
      { state: 'job-failed', platform: 'a', message: 'x' },
      { state: 'ready' },
      { state: 'uploading-elsewhere', pct: null },
      { state: 'archived' },
      { state: 'none' },
    ] as const;

    const ranks = order.map((s) => showStatusRank(s));
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
  });

  it('gives every state a distinct-enough rank to be sortable', () => {
    expect(showStatusRank({ state: 'none' })).toBe(0);
    expect(showStatusRank({ state: 'uploading', pct: 0 })).toBeGreaterThan(
      showStatusRank({ state: 'archived' })
    );
  });
});
