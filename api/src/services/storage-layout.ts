/**
 * Where objects live, and how to get the existing ones there.
 *
 * The old layout put everything under `uploads/`: unclaimed drop-folder
 * recordings sat next to finished published masters, indistinguishable by key.
 * That made "how much of this can I delete" unanswerable — which is exactly the
 * question the storage page exists to answer.
 *
 * The split is by lifecycle, not by date. A date hierarchy was considered and
 * rejected: at this object count it lengthens every path and makes browsing
 * worse rather than better.
 */

export const INCOMING_PREFIX = 'incoming';
export const SHOWS_PREFIX = 'shows';

/** Legacy prefixes this layout replaces. */
export const LEGACY_VIDEO_PREFIX = 'uploads';
export const LEGACY_AUDIO_PREFIX = 'archive';

/** Strip directory and extension, keeping the timestamped basename. */
export function baseName(key: string): string {
  const file = key.slice(key.lastIndexOf('/') + 1);
  const dot = file.lastIndexOf('.');
  return dot <= 0 ? file : file.slice(0, dot);
}

function extension(key: string): string {
  const file = key.slice(key.lastIndexOf('/') + 1);
  const dot = file.lastIndexOf('.');
  return dot <= 0 ? '' : file.slice(dot);
}

/** Key for a freshly arrived recording, before anything is published. */
export function incomingKey(filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${INCOMING_PREFIX}/${Date.now()}-${safe}`;
}

/** Folder holding one published show's artefacts. */
export function showFolder(sourceKey: string): string {
  return `${SHOWS_PREFIX}/${baseName(sourceKey)}`;
}

export function showVideoKey(sourceKey: string): string {
  // Idempotent: a key already in the layout would otherwise be nested again.
  if (sourceKey.startsWith(`${SHOWS_PREFIX}/`)) return sourceKey;
  return `${showFolder(sourceKey)}/video${extension(sourceKey) || '.mp4'}`;
}

export function showAudioKey(sourceKey: string): string {
  if (sourceKey.startsWith(`${SHOWS_PREFIX}/`)) {
    return `${sourceKey.slice(0, sourceKey.lastIndexOf('/'))}/audio.m4a`;
  }
  return `${showFolder(sourceKey)}/audio.m4a`;
}

export type MigrationMove = {
  from: string;
  to: string;
  /** Which DB column, if any, has to follow this object. */
  field: 'video_s3_key' | 'audio_s3_key' | 'pending_s3_key' | 'staged_s3_key';
  reason: string;
};

/** Is this key already in the new layout? */
export function isMigrated(key: string): boolean {
  return key.startsWith(`${SHOWS_PREFIX}/`) || key.startsWith(`${INCOMING_PREFIX}/`);
}

export type MigrationInput = {
  /** Published uploads, i.e. those whose archive job finished. */
  published: { videoKey: string; audioKey: string | null }[];
  /** Keys still awaiting publication, from pending_videos / staged_uploads. */
  pendingKeys: string[];
  stagedKeys: string[];
};

/**
 * Work out every object that should move, and where.
 *
 * Pure, so the plan can be shown to the operator before anything is touched —
 * this rewrites live keys, and a preview is the difference between a reversible
 * decision and an irreversible one.
 *
 * Objects already in the right place produce no move, which is what makes
 * re-running the migration a no-op rather than a second round of churn.
 */
export function planMigration(input: MigrationInput): MigrationMove[] {
  const moves: MigrationMove[] = [];
  const seen = new Set<string>();

  const add = (move: MigrationMove) => {
    if (move.from === move.to || seen.has(move.from)) return;
    seen.add(move.from);
    moves.push(move);
  };

  for (const { videoKey, audioKey } of input.published) {
    // Already migrated. Deriving a destination from a key that is already in the
    // new layout would nest it again — shows/x/video.mp4 becomes shows/video/….
    if (!isMigrated(videoKey)) {
      add({
        from: videoKey,
        to: showVideoKey(videoKey),
        field: 'video_s3_key',
        reason: 'published master',
      });
    }
    if (audioKey && !isMigrated(audioKey)) {
      add({
        // The audio's folder has to match its own video, not its own old key —
        // the m4a lives under archive/ and carries no show grouping of its own.
        from: audioKey,
        to: showAudioKey(videoKey),
        field: 'audio_s3_key',
        reason: 'published audio',
      });
    }
  }

  for (const key of input.pendingKeys) {
    if (isMigrated(key)) continue;
    add({
      from: key,
      to: `${INCOMING_PREFIX}/${key.slice(key.lastIndexOf('/') + 1)}`,
      field: 'pending_s3_key',
      reason: 'awaiting publication',
    });
  }

  for (const key of input.stagedKeys) {
    if (isMigrated(key)) continue;
    add({
      from: key,
      to: `${INCOMING_PREFIX}/${key.slice(key.lastIndexOf('/') + 1)}`,
      field: 'staged_s3_key',
      reason: 'uploaded, not yet published',
    });
  }

  return moves;
}
