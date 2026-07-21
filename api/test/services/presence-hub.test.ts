import { vi, describe, it, expect, beforeEach } from 'vitest';

// The hub pulls the pg client and claim queries; stub both so importing it never
// touches env/DB. broadcastClaims/snapshot read listClaims, which we drive here.
vi.mock('../../src/db/client', () => ({ db: {} }));

const { listClaims, releaseStaleClaims } = vi.hoisted(() => ({
  listClaims: vi.fn(),
  releaseStaleClaims: vi.fn(),
}));
vi.mock('../../src/db/queries', () => ({ listClaims, releaseStaleClaims }));

import { presenceHub } from '../../src/services/presence-hub';

type Frame = { event: string; data: unknown };

// Fake SSE Response that records every write, parsed back into frames.
function makeRes() {
  const writes: string[] = [];
  const res = { write: (s: string) => (writes.push(s), true) } as any;
  res.frames = (): Frame[] =>
    writes
      .filter((w) => w.startsWith('event:'))
      .map((w) => {
        const event = w.match(/event: (.*)/)![1];
        const data = JSON.parse(w.match(/data: (.*)/)![1]);
        return { event, data };
      });
  res.last = (event: string): unknown => {
    const f = res.frames().filter((x: Frame) => x.event === event);
    return f.length ? f[f.length - 1].data : undefined;
  };
  return res;
}

const alice = { sub: 'u-alice', name: 'Alice' };
const bob = { sub: 'u-bob', name: 'Bob' };

// Drop every connection the hub still holds between tests (no reset API — remove
// by id until the roster is empty).
function drainConnections() {
  for (let id = 0; id < 1000; id++) presenceHub.remove(id);
}

beforeEach(() => {
  drainConnections();
  listClaims.mockReset();
  releaseStaleClaims.mockReset();
});

describe('PresenceHub roster', () => {
  it('adds a connection and broadcasts the roster to it', () => {
    const res = makeRes();
    presenceHub.add(alice, res);
    expect(presenceHub.online()).toEqual([alice]);
    expect(res.last('roster')).toEqual([alice]);
  });

  it('dedupes the roster by user across multiple connections (two tabs = one person)', () => {
    presenceHub.add(alice, makeRes());
    presenceHub.add(alice, makeRes()); // second tab, same user
    presenceHub.add(bob, makeRes());
    const online = presenceHub.online();
    expect(online).toHaveLength(2);
    expect(online.map((u) => u.sub).sort()).toEqual(['u-alice', 'u-bob']);
  });

  it('keeps a user online while any of their connections remain, drops them on the last', () => {
    const id1 = presenceHub.add(alice, makeRes());
    const id2 = presenceHub.add(alice, makeRes());
    presenceHub.remove(id1);
    expect(presenceHub.online()).toEqual([alice]); // still has the 2nd tab
    presenceHub.remove(id2);
    expect(presenceHub.online()).toEqual([]);
  });

  it('re-broadcasts the roster to survivors when a connection leaves', () => {
    const survivor = makeRes();
    presenceHub.add(alice, survivor);
    const id = presenceHub.add(bob, makeRes());
    presenceHub.remove(id);
    expect(survivor.last('roster')).toEqual([alice]);
  });
});

describe('PresenceHub claims broadcast', () => {
  const row = {
    show_id: 'show1',
    user_sub: 'u-bob',
    user_name: 'Bob',
    claimed_at: new Date('2026-07-10T12:00:00Z'),
    last_seen_at: new Date('2026-07-10T12:01:00Z'),
  };

  it('maps DB rows to ClaimView and pushes them to every connection', async () => {
    listClaims.mockResolvedValue([row]);
    const a = makeRes();
    const b = makeRes();
    presenceHub.add(alice, a);
    presenceHub.add(bob, b);
    await presenceHub.broadcastClaims();
    const expected = [
      { showId: 'show1', userSub: 'u-bob', userName: 'Bob', claimedAt: '2026-07-10T12:00:00.000Z' },
    ];
    expect(a.last('claims')).toEqual(expected);
    expect(b.last('claims')).toEqual(expected);
  });

  it('snapshot combines online roster and claims', async () => {
    listClaims.mockResolvedValue([row]);
    presenceHub.add(alice, makeRes());
    const snap = await presenceHub.snapshot();
    expect(snap.online).toEqual([alice]);
    expect(snap.claims).toEqual([
      { showId: 'show1', userSub: 'u-bob', userName: 'Bob', claimedAt: '2026-07-10T12:00:00.000Z' },
    ]);
  });
});
