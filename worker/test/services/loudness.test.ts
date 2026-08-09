import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/env', () => ({ env: { ARCHIVE_AUDIO_BITRATE: '256k' } }));

import { parseLoudnessJson, LOUDNESS } from '../../src/services/ffmpeg';

// What ffmpeg actually emits: the JSON block arrives last, after a pile of
// ordinary chatter that must not reach the parser.
const realStderr = `ffmpeg version 6.1.1 Copyright (c) 2000-2023 the FFmpeg developers
  Stream #0:0(eng): Video: hevc (Main), yuv420p(tv), 1920x1080
  Stream #0:1(eng): Audio: aac (LC), 48000 Hz, stereo, fltp, 192 kb/s
[Parsed_loudnorm_0 @ 0x55d1c8]
{
	"input_i" : "-9.42",
	"input_tp" : "-0.21",
	"input_lra" : "6.30",
	"input_thresh" : "-19.68",
	"output_i" : "-14.01",
	"output_tp" : "-1.00",
	"output_lra" : "6.20",
	"output_thresh" : "-24.24",
	"normalization_type" : "dynamic",
	"target_offset" : "0.01"
}`;

describe('LOUDNESS target', () => {
  // YouTube attenuates anything above -14 and never lifts quiet audio, so this
  // is the one value where YouTube leaves the file alone and Mixcloud — which
  // does not normalise at all — plays it at the same level.
  it('is -14 LUFS with a -1 dBTP ceiling', () => {
    expect(LOUDNESS.I).toBe(-14);
    expect(LOUDNESS.TP).toBe(-1);
  });
});

describe('parseLoudnessJson', () => {
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));

  it('extracts the measurement from real ffmpeg stderr', () => {
    expect(parseLoudnessJson(realStderr)).toEqual({
      input_i: '-9.42',
      input_tp: '-0.21',
      input_lra: '6.30',
      input_thresh: '-19.68',
      output_i: '-14.01',
      output_tp: '-1.00',
      output_lra: '6.20',
      output_thresh: '-24.24',
      normalization_type: 'dynamic',
      target_offset: '0.01',
    });
  });

  it('returns null when ffmpeg printed no JSON at all', () => {
    expect(parseLoudnessJson('ffmpeg version 6.1.1\nConversion failed!')).toBeNull();
  });

  it('returns null on a truncated JSON block', () => {
    expect(parseLoudnessJson('chatter\n{\n\t"input_i" : "-9.42",')).toBeNull();
  });

  // Silence measures as -inf. Feeding that back as a gain basis produces either
  // an ffmpeg error or an absurd gain, so it has to degrade to "leave it alone".
  it('rejects a silent measurement rather than normalising against -inf', () => {
    const silent = realStderr.replace('"-9.42"', '"-inf"');
    expect(parseLoudnessJson(silent)).toBeNull();
  });

  it('rejects a measurement missing a field the second pass needs', () => {
    const partial = realStderr.replace(/\t"input_thresh" : "-19.68",\n/, '');
    expect(parseLoudnessJson(partial)).toBeNull();
  });
});
