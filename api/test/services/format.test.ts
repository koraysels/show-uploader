import { describe, it, expect } from 'vitest';
import { baseTitle, appendHashtags, tagsToHashtags } from '../../src/services/format';

describe('baseTitle — plain title for PocketBase, no convention suffix', () => {
  it('strips a "<date> @ coming soon" suffix as one unit', () => {
    expect(baseTitle('Misharog 10.07.2026 @ coming soon')).toBe('Misharog');
  });

  it('strips "@ coming soon" even without a date', () => {
    expect(baseTitle('Some Show @ coming soon')).toBe('Some Show');
  });

  it('keeps a bare trailing date that is part of the real name', () => {
    expect(baseTitle('New Year 31.12.2025')).toBe('New Year 31.12.2025');
  });

  it('leaves a plain title untouched', () => {
    expect(baseTitle('RADIO DADA')).toBe('RADIO DADA');
  });

  it('is idempotent (no double-strip)', () => {
    expect(baseTitle(baseTitle('X 01.02.2026 @ coming soon'))).toBe('X');
  });
});

describe('tags → hashtags', () => {
  it('renders tags as hashtags, stripping spaces/punctuation', () => {
    expect(tagsToHashtags(['deep house', 'techno'])).toBe('#deephouse #techno');
  });

  it('drops single-char/empty tags and caps at 10', () => {
    const many = ['!', ...Array.from({ length: 15 }, (_, i) => `tag${i}`)];
    const out = tagsToHashtags(many);
    expect(out.startsWith('#tag0')).toBe(true);
    expect(out.split(' ')).toHaveLength(10);
  });

  it('appends hashtags to a description', () => {
    expect(appendHashtags('hello', ['house'])).toBe('hello\n\n#house');
  });

  it('returns the description unchanged when there are no usable tags', () => {
    expect(appendHashtags('hello', [])).toBe('hello');
    expect(appendHashtags('hello', ['!'])).toBe('hello');
  });
});
