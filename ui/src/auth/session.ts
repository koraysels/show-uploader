import type { User } from 'oidc-client-ts';

// The subset of UserManager this module needs. Declaring it structurally keeps
// the file free of React and of the module-level `userManager` singleton, so the
// logic below can be tested with a plain fake (ui's vitest setup has no jsdom).
export interface SessionManager {
  getUser(): Promise<User | null>;
  signinSilent(): Promise<User | null>;
  signinRedirect(): Promise<void>;
}

/**
 * Redeem the refresh token for a new access token. Separate from
 * getFreshAccessToken because the retry path must renew unconditionally — the
 * server has already rejected a token the client believed was still valid.
 */
async function renew(mgr: SessionManager): Promise<string | undefined> {
  try {
    const renewed = await mgr.signinSilent();
    return renewed?.access_token;
  } catch {
    return undefined;
  }
}

/**
 * A usable access token, or undefined when the caller has to fall back to an
 * interactive login. Never throws.
 *
 * Returns the stored token while it is still valid; past that it renews, which
 * with `offline_access` is a refresh-token grant and with no refresh token is
 * the hidden-iframe `prompt=none` flow (see /silent-renew).
 */
export async function getFreshAccessToken(mgr: SessionManager): Promise<string | undefined> {
  let user: User | null;
  try {
    user = await mgr.getUser();
  } catch {
    return undefined;
  }
  // No stored session at all: nothing to renew from, and the route guard is
  // already redirecting. Bail rather than pay for a request that cannot succeed.
  if (!user) return undefined;
  if (!user.expired && user.access_token) return user.access_token;
  return renew(mgr);
}

/**
 * Send a request with a fresh token, renewing and retrying once if the server
 * still rejects it, then bouncing to login rather than dead-ending on a 401.
 *
 * `send` is called with the token to attach (undefined when there is none) and
 * must be safe to call twice — request bodies have to be cloned per attempt.
 */
export async function withAuthRetry(
  mgr: SessionManager,
  send: (token: string | undefined) => Promise<Response>,
): Promise<Response> {
  let res = await send(await getFreshAccessToken(mgr));
  if (res.status !== 401) return res;

  // The token we believed was fresh was rejected anyway (clock skew, key
  // rotation, a session revoked server-side). Force one renewal and retry.
  const renewed = await renew(mgr);
  if (renewed) {
    res = await send(renewed);
    if (res.status !== 401) return res;
  }

  await mgr.signinRedirect();
  throw new Error('Session expired');
}
