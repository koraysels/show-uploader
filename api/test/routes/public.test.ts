import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../src/env', () => ({ env: { S3_BUCKET: 'b' } }));
vi.mock('../../src/db/client', () => ({ db: {} }));
vi.mock('../../src/db/queries', () => ({ getUploadWithJobs: vi.fn() }));
vi.mock('../../src/services/s3', () => ({
  createDownloadPresignedUrl: vi.fn(async (k: string) => `https://signed.example/${k}?sig=abc`),
}));

import { getUploadWithJobs } from '../../src/db/queries';
import { createDownloadPresignedUrl } from '../../src/services/s3';
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

  it('returns an opaque 500 when the lookup itself fails', async () => {
    vi.mocked(getUploadWithJobs).mockRejectedValue(new Error('db connection refused'));

    const res = await resolveRecording('up-1', 'video');

    expect(res.status).toBe(500);
    expect(JSON.stringify(res)).not.toContain('connection refused');
  });
});
