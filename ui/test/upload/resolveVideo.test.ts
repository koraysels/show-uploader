import { describe, it, expect } from 'vitest';
import { resolveVideo, type LiveUpload } from '../../src/upload/resolveVideo';

const live = (over: Partial<LiveUpload>): LiveUpload => ({
  status: 'uploading',
  key: null,
  filename: 'recording.mkv',
  fraction: 0.3,
  error: null,
  ...over,
});

describe('resolveVideo — the single rule for a show\'s video', () => {
  it('is "none" when the show has nothing', () => {
    expect(resolveVideo({})).toEqual({ state: 'none' });
    expect(resolveVideo({ live: null, staged: null, pending: null })).toEqual({ state: 'none' });
  });

  it('shows live progress while uploading (over any staged video)', () => {
    expect(
      resolveVideo({ live: live({ status: 'uploading', fraction: 0.42 }), staged: { s3_key: 'k', filename: 's' } })
    ).toEqual({ state: 'uploading', filename: 'recording.mkv', fraction: 0.42 });
  });

  it('surfaces a live upload error', () => {
    expect(resolveVideo({ live: live({ status: 'error', error: 'network' }) })).toEqual({
      state: 'error',
      filename: 'recording.mkv',
      error: 'network',
    });
  });

  it('a just-finished live upload is ready with its own key', () => {
    expect(
      resolveVideo({
        live: live({ status: 'done', key: 'uploads/new.mkv', filename: 'new.mkv' }),
        staged: { s3_key: 'uploads/old.mkv', filename: 'old.mkv' },
      })
    ).toEqual({ state: 'ready', key: 'uploads/new.mkv', filename: 'new.mkv' });
  });

  it('a done upload WITHOUT a key never claims ready — falls back to staged', () => {
    expect(
      resolveVideo({ live: live({ status: 'done', key: null }), staged: { s3_key: 'uploads/st.mkv', filename: 'st.mkv' } })
    ).toEqual({ state: 'ready', key: 'uploads/st.mkv', filename: 'st.mkv' });
  });

  it('uses a hand-picked drop-folder file when there is no live upload', () => {
    expect(
      resolveVideo({ pending: { s3_key: 'uploads/pick.mkv', filename: 'pick.mkv' }, staged: { s3_key: 's', filename: 's' } })
    ).toEqual({ state: 'ready', key: 'uploads/pick.mkv', filename: 'pick.mkv' });
  });

  it('falls back to the durable server-staged video (the source of truth)', () => {
    expect(resolveVideo({ staged: { s3_key: 'uploads/staged.mkv', filename: 'staged.mkv' } })).toEqual({
      state: 'ready',
      key: 'uploads/staged.mkv',
      filename: 'staged.mkv',
    });
  });
});
