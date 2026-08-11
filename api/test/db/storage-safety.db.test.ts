import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import postgres from 'postgres';
import { runMigrations } from '../../src/db/migrate';
import { isKeyReferenced } from '../../src/db/queries';

// isKeyReferenced is the entire safety guard behind the storage browser's
// delete button — it decides whether an operator can destroy a file just by
// browsing to it. That decision is a multi-table EXISTS query, so — like
// show_claims — it can only be proven against real Postgres.
//
//   docker run -d --rm -p 5499:5432 -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=su postgres:16-alpine
//   TEST_DATABASE_URI=postgres://postgres:pw@localhost:5499/su pnpm --filter @show-uploader/api test
const URI = process.env.TEST_DATABASE_URI;

describe.skipIf(!URI)('isKeyReferenced (DB)', () => {
  let db: postgres.Sql;

  beforeAll(async () => {
    db = postgres(URI!, { ssl: URI!.includes('localhost') ? false : 'require', max: 2 });
    await runMigrations(db);
  });

  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db`TRUNCATE show_uploads, staged_uploads, pending_videos CASCADE`;
  });

  it('is false for a key nothing points at', async () => {
    expect(await isKeyReferenced(db, 'incoming/orphan.mkv')).toBe(false);
  });

  it('catches every show_uploads column that can hold a key', async () => {
    // video_s3_key is NOT NULL, so every row needs some value there — a
    // placeholder distinct from whichever key the case under test uses.
    const placeholder = 'incoming/placeholder.mkv';

    const columns = ['video_s3_key', 'audio_s3_key', 'archive_s3_key', 'jingle_s3_key'] as const;
    for (const column of columns) {
      await db`TRUNCATE show_uploads CASCADE`;
      const key = `shows/x/${column}.mp4`;
      const video = column === 'video_s3_key' ? key : placeholder;
      const audio = column === 'audio_s3_key' ? key : null;
      const archive = column === 'archive_s3_key' ? key : null;
      const jingle = column === 'jingle_s3_key' ? key : null;

      await db`
        INSERT INTO show_uploads (show_id, title, video_s3_key, audio_s3_key, archive_s3_key, jingle_s3_key)
        VALUES ('show-1', 't', ${video}, ${audio}, ${archive}, ${jingle})
      `;
      expect(await isKeyReferenced(db, key), `column ${column}`).toBe(true);
    }
  });

  it('is true for a staged (not-yet-published) pick', async () => {
    await db`INSERT INTO staged_uploads (show_id, s3_key, filename) VALUES ('show-1', 'incoming/staged.mkv', 'f.mkv')`;
    expect(await isKeyReferenced(db, 'incoming/staged.mkv')).toBe(true);
  });

  // Deliberately checked regardless of claimed status — see isKeyReferenced's
  // comment: even a claimed row still exists and could still be read.
  it('is true for a pending drop-folder recording, claimed or not', async () => {
    await db`INSERT INTO pending_videos (s3_key, filename, size_bytes, claimed) VALUES ('incoming/pending.mkv', 'f.mkv', 10, true)`;
    expect(await isKeyReferenced(db, 'incoming/pending.mkv')).toBe(true);
  });

  it('does not false-positive on an unrelated key', async () => {
    await db`INSERT INTO show_uploads (show_id, title, video_s3_key) VALUES ('show-1', 't', 'shows/other/video.mp4')`;
    expect(await isKeyReferenced(db, 'incoming/unrelated.mkv')).toBe(false);
  });
});
