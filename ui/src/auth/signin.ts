import type { User } from 'oidc-client-ts';
import { userManager } from './user-manager';
import { clearAttempts, recordAttempt, type AttemptStore } from './loop-guard';
import type { SessionManager } from './session';

/**
 * The single entry point for "give up on the local session and send the user to
 * Zitadel". Everything that used to call userManager.signinRedirect() directly
 * goes through here, which buys three things:
 *
 *  - single flight: a page with five queries answering 401 fired five redirects.
 *  - a loop breaker: past the limit the app stops and reports, instead of
 *    bouncing through Zitadel's live SSO session forever.
 *  - one place that knows WHY we are re-authenticating, so the operator sees it.
 */
export type AuthFailure = { reason: string; attempts: number; detail?: string };

// sessionStorage is per-tab, which is what we want — a loop in one tab must not
// lock out another — but it throws outright in some privacy modes.
const memoryStore = new Map<string, string>();
function attemptStore(): AttemptStore {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) return window.sessionStorage;
  } catch {
    // Blocked; fall through to the in-memory stand-in.
  }
  return {
    getItem: (k) => memoryStore.get(k) ?? null,
    setItem: (k, v) => void memoryStore.set(k, v),
    removeItem: (k) => void memoryStore.delete(k),
  };
}

let failure: AuthFailure | null = null;
let pending: Promise<void> | null = null;
const listeners = new Set<(f: AuthFailure | null) => void>();

function emit(): void {
  for (const fn of listeners) fn(failure);
}

export function getAuthFailure(): AuthFailure | null {
  return failure;
}

export function subscribeAuthFailure(fn: (f: AuthFailure | null) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/**
 * Start an interactive signin, unless this tab is already looping. Resolves
 * without redirecting when the guard trips — callers keep rendering, and the
 * layout shows the failure screen.
 */
export function requestSignin(reason: string, args?: { prompt?: string }): Promise<void> {
  // Already stopped: another redirect would just resume the loop we broke.
  if (failure) return Promise.resolve();
  // A redirect is a page unload; the second caller has nothing left to start.
  if (pending) return pending;

  const { allowed, attempts } = recordAttempt(attemptStore(), Date.now());
  if (!allowed) {
    failure = { reason, attempts };
    console.error(`Auth loop broken after ${attempts} signin redirects (${reason})`);
    emit();
    return Promise.resolve();
  }

  pending = userManager
    .signinRedirect(args)
    .catch((err: unknown) => {
      // Never reached the login screen at all (Zitadel unreachable, bad config).
      failure = { reason, attempts, detail: String(err) };
      emit();
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/**
 * The session has been proven good end to end (the api accepted the token), so
 * the counter that guards against looping starts over.
 */
export function markSessionHealthy(): void {
  clearAttempts(attemptStore());
  if (failure) {
    failure = null;
    emit();
  }
}

/** Operator pressed "try again" on the failure screen. */
export async function retrySignin(): Promise<void> {
  clearAttempts(attemptStore());
  failure = null;
  emit();
  await requestSignin('manual-retry', { prompt: 'login' });
}

/** Operator pressed "sign out" — drop the local session and start clean. */
export async function signOut(): Promise<void> {
  try {
    await userManager.revokeTokens(['refresh_token']);
  } catch {
    // Nothing to revoke, or Zitadel unreachable: must not trap the user.
  }
  await userManager.removeUser();
  clearAttempts(attemptStore());
  failure = null;
  emit();
  await userManager.signinRedirect({ prompt: 'login' });
}

/**
 * The manager handed to api/tRPC callers: renewal untouched, but the "bounce to
 * login" step routed through the guard above.
 */
export const guardedSession: SessionManager = {
  getUser: (): Promise<User | null> => userManager.getUser(),
  signinSilent: (): Promise<User | null> => userManager.signinSilent(),
  signinRedirect: (): Promise<void> => requestSignin('api-rejected-token'),
};
