import { describe, it, expect } from 'vitest';
import {
  planParts,
  partsToUpload,
  progressFraction,
  backoffDelay,
  fileFingerprint,
} from './multipartPlan';

const MB = 1024 * 1024;

describe('planParts', () => {
  it('splits into full parts plus a remainder', () => {
    const parts = planParts(40 * MB, 16 * MB);
    expect(parts.map((p) => p.size)).toEqual([16 * MB, 16 * MB, 8 * MB]);
    expect(parts.map((p) => p.partNumber)).toEqual([1, 2, 3]);
    expect(parts[2].start).toBe(32 * MB);
    expect(parts[2].end).toBe(40 * MB);
  });

  it('makes a single part for a file smaller than one chunk', () => {
    const parts = planParts(1234, 16 * MB);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ partNumber: 1, start: 0, end: 1234, size: 1234 });
  });

  it('handles an exact multiple with no remainder part', () => {
    const parts = planParts(32 * MB, 16 * MB);
    expect(parts).toHaveLength(2);
    expect(parts[1].end).toBe(32 * MB);
  });

  it('rejects non-positive inputs', () => {
    expect(() => planParts(0, MB)).toThrow();
    expect(() => planParts(MB, 0)).toThrow();
  });
});

describe('partsToUpload', () => {
  const plan = planParts(40 * MB, 16 * MB); // parts 1,2,3

  it('returns all parts when nothing is uploaded', () => {
    expect(partsToUpload(plan, []).map((p) => p.partNumber)).toEqual([1, 2, 3]);
  });

  it('skips parts already uploaded at the correct size', () => {
    const remaining = partsToUpload(plan, [
      { partNumber: 1, size: 16 * MB },
      { partNumber: 2, size: 16 * MB },
    ]);
    expect(remaining.map((p) => p.partNumber)).toEqual([3]);
  });

  it('re-uploads a part whose stored size does not match (truncated)', () => {
    const remaining = partsToUpload(plan, [{ partNumber: 1, size: 5 * MB }]);
    expect(remaining.map((p) => p.partNumber)).toEqual([1, 2, 3]);
  });
});

describe('progressFraction', () => {
  it('is 0 with nothing done and 1 when fully done', () => {
    expect(progressFraction(100, [])).toBe(0);
    expect(progressFraction(100, [{ size: 100 }])).toBe(1);
  });
  it('sums partial parts', () => {
    expect(progressFraction(100, [{ size: 25 }, { size: 25 }])).toBe(0.5);
  });
  it('never exceeds 1', () => {
    expect(progressFraction(100, [{ size: 200 }])).toBe(1);
  });
});

describe('backoffDelay', () => {
  it('grows exponentially and is capped, within [0, exp]', () => {
    // rand=1 -> returns the full exp value (base*2^attempt), capped
    expect(backoffDelay(0, { baseMs: 500, rand: () => 1 })).toBe(500);
    expect(backoffDelay(1, { baseMs: 500, rand: () => 1 })).toBe(1000);
    expect(backoffDelay(2, { baseMs: 500, rand: () => 1 })).toBe(2000);
    expect(backoffDelay(10, { baseMs: 500, capMs: 15_000, rand: () => 1 })).toBe(15_000);
  });
  it('applies jitter (rand=0 -> 0)', () => {
    expect(backoffDelay(5, { rand: () => 0 })).toBe(0);
  });
});

describe('fileFingerprint', () => {
  it('is stable and distinguishes files', () => {
    const a = fileFingerprint({ name: 'x.mkv', size: 10, lastModified: 5 });
    expect(a).toBe('x.mkv:10:5');
    expect(a).not.toBe(fileFingerprint({ name: 'x.mkv', size: 11, lastModified: 5 }));
  });
});
