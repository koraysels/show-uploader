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
// Three interactive redirects inside a minute is never a person signing in; a
// real login is one redirect, and a genuine re-auth after expiry is one more.
export const MAX_ATTEMPTS = 3;
export const WINDOW_MS = 60_000;

function read(store: AttemptStore): number[] {
  try {
    const raw = store.getItem(ATTEMPTS_KEY);
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
  try {
    store.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
  } catch {
    // Storage full or blocked: the guard degrades to allowing the redirect,
    // which is the pre-guard behaviour, not a worse one.
  }
  return { allowed: attempts.length <= max, attempts: attempts.length };
}

/** Called once the session is proven good — the counter starts from zero again. */
export function clearAttempts(store: AttemptStore): void {
  try {
    store.removeItem(ATTEMPTS_KEY);
  } catch {
    // Nothing to do; a stale counter expires with the window anyway.
  }
}
