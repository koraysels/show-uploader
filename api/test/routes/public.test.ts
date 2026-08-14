import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../src/env', () => ({ env: { S3_BUCKET: 'b' } }));
vi.mock('../../src/db/client', () => ({ db: {} }));
vi.mock('../../src/db/queries', () => ({ getUploadWithJobs: vi.fn() }));
vi.mock('../../src/services/s3', () => ({
  createDownloadPresignedUrl: vi.fn(async (k: string) => `https://signed.example/${k}?sig=abc`),
  objectInfo: vi.fn(async () => ({ exists: true, size: 1 })),
}));
// The show-record fallback (used when no usable upload row exists). Default to
// "no such record" so the upload-row tests below exercise only their own path;
// the fallback's own behaviour is covered by its dedicated tests.
vi.mock('../../src/services/shows-api', () => ({ getArchiveShow: vi.fn(async () => null) }));
vi.mock('../../src/services/show-folder', () => ({ findShowFolder: vi.fn(async () => null) }));

import { getUploadWithJobs } from '../../src/db/queries';
import { createDownloadPresignedUrl, objectInfo } from '../../src/services/s3';
import { getArchiveShow } from '../../src/services/shows-api';
import { findShowFolder } from '../../src/services/show-folder';
import { resolveRecording } from '../../src/routes/public';

const upload = (over: Record<string, unknown> = {}) =>
  ({
    id: 'up-1',
    video_s3_key: 'shows/2026-07-17-rec/video.mp4',
    audio_s3_key: 'shows/2026-07-17-rec/audio.m4a',
    jobs: [{ platform: 'archive', status: 'done' }],
    ...over,
  }) as any;

