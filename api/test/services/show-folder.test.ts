import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../src/env', () => ({ env: { S3_BUCKET: 'b' } }));
// The convention guess misses for every case here — that's the point of them.
vi.mock('../../src/services/s3', () => ({ objectInfo: vi.fn(async () => ({ exists: false, size: null })) }));
vi.mock('../../src/services/storage-browse', () => ({ browse: vi.fn() }));

import { browse } from '../../src/services/storage-browse';
import { objectInfo } from '../../src/services/s3';
import { findShowFolder } from '../../src/services/show-folder';

const folders = (...names: string[]) =>
  ({ folders: names.map((n) => ({ key: `shows/${n}/`, name: n, bytes: null, modified: null })), files: [] }) as any;

describe('findShowFolder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(objectInfo).mockResolvedValue({ exists: false, size: null });
  });

  it('takes the conventional name when it exists, without listing', async () => {
    vi.mocked(objectInfo).mockResolvedValue({ exists: true, size: 1 });

    await expect(findShowFolder({ date: '2026-07-10', title: 'Misharog' })).resolves.toBe(
      'shows/2026-07-10-misharog/'
    );
    expect(vi.mocked(browse)).not.toHaveBeenCalled();
  });

  // The real case: three shows share a date and the folder is named from the
  // recording's filename, not the title.
  it('picks the folder sharing a word with the title', async () => {
    vi.mocked(browse).mockResolvedValue(
      folders('2026-07-17-mills', '2026-07-17-oko-stellar-invites-kin-soul', '2026-07-17-sawt')
    );

    await expect(findShowFolder({ date: '2026-07-17', title: 'Into the ether (SAWT)' })).resolves.toBe(
      'shows/2026-07-17-sawt/'
    );
    await expect(findShowFolder({ date: '2026-07-17', title: 'Mills Boogie' })).resolves.toBe(
      'shows/2026-07-17-mills/'
    );
  });

  // A show billed for one date is often recorded the evening before, so its
  // folder can carry either date.
  it('looks a day either side of the billed date', async () => {
    vi.mocked(browse).mockResolvedValue(
      folders('2026-08-08-mogus-b2b-boemtjak', '2026-08-08-palmbomen-ii', '2026-08-08-renni')
    );

    await expect(findShowFolder({ date: '2026-08-07', title: 'Palmbomen II' })).resolves.toBe(
      'shows/2026-08-08-palmbomen-ii/'
    );
    await expect(findShowFolder({ date: '2026-08-07', title: 'Renni' })).resolves.toBe(
      'shows/2026-08-08-renni/'
    );
  });

  // Partial words still count: the folder spells it "boemtjak", the agenda
  // "Boemstjak".
  it('matches on a shared prefix, not an exact word', async () => {
    vi.mocked(browse).mockResolvedValue(folders('2026-08-08-mogus-b2b-boemtjak', '2026-08-08-renni'));

    await expect(findShowFolder({ date: '2026-08-07', title: 'Mogus b2b Boemstjak' })).resolves.toBe(
      'shows/2026-08-08-mogus-b2b-boemtjak/'
    );
  });

  it('refuses when nothing shares a word with the title', async () => {
    vi.mocked(browse).mockResolvedValue(folders('2026-07-31-leena', '2026-07-31-radio-z-onderdak'));

    await expect(findShowFolder({ date: '2026-07-31', title: 'Lina Ejdaa' })).resolves.toBeNull();
  });

  // Better no link than another show's recording.
  it('refuses a tie rather than guessing', async () => {
    vi.mocked(browse).mockResolvedValue(folders('2026-07-31-yalla', '2026-07-31-yalla-2'));

    await expect(
      findShowFolder({ date: '2026-07-31', title: 'Yalla Soundsystem' })
    ).resolves.toBeNull();
  });

  it('refuses when no folder is anywhere near the date', async () => {
    vi.mocked(browse).mockResolvedValue(folders('2026-01-01-something'));

    await expect(findShowFolder({ date: '2026-07-31', title: 'Whatever' })).resolves.toBeNull();
  });
});
