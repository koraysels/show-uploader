import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Real files on a real temp dir, sized by each test, rather than mocking 'fs'
// itself — the size guard this suite exists to prove reads real bytes off
// disk, so the fixtures have to be real files for that comparison to mean
// anything.
let workDir: string;
let inputBytes = 1000;
let outputBytes = 500;

vi.mock('../../src/services/ffmpeg', () => ({
  compressVideo: vi.fn(async (_input: string, output: string) => {
    fs.writeFileSync(output, Buffer.alloc(outputBytes));
  }),
  cleanup: vi.fn((...paths: string[]) => {
    for (const p of paths) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore missing files */
      }
    }
  }),
}));

vi.mock('../../src/services/s3', () => ({
  downloadFromS3: vi.fn(async (_key: string, dest: string) => {
    fs.writeFileSync(dest, Buffer.alloc(inputBytes));
  }),
  uploadToS3: vi.fn(async () => {}),
  objectSize: vi.fn(async () => 1234),
}));

vi.mock('../../src/db', () => ({
  setJobStatus: vi.fn(async () => {}),
}));

vi.mock('../../src/services/workspace', () => ({
  createWorkspace: vi.fn(() => ({
    path: (n: string) => path.join(workDir, n),
    cleanup: vi.fn(),
  })),
}));

import { compressVideo } from '../../src/services/ffmpeg';
import { downloadFromS3, uploadToS3, objectSize } from '../../src/services/s3';
import { setJobStatus } from '../../src/db';
import { processCompress } from '../../src/jobs/compress';

function makeJob(videoS3Key = 'shows/rec/video.mp4') {
  return {
    data: { jobId: 'job-1', uploadId: 'up-1', platform: 'compress', videoS3Key },
    updateProgress: vi.fn(async () => {}),
  } as any;
}

describe('compress job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(objectSize).mockResolvedValue(1234);
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compress-test-'));
    inputBytes = 1000;
    outputBytes = 500;
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('downloads, re-encodes, and uploads back over the same key', async () => {
    await processCompress(makeJob());

    expect(vi.mocked(downloadFromS3)).toHaveBeenCalledWith('shows/rec/video.mp4', path.join(workDir, 'input.mp4'));
    expect(vi.mocked(compressVideo)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(uploadToS3)).toHaveBeenCalledWith(
      path.join(workDir, 'compressed.mp4'),
      'shows/rec/video.mp4',
      'video/mp4'
    );
    expect(vi.mocked(setJobStatus)).toHaveBeenCalledWith('job-1', 'done', { progress_pct: 100 });
  });

  // The button is only ever shown for a playable (mp4) archive, but the job
  // guards independently — a caller-supplied key must never trigger a
  // wrong-codec re-encode attempt.
  it('refuses a non-mp4 source without touching ffmpeg or s3', async () => {
    await expect(processCompress(makeJob('shows/rec/video.mkv'))).rejects.toThrow(/not an mp4 archive/i);

    expect(vi.mocked(downloadFromS3)).not.toHaveBeenCalled();
    expect(vi.mocked(compressVideo)).not.toHaveBeenCalled();
    expect(vi.mocked(setJobStatus)).toHaveBeenCalledWith('job-1', 'failed', { error: expect.stringMatching(/not an mp4 archive/i) });
  });

  // A well-encoded source can come out of CRF 23 no smaller — this button has
  // to stay safe to press on any future recording, not just an oversized one,
  // so it must refuse to replace a fine file with a same-size lossy copy.
  it('refuses to upload when the re-encode is not smaller than the source', async () => {
    outputBytes = inputBytes;

    await expect(processCompress(makeJob())).rejects.toThrow(/not smaller/i);

    expect(vi.mocked(uploadToS3)).not.toHaveBeenCalled();
    expect(vi.mocked(setJobStatus)).toHaveBeenLastCalledWith('job-1', 'failed', {
      error: expect.stringMatching(/not smaller/i),
    });
  });

  // A truncated/failed upload must not be reported as a successful shrink.
  it('fails the job when the uploaded file is missing or empty on S3', async () => {
    vi.mocked(objectSize).mockResolvedValue(0);

    await expect(processCompress(makeJob())).rejects.toThrow(/missing or empty/i);

    expect(vi.mocked(setJobStatus)).toHaveBeenLastCalledWith('job-1', 'failed', {
      error: expect.stringMatching(/missing or empty/i),
    });
  });

  it('marks the job failed and rethrows when the re-encode itself fails', async () => {
    vi.mocked(compressVideo).mockRejectedValueOnce(new Error('ffmpeg exploded'));

    await expect(processCompress(makeJob())).rejects.toThrow('ffmpeg exploded');

    expect(vi.mocked(uploadToS3)).not.toHaveBeenCalled();
    expect(vi.mocked(setJobStatus)).toHaveBeenLastCalledWith('job-1', 'failed', { error: 'ffmpeg exploded' });
  });
});
