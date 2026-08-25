import { UserManager, WebStorageStateStore } from 'oidc-client-ts';

export const userManager = new UserManager({
  authority: `https://${import.meta.env.VITE_ZITADEL_DOMAIN}`,
  client_id: import.meta.env.VITE_ZITADEL_CLIENT_ID,
  redirect_uri: `${window.location.origin}/callback`,
  // offline_access asks Zitadel for a refresh token, which is what lets the
  // session outlive the access token. It is SILENTLY IGNORED unless the
  // "Refresh Token" grant is enabled on the app in the Zitadel console.
  scope: 'openid profile email offline_access urn:zitadel:iam:org:project:roles',
  response_type: 'code',
  automaticSilentRenew: true,
  // Default is sessionStorage, which drops the session when the tab closes — no
  // token lifetime can survive that. localStorage is the tradeoff that makes a
  // multi-day session possible: the refresh token is readable by any XSS on
  // this origin for as long as it lives.
  userStore: new WebStorageStateStore({ store: window.localStorage }),
  // Renewal without a refresh token runs in a hidden iframe, which has to call
  // signinSilentCallback(). Left at its default this points at /callback, which
  // only handles the redirect flow — the iframe would never answer and every
  // renewal would stall for the full 10s timeout before failing.
  silent_redirect_uri: `${window.location.origin}/silent-renew`,
  // Zitadel omits name/email from the ID token; fetch them from the userinfo
  // endpoint so user.profile has a display name (header chip, presence).
  loadUserInfo: true,
});
