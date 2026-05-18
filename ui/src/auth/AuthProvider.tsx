import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { UserManager, type User } from 'oidc-client-ts';

export const userManager = new UserManager({
  authority: `https://${import.meta.env.VITE_ZITADEL_DOMAIN}`,
  client_id: import.meta.env.VITE_ZITADEL_CLIENT_ID,
  redirect_uri: `${window.location.origin}/callback`,
  scope: 'openid profile email urn:zitadel:iam:org:project:roles',
  response_type: 'code',
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
    userManager.getUser().then(setUser).finally(() => setLoading(false));

    const handleUserLoaded = (u: User) => setUser(u);
    const handleUserUnloaded = () => setUser(null);

    userManager.events.addUserLoaded(handleUserLoaded);
    userManager.events.addUserUnloaded(handleUserUnloaded);

    return () => {
      userManager.events.removeUserLoaded(handleUserLoaded);
      userManager.events.removeUserUnloaded(handleUserUnloaded);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, userManager }}>
      {children}
    </AuthContext.Provider>
  );
}
