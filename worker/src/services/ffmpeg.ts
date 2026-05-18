import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { env } from '../env';

export async function extractAudio(
  videoPath: string,
  outputPath: string,
  opts?: { trimStart?: string | null; trimEnd?: string | null; onProgress?: (pct: number) => void }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(videoPath)
      .noVideo()
      .audioCodec('aac')
      .audioBitrate(env.ARCHIVE_AUDIO_BITRATE);

    if (opts?.trimStart) cmd.seekInput(opts.trimStart);
    if (opts?.trimEnd) cmd.outputOptions(['-to', opts.trimEnd]);

    cmd.output(outputPath);

    if (opts?.onProgress) {
      cmd.on('progress', (p: { percent?: number }) => {
        opts.onProgress!(Math.min(99, Math.round(p.percent ?? 0)));
      });
    }

    cmd.on('end', () => resolve()).on('error', reject).run();
  });
}

export async function prependJingle(
  jinglePath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const listFile = `${outputPath}.concat.txt`;
    fs.writeFileSync(listFile, `file '${jinglePath}'\nfile '${audioPath}'\n`);

    ffmpeg()
      .input(listFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .audioCodec('aac')
      .audioBitrate(env.ARCHIVE_AUDIO_BITRATE)
      .output(outputPath)
      .on('end', () => {
        try { fs.unlinkSync(listFile); } catch { /* ignore */ }
        resolve();
      })
      .on('error', (err: Error) => {
        try { fs.unlinkSync(listFile); } catch { /* ignore */ }
        reject(err);
      })
      .run();
  });
}

export async function transcodeToMp4(
  inputPath: string,
  outputPath: string,
  opts?: { trimStart?: string | null; trimEnd?: string | null; onProgress?: (pct: number) => void }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputPath)
      .videoCodec('libx264')
      .videoBitrate(env.ARCHIVE_VIDEO_BITRATE)
      .audioCodec('aac')
      .audioBitrate(env.ARCHIVE_AUDIO_BITRATE)
      .outputOptions(['-movflags', '+faststart']);

    if (opts?.trimStart) cmd.seekInput(opts.trimStart);
    if (opts?.trimEnd) cmd.outputOptions(['-to', opts.trimEnd]);

    cmd.output(outputPath);

    if (opts?.onProgress) {
      cmd.on('progress', (p: { percent?: number }) => {
        opts.onProgress!(Math.min(99, Math.round(p.percent ?? 0)));
      });
    }

    cmd.on('end', () => resolve()).on('error', reject).run();
  });
}

export function makeTempPath(suffix: string): string {
  const dir = path.join('/tmp', 'show-uploader');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${Date.now()}-${suffix}`);
}

export function cleanup(...paths: string[]): void {
  for (const p of paths) {
    try { fs.unlinkSync(p); } catch { /* ignore missing files */ }
  }
}
