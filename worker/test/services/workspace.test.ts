import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// TEMP_ROOT is read at import time, so it has to be set before the module loads.
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-test-'));
process.env.WORKER_TEMP_ROOT = ROOT;

const { createWorkspace, sweepWorkspaces, directorySize, TEMP_ROOT } = await import('../../src/services/workspace');

const write = (p: string, bytes: number) => fs.writeFileSync(p, Buffer.alloc(bytes));

describe('workspace', () => {
  beforeEach(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(ROOT, { recursive: true });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('uses the configured root', () => {
    expect(TEMP_ROOT).toBe(ROOT);
  });

  it('gives each job its own directory', () => {
    const a = createWorkspace('job-a');
    const b = createWorkspace('job-b');
    write(a.path('input.mkv'), 10);
    write(b.path('input.mkv'), 10);

    expect(fs.existsSync(a.path('input.mkv'))).toBe(true);
    expect(fs.existsSync(b.path('input.mkv'))).toBe(true);
    expect(a.path('input.mkv')).not.toBe(b.path('input.mkv'));
  });

  // The whole point: one recursive remove, so cleanup cannot drift out of sync
  // with whatever files the job happened to write.
  it('removes everything the job wrote, named or not', () => {
    const ws = createWorkspace('job-c');
    write(ws.path('input.mkv'), 10);
    write(ws.path('unexpected-leftover.tmp'), 10);

    ws.cleanup();

    expect(fs.existsSync(path.dirname(ws.path('x')))).toBe(false);
  });

  it('is safe to clean up twice', () => {
    const ws = createWorkspace('job-d');
    ws.cleanup();
    expect(() => ws.cleanup()).not.toThrow();
  });

  // A job id derived from an S3 key must not escape the root.
  it('never lets an id escape the temp root', () => {
    const ws = createWorkspace('../../etc/evil');
    expect(ws.path('f').startsWith(ROOT + path.sep)).toBe(true);
  });

  it('handles an id that sanitises to nothing', () => {
    const ws = createWorkspace('///');
    expect(ws.path('f').startsWith(ROOT + path.sep)).toBe(true);
  });

  describe('sweepWorkspaces', () => {
    it('removes directories past the age cutoff and reports what it freed', () => {
      const old = createWorkspace('stale');
      write(old.path('big.mkv'), 2048);
      const dir = path.join(ROOT, 'stale');
      const past = Date.now() - 10 * 60 * 60 * 1000;
      fs.utimesSync(dir, new Date(past), new Date(past));

      const res = sweepWorkspaces(6 * 60 * 60 * 1000);

      expect(res.removed).toBe(1);
      expect(res.bytes).toBeGreaterThanOrEqual(2048);
      expect(fs.existsSync(dir)).toBe(false);
    });

    // The cutoff is the only thing stopping a restart from deleting the work of
    // a job that is running right now.
    it('leaves a fresh directory alone', () => {
      const live = createWorkspace('running');
      write(live.path('input.mkv'), 10);

      const res = sweepWorkspaces(6 * 60 * 60 * 1000);

      expect(res.removed).toBe(0);
      expect(fs.existsSync(live.path('input.mkv'))).toBe(true);
    });

    it('returns zero when the root does not exist yet', () => {
      fs.rmSync(ROOT, { recursive: true, force: true });
      expect(sweepWorkspaces(1000)).toEqual({ removed: 0, bytes: 0 });
    });
  });

  describe('directorySize', () => {
    it('sums nested files', () => {
      const ws = createWorkspace('sized');
      write(ws.path('a.bin'), 1000);
      fs.mkdirSync(ws.path('nested'));
      write(ws.path('nested/b.bin'), 500);

      expect(directorySize(path.join(ROOT, 'sized'))).toBe(1500);
    });

    it('returns 0 for a missing directory rather than throwing', () => {
      expect(directorySize(path.join(ROOT, 'nope'))).toBe(0);
    });
  });
});
