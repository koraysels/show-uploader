import { describe, it, expect } from 'vitest';
import { selectablePlatformCount, platformOfLabel } from '../../src/components/platforms';

describe('selectablePlatformCount', () => {
  it('counts both platforms when nothing is published yet', () => {
    expect(selectablePlatformCount([])).toBe(2);
  });

  it('counts one when only YouTube is already linked', () => {
    expect(selectablePlatformCount([{ label: 'YouTube', url: 'https://youtube.com/x' }])).toBe(1);
  });

  it('counts zero when both are already linked', () => {
    expect(
      selectablePlatformCount([
        { label: 'YouTube', url: 'https://youtube.com/x' },
        { label: 'MixCloud', url: 'https://mixcloud.com/x' },
      ])
    ).toBe(0);
  });

  it('ignores a link with a label neither platform uses', () => {
    expect(selectablePlatformCount([{ label: 'SoundCloud', url: 'https://soundcloud.com/x' }])).toBe(2);
  });
});

describe('platformOfLabel', () => {
  it('resolves the canonical labels', () => {
    expect(platformOfLabel('YouTube')).toBe('youtube');
    expect(platformOfLabel('MixCloud')).toBe('mixcloud');
  });

  // Production carries all of these: the labels are hand-typed in the agenda
  // admin. Matching exactly made a published show look unpublished, so the
  // upload form pre-selected the platform and would have published again.
  it('resolves the casings that actually occur in the agenda', () => {
    expect(platformOfLabel('Youtube')).toBe('youtube');
    expect(platformOfLabel('Mixcloud')).toBe('mixcloud');
    expect(platformOfLabel('YOUTUBE')).toBe('youtube');
    expect(platformOfLabel(' youtube ')).toBe('youtube');
  });

  it('ignores labels that name something else', () => {
    expect(platformOfLabel('cs-archive-video')).toBeNull();
    expect(platformOfLabel('Spotify')).toBeNull();
    expect(platformOfLabel('')).toBeNull();
  });
});

describe('selectablePlatformCount with real-world casing', () => {
  it('counts a "Youtube" link as published', () => {
    expect(selectablePlatformCount([{ label: 'Youtube', url: 'https://youtu.be/x' }])).toBe(1);
  });

  it('counts both when the agenda spells neither canonically', () => {
    expect(
      selectablePlatformCount([
        { label: 'Youtube', url: 'https://youtu.be/x' },
        { label: 'Mixcloud', url: 'https://mixcloud.com/x' },
      ])
    ).toBe(0);
  });
});
