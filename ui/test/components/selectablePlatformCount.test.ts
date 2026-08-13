import { describe, it, expect } from 'vitest';
import { selectablePlatformCount } from '../../src/components/PlatformSelector';

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
