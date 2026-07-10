import type { Response } from 'express';
import { db } from '../db/client';
import { listClaims, releaseStaleClaims, type ShowClaim } from '../db/queries';
import type { AuthUser } from '../middleware/requireAuth';

// A claim frees itself after this long with no heartbeat, so a forgotten tab or
// an abandoned upload self-heals. Long uploads keep heartbeating, so the sweep
// never fires mid-upload.
const STALE_MS = 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

// Public shapes broadcast to clients.
export type OnlineUser = { sub: string; name: string };
export type ClaimView = { showId: string; userSub: string; userName: string; claimedAt: string };
export type Snapshot = { online: OnlineUser[]; claims: ClaimView[] };

type Connection = { id: number; user: AuthUser; res: Response };

/**
 * In-memory registry of live SSE connections. Each connection is one "online"
 * signal; the roster is the set of distinct users currently connected. Also the
 * broadcast bus — any claim change pushes a fresh claims snapshot to everyone.
 * Presence is intentionally ephemeral (a deploy resets it; clients reconnect in
 * ~1s). Durable state lives in the show_claims table, not here.
 */
class PresenceHub {
  private connections = new Map<number, Connection>();
  private nextId = 1;

  add(user: AuthUser, res: Response): number {
    const id = this.nextId++;
    this.connections.set(id, { id, user, res });
    this.broadcastRoster();
    return id;
  }

  remove(id: number): void {
    if (this.connections.delete(id)) this.broadcastRoster();
  }

  online(): OnlineUser[] {
    const bySub = new Map<string, OnlineUser>();
    for (const c of this.connections.values()) {
      bySub.set(c.user.sub, { sub: c.user.sub, name: c.user.name });
    }
    return [...bySub.values()];
  }

  private send(res: Response, event: string, data: unknown): void {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  private broadcast(event: string, data: unknown): void {
    for (const c of this.connections.values()) this.send(c.res, event, data);
  }

  private broadcastRoster(): void {
    this.broadcast('roster', this.online());
  }

  // Re-read claims from the DB and push them to everyone. Called after any
  // claim/heartbeat-driven change and by the stale sweeper.
  async broadcastClaims(): Promise<void> {
    const claims = await listClaims(db);
    this.broadcast('claims', claims.map(toClaimView));
  }

  async snapshot(): Promise<Snapshot> {
    const claims = await listClaims(db);
    return { online: this.online(), claims: claims.map(toClaimView) };
  }

  startSweeper(): void {
    setInterval(() => {
      void releaseStaleClaims(db, STALE_MS).then((freed) => {
        if (freed.length > 0) void this.broadcastClaims();
      }).catch((err) => console.warn('Claim sweep failed:', err));
    }, SWEEP_INTERVAL_MS).unref();
  }
}

function toClaimView(c: ShowClaim): ClaimView {
  return {
    showId: c.show_id,
    userSub: c.user_sub,
    userName: c.user_name,
    claimedAt: new Date(c.claimed_at).toISOString(),
  };
}

export const presenceHub = new PresenceHub();
