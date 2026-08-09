/**
 * Where a published show's artefacts live.
 *
 * MUST agree with api/src/services/storage-layout.ts, which owns the same rules
 * for the migration of existing objects. There is no runtime import path between
 * the packages, so the two copies are kept honest by tests on both sides pinning
 * the same literal keys — drift breaks one of them.
 */

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


/**
 * Already in the show layout? Deriving a destination from such a key would nest
 * it again — shows/x/video.mp4 would become shows/video/video.mp4 — so both
 * helpers below return it untouched. This is what makes re-archiving safe.
 */
function alreadyPlaced(key: string): boolean {
  return key.startsWith(`${SHOWS_PREFIX}/`);
}

export function showFolder(sourceKey: string): string {
  return `${SHOWS_PREFIX}/${baseName(sourceKey)}`;
}

export function showVideoKey(sourceKey: string): string {
  if (alreadyPlaced(sourceKey)) return sourceKey;
  return `${showFolder(sourceKey)}/video${extension(sourceKey) || '.mp4'}`;
}

export function showAudioKey(sourceKey: string): string {
  if (alreadyPlaced(sourceKey)) return `${sourceKey.slice(0, sourceKey.lastIndexOf('/'))}/audio.m4a`;
  return `${showFolder(sourceKey)}/audio.m4a`;
}
