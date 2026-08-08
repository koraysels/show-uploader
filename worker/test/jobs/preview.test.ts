import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../src/services/ffmpeg', () => ({
  remuxToMp4: vi.fn(async () => {}),
  makeTempPath: (s: string) => `/tmp/${s}`,
  cleanup: vi.fn(),
}));

vi.mock('../../src/services/s3', () => ({
  downloadFromS3: vi.fn(async () => {}),
  uploadToS3: vi.fn(async () => {}),
  deleteFromS3: vi.fn(async () => {}),
  objectSize: vi.fn(async () => 4242),
}));

vi.mock('../../src/db', () => ({ repointPreviewKey: vi.fn(async () => {}) }));

import { remuxToMp4 } from '../../src/services/ffmpeg';
import { deleteFromS3, uploadToS3, objectSize } from '../../src/services/s3';
import { repointPreviewKey } from '../../src/db';
import { processPreview } from '../../src/jobs/preview';

const makeJob = (videoS3Key: string) =>
  ({ data: { videoS3Key }, updateProgress: vi.fn(async () => {}) }) as any;

describe('processPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(objectSize).mockResolvedValue(4242);
  });

  it('rewraps an mkv, repoints the row, then drops the original', async () => {
    const key = await processPreview(makeJob('uploads/1785-rec.mkv'));

    expect(key).toBe('uploads/1785-rec.mp4');
    expect(vi.mocked(remuxToMp4)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(uploadToS3)).toHaveBeenCalledWith(expect.any(String), 'uploads/1785-rec.mp4', 'video/mp4');
    expect(vi.mocked(repointPreviewKey)).toHaveBeenCalledWith(
      'uploads/1785-rec.mkv',
      'uploads/1785-rec.mp4',
      '1785-rec.mp4',
      4242
    );
    expect(vi.mocked(deleteFromS3)).toHaveBeenCalledWith('uploads/1785-rec.mkv');
  });

  // The remux is untrimmed on purpose: the operator previews in order to decide
  // where to cut, and the archive job applies the trim later.
  it('does not pass any trim to the remux', async () => {
    await processPreview(makeJob('uploads/rec.mkv'));

    const opts = vi.mocked(remuxToMp4).mock.calls[0][2];
    expect(opts).not.toHaveProperty('trimStart');
    expect(opts).not.toHaveProperty('trimEnd');
  });

  // A stale queued job must never rewrap-and-delete a file that is already the
  // MP4 — that would delete the only copy.
  it('is a no-op for a source that is already mp4', async () => {
    const key = await processPreview(makeJob('uploads/rec.mp4'));

    expect(key).toBe('uploads/rec.mp4');
    expect(vi.mocked(remuxToMp4)).not.toHaveBeenCalled();
    expect(vi.mocked(deleteFromS3)).not.toHaveBeenCalled();
    expect(vi.mocked(repointPreviewKey)).not.toHaveBeenCalled();
  });

  // Verify-before-repoint is what makes this safe to run on the only copy.
  it('fails without repointing or deleting when the upload did not land', async () => {
    vi.mocked(objectSize).mockResolvedValue(null);

    await expect(processPreview(makeJob('uploads/rec.mkv'))).rejects.toThrow(/missing or empty/i);

    expect(vi.mocked(repointPreviewKey)).not.toHaveBeenCalled();
    expect(vi.mocked(deleteFromS3)).not.toHaveBeenCalled();
  });
});
