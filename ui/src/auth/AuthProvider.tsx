import { createContext, useEffect, useState, type ReactNode } from 'react';
import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';

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

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  userManager: UserManager;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleUserLoaded = (u: User) => setUser(u);
    const handleUserUnloaded = () => setUser(null);
    const handleSilentRenewError = () => {
      setUser(null);
      userManager.signinRedirect();
    };

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
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));

    return () => {
      userManager.events.removeUserLoaded(handleUserLoaded);
      userManager.events.removeUserUnloaded(handleUserUnloaded);
      userManager.events.removeSilentRenewError(handleSilentRenewError);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, userManager }}>
      {children}
    </AuthContext.Provider>
  );
}
