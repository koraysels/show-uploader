import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock every side effect: this exercises the branching around the remux, not
// ffmpeg or S3 themselves.
vi.mock('../../src/services/ffmpeg', () => ({
  extractAudio: vi.fn(async () => {}),
  remuxToMp4: vi.fn(async () => {}),
  trimVideoCopy: vi.fn(async () => {}),
  resolveTrim: vi.fn(async () => ({ trimStart: null, trimEnd: null })),
  makeTempPath: (s: string) => `/tmp/${s}`,
  cleanup: vi.fn(),
}));

vi.mock('../../src/services/s3', () => ({
  downloadFromS3: vi.fn(async () => {}),
  uploadToS3: vi.fn(async () => {}),
  deleteFromS3: vi.fn(async () => {}),
  objectSize: vi.fn(async () => 1234),
}));

vi.mock('../../src/db', () => ({
  setJobStatus: vi.fn(async () => {}),
  setAudioKey: vi.fn(async () => {}),
  setVideoKey: vi.fn(async () => {}),
  getPlatformJobsForUpload: vi.fn(async () => []),
  createArchiveJobRecord: vi.fn(async () => null),
}));

vi.mock('../../src/queue', () => ({ uploadQueue: { add: vi.fn() }, previewQueue: { add: vi.fn() } }));

import { remuxToMp4, trimVideoCopy, resolveTrim } from '../../src/services/ffmpeg';
import { deleteFromS3, uploadToS3 } from '../../src/services/s3';
import { processArchive } from '../../src/jobs/archive';

function makeJob(over: Record<string, unknown> = {}) {
  return {
    data: {
      jobId: 'job-1',
      uploadId: 'up-1',
      platform: 'archive',
      videoS3Key: 'uploads/rec.mkv',
      title: 't',
      description: 'd',
      tags: [],
      imageUrl: null,
      jingleS3Key: null,
      includeJingle: false,
      trimStart: null,
      trimEnd: null,
      ...over,
    },
    updateProgress: vi.fn(async () => {}),
  } as any;
}

describe('archive video remux', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveTrim).mockResolvedValue({ trimStart: null, trimEnd: null });
  });

  it('remuxes an mkv source and deletes the original', async () => {
    await processArchive(makeJob());

    expect(vi.mocked(remuxToMp4)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(trimVideoCopy)).not.toHaveBeenCalled();
    expect(vi.mocked(uploadToS3)).toHaveBeenCalledWith(expect.any(String), 'uploads/rec.mp4', 'video/mp4');
    expect(vi.mocked(deleteFromS3)).toHaveBeenCalledWith('uploads/rec.mkv');
  });

  // The preview remux already produced this MP4, so there is nothing to rewrap.
  it('does no video work for an untrimmed mp4 source', async () => {
    await processArchive(makeJob({ videoS3Key: 'uploads/rec.mp4' }));

    expect(vi.mocked(remuxToMp4)).not.toHaveBeenCalled();
    expect(vi.mocked(trimVideoCopy)).not.toHaveBeenCalled();
    expect(vi.mocked(deleteFromS3)).not.toHaveBeenCalled();
  });

  // Without this branch, pre-converting a recording for preview would silently
  // drop the operator's trim from the archived video.
  it('trims an already-mp4 source with a stream copy instead of skipping it', async () => {
    vi.mocked(resolveTrim).mockResolvedValue({ trimStart: '00:00:10', trimEnd: '01:00:00' });

    await processArchive(makeJob({ videoS3Key: 'uploads/rec.mp4', trimStart: '00:00:10', trimEnd: '01:00:00' }));

    expect(vi.mocked(trimVideoCopy)).toHaveBeenCalledWith('/tmp/input.mp4', '/tmp/archive.mp4', {
      trimStart: '00:00:10',
      trimEnd: '01:00:00',
    });
    expect(vi.mocked(remuxToMp4)).not.toHaveBeenCalled();
    expect(vi.mocked(uploadToS3)).toHaveBeenCalledWith(expect.any(String), 'uploads/rec.mp4', 'video/mp4');
  });

  // The trimmed file is written back over its own key, so the usual "delete the
  // original" step would delete the archive that was just uploaded.
  it('never deletes the source when the remuxed key is the source key', async () => {
    vi.mocked(resolveTrim).mockResolvedValue({ trimStart: '00:00:10', trimEnd: null });

    await processArchive(makeJob({ videoS3Key: 'uploads/rec.mp4', trimStart: '00:00:10' }));

    expect(vi.mocked(deleteFromS3)).not.toHaveBeenCalled();
  });
});
