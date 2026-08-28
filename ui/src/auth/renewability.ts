/**
 * Can this session renew itself, and what happens when it can't.
 *
 * There are two renewal paths. With a refresh token it's a plain token-endpoint
 * call, which works everywhere. Without one, oidc-client-ts falls back to a
 * hidden iframe doing `prompt=none` against Zitadel — a third-party cookie
 * read, which Chrome blocks for a growing share of profiles. That fallback is
 * the loop engine: it fails, the app drops the session, redirects, Zitadel's
 * live SSO hands back a fresh token, and the whole thing repeats one token
 * lifetime later. Nothing reaches jwtVerify, so the api log stays empty.
 *
 * Zitadel only issues a refresh token when the app has the Refresh Token grant
 * enabled — asking for `offline_access` without it is silently ignored, which
 * is why this is worth naming rather than retrying.
 *
 * Kept free of React and oidc-client-ts so it can be tested with a plain object
 * (ui's vitest setup has no jsdom).
 */

export interface RenewableSession {
  refresh_token?: string;
}

export const NO_REFRESH_TOKEN_HINT =
  'This session has no refresh token, so renewal depends on a hidden iframe that ' +
  'most browsers now block. Enable the "Refresh Token" grant on the app in the ' +
  'Zitadel console (Applications → this app → Grant Types).';

/** True when renewal uses the token endpoint rather than the blockable iframe. */
export function canRenewSilently(user: RenewableSession | null | undefined): boolean {
  return typeof user?.refresh_token === 'string' && user.refresh_token.length > 0;
}

/**
 * What to do when a silent renewal has just failed.
 *
 * - `ignore`: the access token is still valid, so the next tick can succeed.
 *   Tearing the session down here is what turned one blocked iframe into a
 *   visible loop.
 * - `reauth`: expired, but renewal could work — one interactive signin fixes it.
 * - `fail`: expired and renewal can never work in this browser. Another
 *   redirect would only restart the cycle, so stop and say why.
 */
export function renewFailureAction(user: {
  expired?: boolean;
  refresh_token?: string;
} | null): 'ignore' | 'reauth' | 'fail' {
  if (user && user.expired === false) return 'ignore';
  return canRenewSilently(user) ? 'reauth' : 'fail';
}
