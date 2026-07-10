import { useEffect } from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
} from '@tanstack/react-router';
import { useAuth } from './auth/useAuth';
import { useAuthCheck } from './api/hooks';
import NewUpload from './pages/NewUpload';
import Shows from './pages/Shows';
import History from './pages/History';
import Archive from './pages/Archive';
import { UploadIndicator } from './components/Dropzone';
import { PresenceRoster } from './components/PresenceRoster';
import AuthCallback from './pages/AuthCallback';
import AccessDenied from './pages/AccessDenied';

function AuthedLayout() {
  const { user, loading, userManager } = useAuth();
  const authCheck = useAuthCheck(!!user);

  useEffect(() => {
    if (!loading && !user) void userManager.signinRedirect();
  }, [loading, user, userManager]);

  if (loading || !user) return null;
  if (authCheck.isError && authCheck.error.message.includes('403')) return <AccessDenied />;
  if (authCheck.isPending) return null;

  const navLink = 'px-3 py-1.5 text-sm lowercase text-muted hover:text-ink transition-colors';
  const navActive = 'px-3 py-1.5 text-sm lowercase text-paper bg-ink';

  const displayName =
    (user.profile.name as string) ||
    (user.profile.preferred_username as string) ||
    (user.profile.email as string) ||
    'account';

  const handleLogout = async () => {
    // Clear the local session and force the Zitadel login screen. We avoid the
    // OIDC end-session endpoint — it requires a registered post_logout_redirect_uri
    // (not configured), which dead-ends on a "Not Found". prompt=login makes this
    // a real logout (re-auth / switch account) rather than a silent SSO bounce.
    await userManager.removeUser();
    await userManager.signinRedirect({ prompt: 'login' });
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-6 px-6">
          <Link to="/" className="flex items-center gap-2 text-base font-semibold lowercase tracking-tight text-ink">
            <span className="h-2.5 w-2.5 bg-ink" aria-hidden />
            show uploader
          </Link>
          <nav className="flex items-center gap-0.5">
            <Link to="/" activeOptions={{ exact: true }} className={navLink} activeProps={{ className: navActive }}>
              upload
            </Link>
            <Link to="/history" className={navLink} activeProps={{ className: navActive }}>
              history
            </Link>
            <Link to="/archive" className={navLink} activeProps={{ className: navActive }}>
              archive
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-5">
            <PresenceRoster />
            <UploadIndicator />
            <div className="flex items-center gap-2 border-l border-line pl-4">
              <span className="max-w-[140px] truncate text-xs lowercase text-muted" title={displayName}>
                {displayName}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="text-xs lowercase text-faint underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink"
              >
                log out
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const callbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/callback',
  component: AuthCallback,
});

const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authed',
  component: AuthedLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/',
  component: Shows,
});

const uploadRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/upload/$showId',
  component: NewUpload,
});

const archiveRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/archive',
  component: Archive,
});

const historyRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/history',
  validateSearch: (search: Record<string, unknown>): { highlight?: string } => ({
    highlight: typeof search.highlight === 'string' ? search.highlight : undefined,
  }),
  component: History,
});

const routeTree = rootRoute.addChildren([
  callbackRoute,
  authedRoute.addChildren([indexRoute, uploadRoute, historyRoute, archiveRoute]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
