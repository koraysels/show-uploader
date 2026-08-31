import { createContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from 'oidc-client-ts';
import { userManager } from './user-manager';
import {
  getAuthFailure,
  guardedSession,
  requestSignin,
  subscribeAuthFailure,
  type AuthFailure,
} from './signin';
import { canRenewSilently, renewFailureAction, NO_REFRESH_TOKEN_HINT } from './renewability';
import { renewSession } from './session';

// The UserManager singleton lives in ./user-manager so the silent-renew iframe
// (main.tsx) can import it without pulling in React. Re-exported here because
// the rest of the app has always imported it from this module.
export { userManager };

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  userManager: typeof userManager;
  // Set once the loop breaker has stopped re-authenticating; the layout shows
  // the failure screen instead of another "signing in…" spinner.
  authFailure: AuthFailure | null;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authFailure, setAuthFailure] = useState<AuthFailure | null>(getAuthFailure);

  useEffect(() => {
    // The restore-from-storage chain below is async, and on /callback the token
    // exchange can finish first. Without this flag its late `setUser(stored)`
    // overwrote the user that just signed in with null — which the route guard
    // read as "not logged in" and answered with another redirect.
    let loaded = false;

    const handleUserLoaded = (u: User) => {
      loaded = true;
      // Zitadel ignores `offline_access` unless the app has the Refresh Token
      // grant, and the iframe fallback is blocked in more browsers every year.
      // Say so once per sign-in rather than letting it surface as a loop.
      if (!canRenewSilently(u)) console.warn(`Auth: ${NO_REFRESH_TOKEN_HINT}`);
      setUser(u);
    };
    const handleUserUnloaded = () => setUser(null);
    const handleSilentRenewError = async () => {
      const current = await userManager.getUser().catch(() => null);
      switch (renewFailureAction(current)) {
        // Still-valid access token: the next tick can succeed. Dropping the
        // session here is what turned one blocked iframe into a login loop.
        case 'ignore':
          return;
        case 'reauth':
          setUser(null);
          void requestSignin('silent-renew-failed');
          return;
        // Expired, and renewal will fail the same way every time. Another
        // redirect gets a fresh token that dies one lifetime later — the loop.
        // Stop the retry timer too, or oidc keeps re-entering this handler.
        case 'fail':
          userManager.stopSilentRenew();
          setUser(null);
          void requestSignin('renew-unavailable', undefined, NO_REFRESH_TOKEN_HINT);
      }
    };

    const unsubscribeFailure = subscribeAuthFailure(setAuthFailure);
    userManager.events.addUserLoaded(handleUserLoaded);
    userManager.events.addUserUnloaded(handleUserUnloaded);
    userManager.events.addSilentRenewError(handleSilentRenewError);

    // Restoring from storage can hand back an expired user (the common case
    // after the app has been closed a while). Renew before the first request
    // goes out, so the app doesn't open on a burst of 401s.
    userManager
      .getUser()
      .then(async (stored) => {
        if (!stored?.expired) return stored;
        // No refresh token means signinSilent can only try the iframe, which
        // costs a 10s timeout before failing. Go straight to the interactive
        // signin the guard can count.
        if (!canRenewSilently(stored)) {
          void requestSignin('renew-unavailable', undefined, NO_REFRESH_TOKEN_HINT);
          return null;
        }
        // Shared with the query path, so the page load can't fire a second
        // refresh grant against a token the first one already rotated away.
        return (await renewSession(guardedSession, stored.access_token)) ?? stored;
      })
      .then((restored) => {
        if (!loaded) setUser(restored);
      })
      .catch(() => {
        if (!loaded) setUser(null);
      })
      .finally(() => setLoading(false));

    return () => {
      unsubscribeFailure();
      userManager.events.removeUserLoaded(handleUserLoaded);
      userManager.events.removeUserUnloaded(handleUserUnloaded);
      userManager.events.removeSilentRenewError(handleSilentRenewError);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, userManager, authFailure }}>
      {children}
    </AuthContext.Provider>
  );
}
