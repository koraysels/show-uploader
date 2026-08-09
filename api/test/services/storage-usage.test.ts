import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('../../src/env', () => ({ env: { S3_BUCKET: 'test-bucket' } }));
vi.mock('../../src/services/s3', () => ({ s3: { send: vi.fn() } }));

import { prefixOf, diskUsage, tempUsage } from '../../src/services/storage-usage';

describe('prefixOf', () => {
  it('groups by the top-level folder', () => {
    expect(prefixOf('uploads/1785-rec.mkv')).toBe('uploads');
    expect(prefixOf('archive/2026/rec.m4a')).toBe('archive');
  });

  it('labels keys with no folder rather than returning an empty string', () => {
    expect(prefixOf('stray-file.mkv')).toBe('(root)');
  });
});

describe('diskUsage', () => {
  it('reports totals for a real mount', () => {
    const u = diskUsage(os.tmpdir());
    expect(u).not.toBeNull();
    expect(u!.totalBytes).toBeGreaterThan(0);
    expect(u!.usedBytes).toBe(u!.totalBytes - u!.freeBytes);
  });

  // The storage disk is bind-mounted purely for this readout, so a deployment
  // without that mount has to degrade rather than break the page.
  it('returns null for a path that is not mounted', () => {
    expect(diskUsage('/definitely/not/a/real/mount')).toBeNull();
  });
});

describe('tempUsage', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'temp-usage-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('sums per-job directories and counts them', () => {
    fs.mkdirSync(path.join(root, 'job-a'));
    fs.writeFileSync(path.join(root, 'job-a', 'input.mkv'), Buffer.alloc(1500));
    fs.mkdirSync(path.join(root, 'job-b'));
    fs.writeFileSync(path.join(root, 'job-b', 'input.mkv'), Buffer.alloc(500));

    const u = tempUsage(root);

    expect(u.jobs).toBe(2);
    expect(u.bytes).toBe(2000);
  });

  // A large oldest-age is the signal that something was orphaned and the sweeper
  // has not reclaimed it — the exact condition that used to fill the disk unseen.
  it('reports the age of the oldest job directory', () => {
    const dir = path.join(root, 'stale');
    fs.mkdirSync(dir);
    const past = Date.now() - 3 * 60 * 60 * 1000;
    fs.utimesSync(dir, new Date(past), new Date(past));

    const u = tempUsage(root);

    expect(u.oldestAgeMs).toBeGreaterThan(2.9 * 60 * 60 * 1000);
  });

  it('ignores loose files that are not job directories', () => {
    fs.writeFileSync(path.join(root, 'stray.txt'), 'x');
    expect(tempUsage(root)).toMatchObject({ jobs: 0, bytes: 0 });
  });

  it('reports empty rather than throwing when the root does not exist', () => {
    expect(tempUsage('/definitely/not/here')).toEqual({
      path: '/definitely/not/here',
      bytes: 0,
      jobs: 0,
      oldestAgeMs: null,
    });
  });
});
