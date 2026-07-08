import { vi, describe, it, expect } from 'vitest';

// live-guard imports ../env, which parses process.env at load. Mock it so the
// pure detector tests don't require the full runtime env.
vi.mock('../env', () => ({
  env: { POCKETBASE_URL: 'https://pb.test', LIVE_GUARD_BUFFER_MIN: 15 },
}));

import { evaluateLive, type Episode } from './live-guard';

// Base window: 12:00–13:00 UTC on a fixed day. Buffer 15m in all tests.
const BUF = 15;
const ep = (over: Partial<Episode> = {}): Episode => ({
  status: 'scheduled',
  startTime: '2026-07-08 12:00:00.000Z',
  endTime: '2026-07-08 13:00:00.000Z',
  ...over,
});
const at = (iso: string) => new Date(iso);

describe('evaluateLive', () => {
  it('not live when there are no episodes', () => {
    expect(evaluateLive([], at('2026-07-08T12:30:00Z'), BUF).isLive).toBe(false);
  });

  it('not live for a completed episode even inside its window', () => {
    const r = evaluateLive([ep({ status: 'completed' })], at('2026-07-08T12:30:00Z'), BUF);
    expect(r.isLive).toBe(false);
  });

  it('not live for a draft episode even inside its window', () => {
    const r = evaluateLive([ep({ status: 'draft' })], at('2026-07-08T12:30:00Z'), BUF);
    expect(r.isLive).toBe(false);
  });

  it('live for an episode with status=live inside its window', () => {
    const r = evaluateLive([ep({ status: 'live' })], at('2026-07-08T12:30:00Z'), BUF);
    expect(r.isLive).toBe(true);
  });

  it('not live when livestream_override=skip, even if scheduled and in window', () => {
    const r = evaluateLive(
      [ep({ livestream_override: 'skip' })],
      at('2026-07-08T12:30:00Z'),
      BUF
    );
    expect(r.isLive).toBe(false);
  });

  it('live for a scheduled episode inside its window', () => {
    const r = evaluateLive([ep()], at('2026-07-08T12:30:00Z'), BUF);
    expect(r.isLive).toBe(true);
    // resumeAt = endTime + buffer = 13:15
    expect(r.resumeAt?.toISOString()).toBe('2026-07-08T13:15:00.000Z');
  });

  it('live inside the buffer before start', () => {
    // start 12:00, buffer 15 -> live from 11:45
    expect(evaluateLive([ep()], at('2026-07-08T11:50:00Z'), BUF).isLive).toBe(true);
  });

  it('live inside the buffer after end', () => {
    // end 13:00, buffer 15 -> live until 13:15
    expect(evaluateLive([ep()], at('2026-07-08T13:10:00Z'), BUF).isLive).toBe(true);
  });

  it('not live before the buffer window', () => {
    expect(evaluateLive([ep()], at('2026-07-08T11:40:00Z'), BUF).isLive).toBe(false);
  });

  it('not live after the buffer window', () => {
    expect(evaluateLive([ep()], at('2026-07-08T13:20:00Z'), BUF).isLive).toBe(false);
  });

  it('is inclusive at the exact buffer boundaries', () => {
    expect(evaluateLive([ep()], at('2026-07-08T11:45:00Z'), BUF).isLive).toBe(true);
    expect(evaluateLive([ep()], at('2026-07-08T13:15:00Z'), BUF).isLive).toBe(true);
  });

  it('resumeAt is the latest end+buffer across overlapping live episodes', () => {
    const a = ep({ endTime: '2026-07-08 13:00:00.000Z' });
    const b = ep({ startTime: '2026-07-08 12:30:00.000Z', endTime: '2026-07-08 14:00:00.000Z' });
    const r = evaluateLive([a, b], at('2026-07-08T12:45:00Z'), BUF);
    expect(r.isLive).toBe(true);
    expect(r.resumeAt?.toISOString()).toBe('2026-07-08T14:15:00.000Z');
  });

  it('resumeAt is null when not live', () => {
    expect(evaluateLive([ep()], at('2026-07-08T20:00:00Z'), BUF).resumeAt).toBeNull();
  });
});
