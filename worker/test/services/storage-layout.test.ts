import { describe, it, expect } from 'vitest';
import { showVideoKey, showAudioKey, showFolder } from '../../src/services/storage-layout';

/**
 * These literals are duplicated in api/test/services/storage-layout.test.ts on
 * purpose. The two packages carry their own copy of the layout rules because
 * there is no runtime import path between them, so pinning the same strings on
 * both sides is what catches the copies drifting apart.
 */
describe('published show layout', () => {
  const REAL = 'incoming/1783776608000-misharog_10.07.2026__coming_soon__2026-07-10_15-52-25.mp4';

  it('groups video and audio in one readable, dated folder', () => {
    expect(showFolder(REAL)).toBe('shows/2026-07-10-misharog');
    expect(showVideoKey(REAL)).toBe('shows/2026-07-10-misharog/video.mp4');
    expect(showAudioKey(REAL)).toBe('shows/2026-07-10-misharog/audio.m4a');
  });

  // The old flat layout is still what pre-migration recordings use.
  it('handles a legacy uploads/ source key', () => {
    expect(showVideoKey(REAL.replace('incoming/', 'uploads/'))).toBe('shows/2026-07-10-misharog/video.mp4');
  });

  // A show billed for the 8th but captured on the 7th files under the 8th.
  it('files under the billed date, not the capture stamp', () => {
    expect(showVideoKey('incoming/1786166988525-palmbomen_ii_8.8.2026__coming_soon__2026-08-07_16-29-47.mp4')).toBe(
      'shows/2026-08-08-palmbomen-ii/video.mp4'
    );
  });

  it('preserves a non-mp4 container', () => {
    expect(showVideoKey(REAL.replace('.mp4', '.mkv'))).toBe('shows/2026-07-10-misharog/video.mkv');
  });

  // Re-archiving a show already in place must not re-derive a nested folder.
  it('is idempotent for a key already in the layout', () => {
    expect(showVideoKey('shows/2026-07-10-misharog/video.mp4')).toBe('shows/2026-07-10-misharog/video.mp4');
    expect(showAudioKey('shows/2026-07-10-misharog/video.mp4')).toBe('shows/2026-07-10-misharog/audio.m4a');
  });
});
