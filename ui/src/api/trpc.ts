import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { userManager } from '../auth/AuthProvider';
import { withAuthRetry } from '../auth/session';
// Type-only import of the server's router shape. No path alias exists between the
// packages, so we reach into the api source directly (the type is erased at build
// time — nothing from the api runtime is bundled into the UI).
import type { AppRouter } from '../../../api/src/trpc/root';

// Auth-aware fetch for the tRPC link — the renew/retry policy itself lives in
// auth/session.ts, shared with api/client.ts. Every request is cloned before
// sending so the body survives the retry.
const authedFetch: typeof fetch = async (input, init) => {
  const base = input instanceof Request ? input : new Request(input as string, init);
  return withAuthRetry(userManager, (token) => {
    const req = base.clone();
    if (token) req.headers.set('Authorization', `Bearer ${token}`);
    return fetch(req);
  });
};

// Standalone vanilla client — usable outside React (loaders, imperative calls).
export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
      fetch: authedFetch,
    }),
  ],
});

// @tanstack/react-query integration. Wire `TRPCProvider` (with `trpcClient` and
// the existing QueryClient) near the app root when adopting tRPC in a component,
// then call `useTRPC()` to build query/mutation options.
export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();
