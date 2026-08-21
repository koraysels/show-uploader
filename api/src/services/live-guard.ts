import { env } from '../env';
import type { EpisodesRecord } from '../pocketbase-types';

// The fields the guard reads, narrowed from the generated PocketBase record type
// (regenerate with `pnpm run typegen`).
export type Episode = Pick<
  EpisodesRecord,
  'status' | 'startTime' | 'endTime' | 'livestream_override'
> &
  Partial<Pick<EpisodesRecord, 'id' | 'title'>>;

// Bad schedule data is the guard's real failure mode: on 2026-08-21 a single
// episode left at status=live with an endTime five days out deferred every
// upload for two days, and nothing in the pipeline could override it. Two
// limits keep one bad record from parking the queue.
export type LiveGuardLimits = {
  // An air window longer than this is data entry gone wrong, not a broadcast —
  // ignore the episode rather than let it hold the air.
  maxEpisodeHours?: number;
  // Hard ceiling on how far ahead work is pushed, whatever the schedule says.
  maxDeferMin?: number;
};

export const DEFAULT_MAX_EPISODE_HOURS = 12;
export const DEFAULT_MAX_DEFER_MIN = 240;

// A show occupies the air when it's about to run (`scheduled`) or on air (`live`).
// draft/completed/cancelled never block.
const AIRING_STATUSES = new Set(['scheduled', 'live']);

// PocketBase serialises datetimes as "YYYY-MM-DD HH:MM:SS.sssZ" (space, not T).
function parseTs(ts: string): number {
  return new Date(ts.replace(' ', 'T')).getTime();
}

/**
 * Pure live-window check. A show is live when a `scheduled` episode's
 * [start - buffer, end + buffer] window contains `now`. resumeAt is the latest
 * end + buffer across all currently-live episodes (so overlapping / back-to-back
 * shows all clear before deferred work runs), clamped to now + maxDeferMin.
 * Unparseable, inverted, and implausibly long windows are ignored.
 */
export function evaluateLive(
  episodes: Episode[],
  now: Date,
  bufferMin: number,
  limits: LiveGuardLimits = {}
): { isLive: boolean; resumeAt: Date | null } {
  const maxEpisodeMs = (limits.maxEpisodeHours ?? DEFAULT_MAX_EPISODE_HOURS) * 3_600_000;
  const maxDeferMs = (limits.maxDeferMin ?? DEFAULT_MAX_DEFER_MIN) * 60_000;
  const bufMs = bufferMin * 60_000;
  const t = now.getTime();
  let resume: number | null = null;

  for (const ep of episodes) {
    if (!AIRING_STATUSES.has(ep.status)) continue;
    // An episode explicitly flagged not to stream doesn't occupy the air.
    if (ep.livestream_override === 'skip') continue;
    const start = parseTs(ep.startTime);
    const end = parseTs(ep.endTime);
    // A record the guard can't read is a record it must not act on.
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      console.warn(`Live-guard: ignoring episode with unusable window ${describe(ep)}`);
      continue;
    }
    if (end - start > maxEpisodeMs) {
      console.warn(
        `Live-guard: ignoring implausible ${((end - start) / 3_600_000).toFixed(1)}h window ${describe(ep)}`
      );
      continue;
    }
    if (t >= start - bufMs && t <= end + bufMs) {
      const r = end + bufMs;
      if (resume === null || r > resume) resume = r;
    }
  }

  if (resume === null) return { isLive: false, resumeAt: null };
  // Never push work further out than the ceiling, however long the air window.
  return { isLive: true, resumeAt: new Date(Math.min(resume, t + maxDeferMs)) };
}

// Identify a rejected episode well enough to fix it in PocketBase.
function describe(ep: Episode): string {
  return `${ep.id ?? '?'} "${ep.title ?? '?'}" (${ep.startTime} → ${ep.endTime})`;
}

// Format a Date the way PocketBase expects in a filter expression.
function pbDate(d: Date): string {
  return d.toISOString().replace('T', ' ');
}

/**
 * Fetch the schedule from PocketBase and evaluate whether a show is live at `now`.
 * Fails open: any fetch/parse error logs a warning and returns not-live, so an
 * upload is never blocked by a PocketBase outage.
 */
export async function getLiveState(
  now: Date
): Promise<{ isLive: boolean; resumeAt: Date | null }> {
  const bufMs = env.LIVE_GUARD_BUFFER_MIN * 60_000;
  const lower = pbDate(new Date(now.getTime() - bufMs));
  const upper = pbDate(new Date(now.getTime() + bufMs));
  const filter =
    `((status='scheduled' || status='live') && livestream_override!='skip'` +
    ` && endTime>='${lower}' && startTime<='${upper}')`;
  const url =
    `${env.POCKETBASE_INTERNAL_URL ?? env.POCKETBASE_URL}/api/collections/episodes/records` +
    `?perPage=200&fields=id,title,status,startTime,endTime,livestream_override&filter=${encodeURIComponent(filter)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`PocketBase ${res.status}`);
    const body = (await res.json()) as { items: Episode[] };
    return evaluateLive(body.items ?? [], now, env.LIVE_GUARD_BUFFER_MIN, {
      maxEpisodeHours: env.LIVE_GUARD_MAX_EPISODE_HOURS,
      maxDeferMin: env.LIVE_GUARD_MAX_DEFER_MIN,
    });
  } catch (err) {
    console.warn(`Live-guard: PocketBase check failed, enqueuing without delay: ${String(err)}`);
    return { isLive: false, resumeAt: null };
  }
}
