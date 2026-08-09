/**
 * Where a published show's artefacts live.
 *
 * MUST agree with api/src/services/storage-layout.ts, which owns the same rules
 * for the migration of existing objects. There is no runtime import path between
 * the packages, so the two copies are kept honest by tests on both sides pinning
 * the same literal keys — drift breaks one of them.
 */

import { showSlug } from './show-slug';

export const SHOWS_PREFIX = 'shows';

function baseName(key: string): string {
  const file = key.slice(key.lastIndexOf('/') + 1);
  const dot = file.lastIndexOf('.');
  return dot <= 0 ? file : file.slice(0, dot);
}

function extension(key: string): string {
  const file = key.slice(key.lastIndexOf('/') + 1);
  const dot = file.lastIndexOf('.');
  return dot <= 0 ? '' : file.slice(dot);
}


export function showFolder(sourceKey: string): string {
  return `${SHOWS_PREFIX}/${showSlug(sourceName(sourceKey))}`;
}

/**
 * The name a folder is derived from: the folder segment for a key already under
 * shows/ (the file is always video/audio, which carries no identity), otherwise
 * the recording's own basename.
 */
function sourceName(key: string): string {
  if (key.startsWith(`${SHOWS_PREFIX}/`)) {
    const rest = key.slice(SHOWS_PREFIX.length + 1);
    const slash = rest.indexOf('/');
    return slash === -1 ? baseName(rest) : rest.slice(0, slash);
  }
  return baseName(key);
}

export function showVideoKey(sourceKey: string): string {
  return `${showFolder(sourceKey)}/video${extension(sourceKey) || '.mp4'}`;
}

export function showAudioKey(sourceKey: string): string {
  return `${showFolder(sourceKey)}/audio.m4a`;
}
