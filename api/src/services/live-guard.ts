import { env } from '../env';
import type { EpisodesRecord } from '../pocketbase-types';

// The fields the guard reads, narrowed from the generated PocketBase record type
// (regenerate with `npm run typegen`).
export type Episode = Pick<
  EpisodesRecord,
  'status' | 'startTime' | 'endTime' | 'livestream_override'
>;

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
 * shows all clear before deferred work runs).
 */
export function evaluateLive(
  episodes: Episode[],
  now: Date,
  bufferMin: number
): { isLive: boolean; resumeAt: Date | null } {
  const bufMs = bufferMin * 60_000;
  const t = now.getTime();
  let resume: number | null = null;

  for (const ep of episodes) {
    if (!AIRING_STATUSES.has(ep.status)) continue;
    // An episode explicitly flagged not to stream doesn't occupy the air.
    if (ep.livestream_override === 'skip') continue;
    const start = parseTs(ep.startTime);
    const end = parseTs(ep.endTime);
    if (t >= start - bufMs && t <= end + bufMs) {
      const r = end + bufMs;
      if (resume === null || r > resume) resume = r;
    }
  }

  return { isLive: resume !== null, resumeAt: resume === null ? null : new Date(resume) };
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
    `${env.POCKETBASE_URL}/api/collections/episodes/records` +
    `?perPage=200&fields=status,startTime,endTime,livestream_override&filter=${encodeURIComponent(filter)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`PocketBase ${res.status}`);
    const body = (await res.json()) as { items: Episode[] };
    return evaluateLive(body.items ?? [], now, env.LIVE_GUARD_BUFFER_MIN);
  } catch (err) {
    console.warn(`Live-guard: PocketBase check failed, enqueuing without delay: ${String(err)}`);
    return { isLive: false, resumeAt: null };
  }
}
