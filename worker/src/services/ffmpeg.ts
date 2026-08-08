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

// Codecs an MP4/M4A container can hold as-is. Anything else (OBS can be set to
// record uncompressed PCM, or Opus) must be re-encoded — the .m4a "ipod" muxer
// rejects them at header-write time with AVERROR(EINVAL), i.e. exit code 234.
const MP4_AUDIO_CODECS = new Set(['aac', 'alac']);

async function probeStreams(
  input: string
): Promise<{ audioCodec: string | null; videoCodec: string | null }> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(input, (err, data) => {
      // Fail open: an unreadable probe degrades to "re-encode", never to a throw.
      if (err || !data?.streams) return resolve({ audioCodec: null, videoCodec: null });
      const find = (kind: string) =>
        data.streams.find((s) => s.codec_type === kind)?.codec_name ?? null;
      resolve({ audioCodec: find('audio'), videoCodec: find('video') });
    });
  });
}

const FFMPEG_ERROR_LINE = /error|could not|unable to|invalid|failed|no such|denied|not supported/i;

/**
 * Run an ffmpeg command, rejecting with the *real* ffmpeg error.
 *
 * fluent-ffmpeg's own error text is useless: its extractError() drops every
 * stderr line starting with '[', which is exactly where ffmpeg puts the cause,
 * leaving only a bare "Conversion failed!". So keep a tail of stderr ourselves.
 * The full tail goes to the worker log; the thrown message — which ends up in
 * the job row and is rendered on one line in the UI — carries only the lines
 * that actually name a cause.
 */
function runCommand(cmd: ffmpeg.FfmpegCommand, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tail: string[] = [];
    cmd.on('stderr', (line: string) => {
      if (!line.trim()) return;
      tail.push(line);
      if (tail.length > 40) tail.shift();
    });

    if (onProgress) {
      cmd.on('progress', (p: { percent?: number }) => {
        onProgress(Math.min(99, Math.round(p.percent ?? 0)));
      });
    }

    cmd
      .on('end', () => resolve())
      .on('error', (err: Error) => {
        if (!tail.length) return reject(err);
        console.error(`ffmpeg failed:\n${tail.join('\n')}`);
        const causes = tail.filter((l) => FFMPEG_ERROR_LINE.test(l)).slice(-3);
        reject(new Error([err.message, ...causes].join(' | ')));
      })
      .run();
  });
}

export async function extractAudio(
  videoPath: string,
  outputPath: string,
  opts?: { trimStart?: string | null; trimEnd?: string | null; onProgress?: (pct: number) => void }
): Promise<void> {
  const { audioCodec } = await probeStreams(videoPath);

  const cmd = ffmpeg(videoPath).noVideo();

  // Stream-copy when the source audio already fits the .m4a container (OBS set
  // to AAC) — no re-encode, no quality loss. Otherwise encode to AAC: a copy of
  // e.g. pcm_s16le into .m4a fails outright, it does not degrade gracefully.
  if (audioCodec && MP4_AUDIO_CODECS.has(audioCodec)) {
    cmd.audioCodec('copy');
  } else {
    cmd.audioCodec('aac').audioBitrate(env.ARCHIVE_AUDIO_BITRATE);
  }

  applyTrim(cmd, opts?.trimStart, opts?.trimEnd);

  cmd.outputOptions('-movflags', '+faststart');
  cmd.output(outputPath);

  return runCommand(cmd, opts?.onProgress);
}

// Prepend a jingle to the (stream-copied) show audio. Uses the concat FILTER,
// not the demuxer: the show audio is now a raw copy of the MKV's AAC (arbitrary
// sample rate / channels), so a jingle with different params must be resampled
// through the filtergraph. This re-encodes the result — unavoidable when gluing
// two differently-encoded clips, and only happens when a jingle is actually set.
// Grab a single frame `atSeconds` into the video and centre-crop it to a square
// (no letterbox — the sides are cropped away, not padded), scaled to 1080². Used
// as the cover art for the MixCloud/YouTube upload. Assumes a landscape source
// (OBS recordings), so the square side is the frame height.
export async function captureSquareFrame(
  videoPath: string,
  outputPath: string,
  atSeconds = 20
): Promise<void> {
  return runCommand(
    ffmpeg(videoPath)
      .seekInput(atSeconds)
      .outputOptions(['-frames:v', '1', '-vf', 'crop=ih:ih,scale=1080:1080', '-q:v', '2'])
      .output(outputPath)
  );
}

export async function prependJingle(
  jinglePath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  return runCommand(
    ffmpeg()
      .input(jinglePath)
      .input(audioPath)
      // concat requires identical sample rate / layout / format across inputs, so
      // normalise BOTH to 48k stereo fltp first — otherwise a jingle recorded at a
      // different rate/channels makes the merge error out and the jingle is dropped.
      .complexFilter([
        '[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[j]',
        '[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[s]',
        '[j][s]concat=n=2:v=0:a=1[out]',
      ])
      .outputOptions(['-map', '[out]'])
      .audioCodec('aac')
      .audioBitrate(env.ARCHIVE_AUDIO_BITRATE)
      .outputOptions(['-movflags', '+faststart'])
      .output(outputPath)
  );
}

/**
 * Rewrap a recording into MP4 without touching the video: the video stream is
 * copied bit-for-bit, so this is fast (I/O bound) and lossless. Only the audio
 * is re-encoded, and only when the container can't hold it as-is. Produces the
 * browser-playable archive that replaces the original MKV.
 */
export async function remuxToMp4(
  inputPath: string,
  outputPath: string,
  opts?: { trimStart?: string | null; trimEnd?: string | null; onProgress?: (pct: number) => void }
): Promise<void> {
  const { audioCodec, videoCodec } = await probeStreams(inputPath);

  const cmd = ffmpeg(inputPath).outputOptions(['-map', '0', '-c:v', 'copy']);

  // A plain HEVC copy is tagged 'hev1', which Safari/QuickTime refuse to play.
  // 'hvc1' is the same bitstream under the tag those players accept.
  if (videoCodec === 'hevc') cmd.outputOptions(['-tag:v', 'hvc1']);

  if (audioCodec && MP4_AUDIO_CODECS.has(audioCodec)) {
    cmd.audioCodec('copy');
  } else {
    cmd.audioCodec('aac').audioBitrate(env.ARCHIVE_AUDIO_BITRATE);
  }

  applyTrim(cmd, opts?.trimStart, opts?.trimEnd);

  cmd.outputOptions(['-movflags', '+faststart']);
  cmd.output(outputPath);

  return runCommand(cmd, opts?.onProgress);
}

// Fast trim without re-encoding (stream copy). Keyframe-aligned start (may be a
// second or two early) — fine for cutting dead air. Used for YouTube, which
// otherwise uploads the raw recording untrimmed.
export async function trimVideoCopy(
  input: string,
  output: string,
  opts: { trimStart?: string | null; trimEnd?: string | null; faststart?: boolean }
): Promise<void> {
  const cmd = ffmpeg(input);
  applyTrim(cmd, opts.trimStart, opts.trimEnd);
  cmd.outputOptions(['-c', 'copy', '-map', '0']);
  // This writes a NEW container, so the input's progressive layout is not
  // inherited — an archive trimmed here would not stream/seek in the browser.
  // Opt-in because the YouTube path trims into the source's own container,
  // which may be Matroska, where -movflags is not a valid option.
  if (opts.faststart) cmd.outputOptions(['-movflags', '+faststart']);
  cmd.output(output);
  return runCommand(cmd);
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
