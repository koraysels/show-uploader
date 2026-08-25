import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { theme } from './theme';
import { AuthProvider } from './auth/AuthProvider';
import { UploadProvider } from './upload/UploadProvider';
import { PresenceProvider } from './presence/PresenceProvider';
import { TRPCProvider, trpcClient } from './api/trpc';
import { ErrorBoundary } from './components/ErrorBoundary';
import { router } from './router';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

async function bootstrap() {
  // Target of silent_redirect_uri. This document only ever loads inside the
  // hidden renewal iframe, where the single job is to post the result back to
  // the parent window — mounting the app there would boot the whole provider
  // tree (and open a second presence stream) for every token renewal. Imports
  // the manager directly (not via AuthProvider) so the iframe pulls no React.
  if (location.pathname === '/silent-renew') {
    const { userManager } = await import('./auth/user-manager');
    // Failures are reported to the parent over the same channel; nothing here
    // can act on them, and this document is never seen by the user.
    await userManager.signinSilentCallback().catch(() => {});
    return;
  }

  // `pnpm dev` + `/?mock=1` swaps the whole backend for fixtures (src/dev) so the
  // UI can be worked on at real viewport sizes without an API, a login, or any
  // risk of a click landing on production data. The DEV guard keeps it out of the
  // production bundle entirely.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('mock')) {
    const { install } = await import('./dev/mock-backend');
    install();
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
              <AuthProvider>
                <UploadProvider>
                  <PresenceProvider>
                    <RouterProvider router={router} />
                  </PresenceProvider>
                </UploadProvider>
              </AuthProvider>
            </TRPCProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </React.StrictMode>
  );
}

void bootstrap();
