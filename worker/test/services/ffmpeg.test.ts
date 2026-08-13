import { vi, describe, it, expect } from 'vitest';

vi.mock('../../src/env', () => ({ env: { ARCHIVE_AUDIO_BITRATE: '256k' } }));

// A chainable stand-in for fluent-ffmpeg's command builder: every builder
// method returns the same object, `on` records handlers so the test can fire
// them directly, and `run` is a no-op (the test drives completion itself via
// the recorded 'end' handler).
function makeChainableMock() {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  const cmd: Record<string, ReturnType<typeof vi.fn>> = {};
  const chainMethods = [
    'outputOptions', 'audioCodec', 'audioBitrate', 'audioFilters', 'noVideo',
    'seekInput', 'output', 'complexFilter', 'input', 'format',
  ];
  for (const m of chainMethods) cmd[m] = vi.fn(() => cmd);
  cmd.on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    (handlers[event] ??= []).push(handler);
    return cmd;
  });
  cmd.run = vi.fn(() => {});
  const emit = (event: string, ...args: unknown[]) => {
    for (const h of handlers[event] ?? []) h(...args);
  };
  return { cmd, emit };
}

vi.mock('fluent-ffmpeg', () => {
  const fn = vi.fn() as unknown as { (): unknown; ffprobe: ReturnType<typeof vi.fn> };
  fn.ffprobe = vi.fn((_input: string, cb: (err: unknown, data: unknown) => void) => {
    cb(null, {
      streams: [
        { codec_type: 'video', codec_name: 'h264' },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
    });
  });
  return { default: fn };
});

import ffmpeg from 'fluent-ffmpeg';
import { compressVideo } from '../../src/services/ffmpeg';

// Lets probeStreams' awaited ffprobe callback (invoked synchronously by the
// mock above) actually settle before the next line runs.
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('compressVideo progress handling', () => {
  // The real bug: fluent-ffmpeg reports percent as NaN (not undefined) when it
  // can't yet determine total duration for a tick. `?? 0` only catches
  // null/undefined, so a NaN tick used to reach onProgress as NaN, and from
  // there into a Postgres integer column — throwing inside an unawaited event
  // callback, which crashed the whole worker process in production.
  it('reports 0, not NaN, for a progress tick with no determinable duration', async () => {
    const { cmd, emit } = makeChainableMock();
    vi.mocked(ffmpeg).mockReturnValue(cmd as never);

    const onProgress = vi.fn();
    const promise = compressVideo('/tmp/in.mp4', '/tmp/out.mp4', { onProgress });
    await flush();

    emit('progress', { percent: NaN });
    emit('end');
    await promise;

    expect(onProgress).toHaveBeenCalledWith(0);
    expect(onProgress).not.toHaveBeenCalledWith(NaN);
  });

  // Progress reporting is best-effort. A rejecting onProgress (a DB hiccup, a
  // Redis blip) must never surface as an unhandled rejection or fail the
  // encode — that's what turned this into a process-crashing bug rather than
  // one missed progress update.
  it('does not let a rejecting onProgress crash the encode', async () => {
    const { cmd, emit } = makeChainableMock();
    vi.mocked(ffmpeg).mockReturnValue(cmd as never);

    const onProgress = vi.fn(async () => {
      throw new Error('db hiccup');
    });
    const promise = compressVideo('/tmp/in.mp4', '/tmp/out.mp4', { onProgress });
    await flush();

    emit('progress', { percent: 42 });
    await flush();
    emit('end');

    await expect(promise).resolves.toBeUndefined();
  });
});
