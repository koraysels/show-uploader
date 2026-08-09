import { describe, it, expect } from 'vitest';
import { showVideoKey, showAudioKey, showFolder } from '../../src/services/storage-layout';

/**
 * These literals are duplicated in api/test/services/storage-layout.test.ts on
 * purpose. The two packages carry their own copy of the layout rules because
 * there is no runtime import path between them, so pinning the same strings on
 * both sides is what catches the copies drifting apart.
 */
describe('published show layout', () => {
  it('groups video and audio in the show folder', () => {
    expect(showFolder('incoming/1785-rec.mp4')).toBe('shows/1785-rec');
    expect(showVideoKey('incoming/1785-rec.mp4')).toBe('shows/1785-rec/video.mp4');
    expect(showAudioKey('incoming/1785-rec.mp4')).toBe('shows/1785-rec/audio.m4a');
  });

  // The old flat layout is still what most existing recordings use.
  it('handles a legacy uploads/ source key', () => {
    expect(showVideoKey('uploads/1785-rec.mp4')).toBe('shows/1785-rec/video.mp4');
    expect(showAudioKey('uploads/1785-rec.mp4')).toBe('shows/1785-rec/audio.m4a');
  });

  it('keeps a name containing dots intact', () => {
    expect(showVideoKey('incoming/1785-show 8.8.2026 coming soon.mp4')).toBe(
      'shows/1785-show 8.8.2026 coming soon/video.mp4'
    );
  });

  it('preserves a non-mp4 container', () => {
    expect(showVideoKey('incoming/1785-rec.mkv')).toBe('shows/1785-rec/video.mkv');
  });
});