describe('resolveRecording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(createDownloadPresignedUrl).mockImplementation(
      async (k: string) => `https://signed.example/${k}?sig=abc`
    );
    vi.mocked(objectInfo).mockResolvedValue({ exists: true, size: 1 });
    vi.mocked(getArchiveShow).mockResolvedValue(null as any);
    vi.mocked(findShowFolder).mockResolvedValue(null);
  });

  it('signs the video archive', async () => {
    vi.mocked(getUploadWithJobs).mockResolvedValue(upload());

    await expect(resolveRecording('up-1', 'video')).resolves.toEqual({
      status: 302,
      url: 'https://signed.example/shows/2026-07-17-rec/video.mp4?sig=abc',
    });
  });

  it('signs the audio archive', async () => {
    vi.mocked(getUploadWithJobs).mockResolvedValue(upload());

    await expect(resolveRecording('up-1', 'audio')).resolves.toEqual({
      status: 302,
      url: 'https://signed.example/shows/2026-07-17-rec/audio.m4a?sig=abc',
    });
  });

  // Before the archive job finishes, video_s3_key still points at the raw
  // recording under incoming/ — wrong container, untrimmed, not
  // loudness-matched. The key's prefix is what says so; the job row doesn't.
  it('refuses a recording still sitting outside the published layout', async () => {
    vi.mocked(getUploadWithJobs).mockResolvedValue(
      upload({ video_s3_key: 'incoming/rec.mkv', jobs: [{ platform: 'archive', status: 'processing' }] })
    );

    const res = await resolveRecording('up-1', 'video');

    expect(res.status).toBe(404);
    expect(vi.mocked(createDownloadPresignedUrl)).not.toHaveBeenCalled();
  });

  // The regression this replaced: an operator clearing a finished job from the
  // queue must not take the recording it produced offline.
  it('still serves a published recording whose archive job row is gone', async () => {
    vi.mocked(getUploadWithJobs).mockResolvedValue(upload({ jobs: [] }));

    await expect(resolveRecording('up-1', 'video')).resolves.toEqual({
      status: 302,
      url: 'https://signed.example/shows/2026-07-17-rec/video.mp4?sig=abc',
    });
  });

  it('404s when the audio archive does not exist', async () => {
    vi.mocked(getUploadWithJobs).mockResolvedValue(upload({ audio_s3_key: null }));

    expect((await resolveRecording('up-1', 'audio')).status).toBe(404);
  });

  it('404s for an unknown upload', async () => {
    vi.mocked(getUploadWithJobs).mockResolvedValue(null as any);

    expect((await resolveRecording('nope', 'video')).status).toBe(404);
  });

  // The caller is unauthenticated, so failures must not describe the internals.
  it('returns an opaque 500 when signing fails', async () => {
    vi.mocked(getUploadWithJobs).mockResolvedValue(upload());
    vi.mocked(createDownloadPresignedUrl).mockRejectedValue(new Error('s3 credentials rejected'));

    const res = await resolveRecording('up-1', 'video');

    expect(res.status).toBe(500);
    expect(JSON.stringify(res)).not.toContain('credentials');
  });

  // A PocketBase record id isn't a UUID, so the upload lookup throws on the
  // cast rather than returning null. That's the fallback's normal entry path,
  // not an error — it must not surface as a 500.
  it('falls back to the archive record when the upload lookup throws', async () => {
    vi.mocked(getUploadWithJobs).mockRejectedValue(new Error('invalid input syntax for type uuid'));
    vi.mocked(getArchiveShow).mockResolvedValue({ id: 'pb1', date: '2026-07-31', title: 'Leena' } as any);
    vi.mocked(findShowFolder).mockResolvedValue('shows/2026-07-31-leena/');

    await expect(resolveRecording('pb1', 'audio')).resolves.toEqual({
      status: 302,
      url: 'https://signed.example/shows/2026-07-31-leena/audio.m4a?sig=abc',
    });
  });

  // The whole point of the fallback: a finished job that was later deleted
  // must not take its recording offline.
  it('serves a recording whose upload row is gone, via the archive record', async () => {
    vi.mocked(getUploadWithJobs).mockResolvedValue(null as any);
    vi.mocked(getArchiveShow).mockResolvedValue({ id: 'pb1', date: '2026-07-17', title: 'Oko Stellar' } as any);
    vi.mocked(findShowFolder).mockResolvedValue('shows/2026-07-17-oko-stellar/');

    await expect(resolveRecording('pb1', 'video')).resolves.toEqual({
      status: 302,
      url: 'https://signed.example/shows/2026-07-17-oko-stellar/video.mp4?sig=abc',
    });
  });

  // Two shows on one date can't be told apart from the record alone.
  it('refuses rather than guess when two folders share the date', async () => {
    vi.mocked(getUploadWithJobs).mockResolvedValue(null as any);
    vi.mocked(getArchiveShow).mockResolvedValue({ id: 'pb1', date: '2026-07-31', title: 'Leena' } as any);
    // findShowFolder refuses on a tie rather than pick a show at random.
    vi.mocked(findShowFolder).mockResolvedValue(null);

    expect((await resolveRecording('pb1', 'video')).status).toBe(404);
    expect(vi.mocked(createDownloadPresignedUrl)).not.toHaveBeenCalled();
  });

  it('404s when the folder exists but that artefact does not', async () => {
    vi.mocked(getUploadWithJobs).mockResolvedValue(null as any);
    vi.mocked(getArchiveShow).mockResolvedValue({ id: 'pb1', date: '2026-07-31', title: 'Leena' } as any);
    vi.mocked(findShowFolder).mockResolvedValue('shows/2026-07-31-leena/');
    vi.mocked(objectInfo).mockResolvedValue({ exists: false, size: null });

    expect((await resolveRecording('pb1', 'audio')).status).toBe(404);
  });

  it('returns an opaque 500 when the fallback itself fails', async () => {
    vi.mocked(getUploadWithJobs).mockResolvedValue(null as any);
    vi.mocked(getArchiveShow).mockRejectedValue(new Error('pocketbase connection refused'));

    const res = await resolveRecording('pb1', 'video');

    expect(res.status).toBe(500);
    expect(JSON.stringify(res)).not.toContain('connection refused');
  });
});
