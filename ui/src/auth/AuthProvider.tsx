import { createContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from 'oidc-client-ts';
import { userManager } from './user-manager';
import { getAuthFailure, requestSignin, subscribeAuthFailure, type AuthFailure } from './signin';

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
      setUser(u);
    };
    const handleUserUnloaded = () => setUser(null);
    const handleSilentRenewError = async () => {
      // A failed renewal is not by itself a dead session: with a still-valid
      // access token the next renewal tick can succeed, and forcing a redirect
      // here is what turned one blocked iframe into a login loop.
      const current = await userManager.getUser().catch(() => null);
      if (current && !current.expired) return;
      setUser(null);
      void requestSignin('silent-renew-failed');
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
        return await userManager.signinSilent().catch(() => stored);
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
