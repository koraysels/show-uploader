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
import History from './pages/History';
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

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center gap-6">
        <span className="font-semibold text-white tracking-tight">Show Uploader</span>
        <Link
          to="/"
          activeOptions={{ exact: true }}
          className="text-sm text-gray-400 hover:text-white"
          activeProps={{ className: 'text-sm text-white' }}
        >
          New Upload
        </Link>
        <Link
          to="/history"
          className="text-sm text-gray-400 hover:text-white"
          activeProps={{ className: 'text-sm text-white' }}
        >
          History
        </Link>
      </nav>
      <main className="max-w-2xl mx-auto px-6 py-10">
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
  component: NewUpload,
});

const uploadRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/upload/$showId',
  component: NewUpload,
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
  authedRoute.addChildren([indexRoute, uploadRoute, historyRoute]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
