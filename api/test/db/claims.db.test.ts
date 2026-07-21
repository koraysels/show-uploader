import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import postgres from 'postgres';
import { runMigrations } from '../../src/db/migrate';
import {
  upsertClaim,
  heartbeatClaim,
  releaseClaim,
  releaseClaimForShow,
  releaseStaleClaims,
  listClaims,
} from '../../src/db/queries';

// Real claim-lifecycle coverage against Postgres — the steal / wrong-owner /
// sweep behaviour lives in SQL, so it can only be tested against a live DB.
// Point TEST_DATABASE_URI at a throwaway database to run these, e.g.:
//   docker run -d --rm -p 5499:5432 -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=su postgres:16-alpine
//   TEST_DATABASE_URI=postgres://postgres:pw@localhost:5499/su pnpm --filter @show-uploader/api test
// Without it, the suite is skipped (so `npm test` stays green with no DB).
const URI = process.env.TEST_DATABASE_URI;

describe.skipIf(!URI)('show_claims lifecycle (DB)', () => {
  let db: postgres.Sql;

  beforeAll(async () => {
    db = postgres(URI!, { ssl: URI!.includes('localhost') ? false : 'require', max: 2 });
    await runMigrations(db);
  });

  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db`TRUNCATE show_claims`;
  });

  const name = (rows: { user_name: string }[]) => rows.map((r) => r.user_name).sort();

  it('claims an unheld show for a user', async () => {
    await upsertClaim(db, 'show1', 'u-alice', 'Alice');
    const rows = await listClaims(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ show_id: 'show1', user_sub: 'u-alice', user_name: 'Alice' });
  });

  it('a second user steals the claim (soft, overwrites) and resets claimed_at', async () => {
    const first = await upsertClaim(db, 'show1', 'u-alice', 'Alice');
    // Small gap so a reset claimed_at is observably newer.
    await new Promise((r) => setTimeout(r, 10));
    const stolen = await upsertClaim(db, 'show1', 'u-bob', 'Bob');
    const rows = await listClaims(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_sub).toBe('u-bob');
    expect(new Date(stolen.claimed_at).getTime()).toBeGreaterThan(new Date(first.claimed_at).getTime());
  });

  it('re-claiming as the same owner keeps the original claimed_at', async () => {
    const first = await upsertClaim(db, 'show1', 'u-alice', 'Alice');
    await new Promise((r) => setTimeout(r, 10));
    const again = await upsertClaim(db, 'show1', 'u-alice', 'Alice');
    expect(new Date(again.claimed_at).getTime()).toBe(new Date(first.claimed_at).getTime());
  });

  it('heartbeat from the wrong owner is a no-op; the real owner bumps last_seen', async () => {
    const held = await upsertClaim(db, 'show1', 'u-bob', 'Bob');
    const before = new Date(held.last_seen_at).getTime();
    await new Promise((r) => setTimeout(r, 10));

    await heartbeatClaim(db, 'show1', 'u-alice'); // not the owner
    let [row] = await listClaims(db);
    expect(new Date(row.last_seen_at).getTime()).toBe(before);

    await heartbeatClaim(db, 'show1', 'u-bob'); // owner
    [row] = await listClaims(db);
    expect(new Date(row.last_seen_at).getTime()).toBeGreaterThan(before);
  });

  it('release only removes the claim for its owner', async () => {
    await upsertClaim(db, 'show1', 'u-bob', 'Bob');
    await releaseClaim(db, 'show1', 'u-alice'); // wrong owner
    expect(name(await listClaims(db))).toEqual(['Bob']);
    await releaseClaim(db, 'show1', 'u-bob'); // owner
    expect(await listClaims(db)).toHaveLength(0);
  });

  it('releaseClaimForShow drops the claim regardless of owner (publish path)', async () => {
    await upsertClaim(db, 'show1', 'u-bob', 'Bob');
    await releaseClaimForShow(db, 'show1');
    expect(await listClaims(db)).toHaveLength(0);
  });

  it('stale sweep frees only claims past the idle cutoff, and returns their ids', async () => {
    await upsertClaim(db, 'fresh', 'u-alice', 'Alice');
    await upsertClaim(db, 'stale', 'u-bob', 'Bob');
    // Age the stale one well past any cutoff.
    await db`UPDATE show_claims SET last_seen_at = NOW() - INTERVAL '2 hours' WHERE show_id = 'stale'`;

    const freed = await releaseStaleClaims(db, 30 * 60 * 1000); // 30m idle
    expect(freed.map((f) => f.show_id)).toEqual(['stale']);
    expect(name(await listClaims(db))).toEqual(['Alice']); // fresh survives
  });

  it('stale sweep frees nothing when all claims are within the window', async () => {
    await upsertClaim(db, 'show1', 'u-alice', 'Alice');
    const freed = await releaseStaleClaims(db, 30 * 60 * 1000);
    expect(freed).toHaveLength(0);
    expect(await listClaims(db)).toHaveLength(1);
  });
});
