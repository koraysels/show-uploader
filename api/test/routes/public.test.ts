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
vi.mock('../../src/services/storage-browse', () => ({ browse: vi.fn(async () => ({ folders: [], files: [] })) }));

import { getUploadWithJobs } from '../../src/db/queries';
import { createDownloadPresignedUrl, objectInfo } from '../../src/services/s3';
import { getArchiveShow } from '../../src/services/shows-api';
import { browse } from '../../src/services/storage-browse';
import { resolveRecording } from '../../src/routes/public';

const upload = (over: Record<string, unknown> = {}) =>
  ({
    id: 'up-1',
    video_s3_key: 'uploads/rec.mp4',
    audio_s3_key: 'archive/rec.m4a',
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
    vi.mocked(browse).mockResolvedValue({ folders: [], files: [] } as any);
  });

  it('signs the video archive', async () => {
    vi.mocked(getUploadWithJobs).mockResolvedValue(upload());

    await expect(resolveRecording('up-1', 'video')).resolves.toEqual({
      status: 302,
      url: 'https://signed.example/uploads/rec.mp4?sig=abc',
    });
  });

  it('signs the audio archive', async () => {
    vi.mocked(getUploadWithJobs).mockResolvedValue(upload());

    await expect(resolveRecording('up-1', 'audio')).resolves.toEqual({
      status: 302,
      url: 'https://signed.example/archive/rec.m4a?sig=abc',
    });
  });

  // Before the archive job finishes, video_s3_key still points at the raw
  // recording — wrong container, untrimmed, not loudness-matched.
  it('refuses a recording whose archive job has not finished', async () => {
    vi.mocked(getUploadWithJobs).mockResolvedValue(
      upload({ jobs: [{ platform: 'archive', status: 'processing' }] })
    );

    const res = await resolveRecording('up-1', 'video');

    expect(res.status).toBe(404);
    expect(vi.mocked(createDownloadPresignedUrl)).not.toHaveBeenCalled();
  });

  it('refuses when there is no archive job at all', async () => {
    vi.mocked(getUploadWithJobs).mockResolvedValue(upload({ jobs: [{ platform: 'youtube', status: 'done' }] }));

    expect((await resolveRecording('up-1', 'video')).status).toBe(404);
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
    vi.mocked(getArchiveShow).mockResolvedValue({ id: 'pb1', date: '2026-07-31' } as any);
    vi.mocked(browse).mockResolvedValue({
      folders: [{ key: 'shows/2026-07-31-leena/', name: '2026-07-31-leena', bytes: null, modified: null }],
      files: [],
    } as any);

    await expect(resolveRecording('pb1', 'audio')).resolves.toEqual({
      status: 302,
      url: 'https://signed.example/shows/2026-07-31-leena/audio.m4a?sig=abc',
    });
  });

  // The whole point of the fallback: a finished job that was later deleted
  // must not take its recording offline.
  it('serves a recording whose upload row is gone, via the archive record', async () => {
    vi.mocked(getUploadWithJobs).mockResolvedValue(null as any);
    vi.mocked(getArchiveShow).mockResolvedValue({ id: 'pb1', date: '2026-07-17' } as any);
    vi.mocked(browse).mockResolvedValue({
      folders: [{ key: 'shows/2026-07-17-oko-stellar/', name: '2026-07-17-oko-stellar', bytes: null, modified: null }],
      files: [],
    } as any);

    await expect(resolveRecording('pb1', 'video')).resolves.toEqual({
      status: 302,
      url: 'https://signed.example/shows/2026-07-17-oko-stellar/video.mp4?sig=abc',
    });
  });

  // Two shows on one date can't be told apart from the record alone.
  it('refuses rather than guess when two folders share the date', async () => {
    vi.mocked(getUploadWithJobs).mockResolvedValue(null as any);
    vi.mocked(getArchiveShow).mockResolvedValue({ id: 'pb1', date: '2026-07-31' } as any);
    vi.mocked(browse).mockResolvedValue({
      folders: [
        { key: 'shows/2026-07-31-a/', name: '2026-07-31-a', bytes: null, modified: null },
        { key: 'shows/2026-07-31-b/', name: '2026-07-31-b', bytes: null, modified: null },
      ],
      files: [],
    } as any);

    expect((await resolveRecording('pb1', 'video')).status).toBe(404);
    expect(vi.mocked(createDownloadPresignedUrl)).not.toHaveBeenCalled();
  });

  it('404s when the folder exists but that artefact does not', async () => {
    vi.mocked(getUploadWithJobs).mockResolvedValue(null as any);
    vi.mocked(getArchiveShow).mockResolvedValue({ id: 'pb1', date: '2026-07-31' } as any);
    vi.mocked(browse).mockResolvedValue({
      folders: [{ key: 'shows/2026-07-31-leena/', name: '2026-07-31-leena', bytes: null, modified: null }],
      files: [],
    } as any);
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
