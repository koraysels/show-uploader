import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { env } from '../env';

// Apply an absolute [start, end] trim: seek to start (-ss input) and limit the
// output to (end - start) via -t. Using a duration avoids the ambiguity of -to
// with an input seek, so the end point is honoured correctly.
function hms(s?: string): number {
  if (!s) return 0;
  const [h = '0', m = '0', sec = '0'] = s.split(':');
  return Number(h) * 3600 + Number(m) * 60 + Number(sec);
}
function applyTrim(cmd: ffmpeg.FfmpegCommand, trimStart?: string | null, trimEnd?: string | null) {
  if (trimStart) cmd.seekInput(trimStart);
  if (trimEnd) {
    const dur = hms(trimEnd) - hms(trimStart ?? '00:00:00');
    if (dur > 0) cmd.outputOptions(['-t', String(dur)]);
  }
}

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

    applyTrim(cmd, opts?.trimStart, opts?.trimEnd);

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

    applyTrim(cmd, opts?.trimStart, opts?.trimEnd);

    cmd.output(outputPath);

    if (opts?.onProgress) {
      cmd.on('progress', (p: { percent?: number }) => {
        opts.onProgress!(Math.min(99, Math.round(p.percent ?? 0)));
      });
    }

    cmd.on('end', () => resolve()).on('error', reject).run();
  });
}

// Fast trim without re-encoding (stream copy). Keyframe-aligned start (may be a
// second or two early) — fine for cutting dead air. Used for YouTube, which
// otherwise uploads the raw recording untrimmed.
export async function trimVideoCopy(
  input: string,
  output: string,
  opts: { trimStart?: string | null; trimEnd?: string | null }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(input);
    applyTrim(cmd, opts.trimStart, opts.trimEnd);
    cmd.outputOptions(['-c', 'copy', '-map', '0'])
      .output(output)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

function secondsToHms(total: number): string {
  const t = Math.max(0, Math.floor(total));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}

type Silence = { start: number; end: number | null };

// Turn detected silence periods into edge trim points: only the leading silence
// (starts at ~0) and the trailing silence (runs to EOF) are cut. Anything in the
// middle is left alone. Conservative on purpose — never trims real content.
function edgeTrim(silences: Silence[], duration: number): { trimStart: string | null; trimEnd: string | null } {
  let trimStart: string | null = null;
  let trimEnd: string | null = null;
  const EDGE = 0.5; // seconds tolerance for "at the very start/end"
  for (const sil of silences) {
    if (sil.start <= EDGE && sil.end != null && sil.end > 1) trimStart = secondsToHms(sil.end);
    const runsToEnd = sil.end == null || (duration > 0 && sil.end >= duration - EDGE);
    if (runsToEnd && duration > 0 && sil.start > 1 && sil.start < duration - 0.5) {
      trimEnd = secondsToHms(sil.start);
    }
  }
  return { trimStart, trimEnd };
}

/**
 * Detect leading/trailing silence with ffmpeg's silencedetect filter and return
 * HH:MM:SS trim points. Fails open (no trim) on any error so a bad detection
 * never breaks a publish.
 */
export async function detectSilenceBounds(
  videoPath: string,
  opts: { noiseDb?: number; minSilenceSec?: number } = {}
): Promise<{ trimStart: string | null; trimEnd: string | null }> {
  const noise = opts.noiseDb ?? -40;
  const minSil = opts.minSilenceSec ?? 1.0;
  return new Promise((resolve) => {
    const silences: Silence[] = [];
    let duration = 0;
    ffmpeg(videoPath)
      .noVideo() // decode audio only — otherwise ffmpeg decodes the whole video (minutes on a 2h file)
      .audioFilters(`silencedetect=noise=${noise}dB:d=${minSil}`)
      .format('null')
      .output(process.platform === 'win32' ? 'NUL' : '/dev/null')
      .on('codecData', (d: { duration?: string }) => { duration = hms(d.duration); })
      .on('stderr', (line: string) => {
        const s = line.match(/silence_start:\s*(-?[\d.]+)/);
        const e = line.match(/silence_end:\s*(-?[\d.]+)/);
        if (s) silences.push({ start: Math.max(0, parseFloat(s[1])), end: null });
        else if (e && silences.length) silences[silences.length - 1].end = parseFloat(e[1]);
      })
      .on('end', () => resolve(edgeTrim(silences, duration)))
      .on('error', () => resolve({ trimStart: null, trimEnd: null }))
      .run();
  });
}

/**
 * Resolve the effective trim: an explicit manual trim wins; otherwise auto-detect
 * leading/trailing silence when enabled; otherwise no trim.
 */
export async function resolveTrim(
  videoPath: string,
  opts: { manualStart?: string | null; manualEnd?: string | null; autoTrimSilence?: boolean }
): Promise<{ trimStart: string | null; trimEnd: string | null }> {
  if (opts.manualStart || opts.manualEnd) {
    return { trimStart: opts.manualStart ?? null, trimEnd: opts.manualEnd ?? null };
  }
  if (opts.autoTrimSilence) return detectSilenceBounds(videoPath);
  return { trimStart: null, trimEnd: null };
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
