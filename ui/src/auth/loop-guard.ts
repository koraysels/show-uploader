/**
 * Interactive-signin loop breaker.
 *
 * Every path that gives up on the local session ends in signinRedirect(), and
 * Zitadel answers a redirect with a live SSO session instantly — so when the
 * api rejects the resulting token the app bounces
 * `/` → zitadel → `/callback` → `/` → … forever, showing nothing but
 * "checking access…" / "signing in…". Redirects are counted here so the app can
 * stop and show the operator what actually failed instead of spinning.
 *
 * Kept free of React, oidc-client-ts and `window` so it can be tested with a
 * plain object (ui's vitest setup has no jsdom).
 */

// Only what this module needs from sessionStorage.
export interface AttemptStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const ATTEMPTS_KEY = 'auth:signin-attempts';
// A second, longer window that proving the session good does NOT clear. Without
// it a cycle that alternates success and failure — sign in, work for one token
// lifetime, lose the session, sign in again — resets the counter on every pass
// and redirects forever without the guard ever seeing a loop.
export const HISTORY_KEY = 'auth:signin-history';
export const MAX_HISTORY = 5;
export const HISTORY_WINDOW_MS = 600_000;
// Three interactive redirects inside a minute is never a person signing in; a
// real login is one redirect, and a genuine re-auth after expiry is one more.
export const MAX_ATTEMPTS = 3;
export const WINDOW_MS = 60_000;

function read(store: AttemptStore, key: string = ATTEMPTS_KEY): number[] {
  try {
    const raw = store.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : [];
  } catch {
    // Unreadable storage (private mode, corrupt value) must not itself break
    // signing in — treat it as "no attempts recorded".
    return [];
  }
}

/** Attempts inside the trailing window, oldest first. */
export function recentAttempts(store: AttemptStore, now: number, windowMs = WINDOW_MS): number[] {
  return read(store).filter((t) => now - t < windowMs);
}

/** Redirects in the long window, which survives a healthy session. */
export function signinHistory(store: AttemptStore, now: number): number[] {
  return read(store, HISTORY_KEY).filter((t) => now - t < HISTORY_WINDOW_MS);
}

/**
 * Record one interactive signin and report whether it may proceed. The attempt
 * that trips the limit is still stored, so a caller that ignores `allowed`
 * can't reset the count by trying again.
 */
export function recordAttempt(
  store: AttemptStore,
  now: number,
  opts: { max?: number; windowMs?: number } = {}
): { allowed: boolean; attempts: number } {
  const max = opts.max ?? MAX_ATTEMPTS;
  const attempts = [...recentAttempts(store, now, opts.windowMs), now];
  const history = [...signinHistory(store, now), now];
  try {
    store.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
    store.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Storage full or blocked: the guard degrades to allowing the redirect,
    // which is the pre-guard behaviour, not a worse one.
  }
  // Report whichever count did the blocking, so the failure screen's "stopped
  // after N attempts" describes the loop that was actually seen.
  const tooManyRecent = attempts.length > max;
  const tooManyOverall = history.length > MAX_HISTORY;
  return {
    allowed: !tooManyRecent && !tooManyOverall,
    attempts: tooManyOverall && !tooManyRecent ? history.length : attempts.length,
  };
}

/**
 * Called once the session is proven good — the short counter starts from zero
 * again. The long history deliberately survives, so a slow loop still adds up.
 */
export function clearAttempts(store: AttemptStore): void {
  try {
    store.removeItem(ATTEMPTS_KEY);
  } catch {
    // Nothing to do; a stale counter expires with the window anyway.
  }
}

/**
 * Wipe both counters. Only for an explicit act by the operator — signing out,
 * or pressing "try again" — where the next redirect is one they asked for and
 * must not be refused by history from the loop they are trying to escape.
 */
export function resetGuard(store: AttemptStore): void {
  for (const key of [ATTEMPTS_KEY, HISTORY_KEY]) {
    try {
      store.removeItem(key);
    } catch {
      // Blocked storage: the windows expire on their own soon enough.
    }
  }
}
