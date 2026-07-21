import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { userManager } from '../auth/AuthProvider';
// Type-only import of the server's router shape. No path alias exists between the
// packages, so we reach into the api source directly (the type is erased at build
// time — nothing from the api runtime is bundled into the UI).
import type { AppRouter } from '../../../api/src/trpc/root';

// Attach the Zitadel access token, mirroring how api/client.ts's apiFetch pulls
// it from the oidc userManager. Runs per request batch (async) so it always uses
// the freshest token oidc-client-ts holds (it renews silently in the background).
async function authHeaders(): Promise<Record<string, string>> {
  const user = await userManager.getUser();
  if (user?.access_token) return { Authorization: `Bearer ${user.access_token}` };
  return {};
}

// Standalone vanilla client — usable outside React (loaders, imperative calls).
export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
      headers: authHeaders,
    }),
  ],
});

// @tanstack/react-query integration. Wire `TRPCProvider` (with `trpcClient` and
// the existing QueryClient) near the app root when adopting tRPC in a component,
// then call `useTRPC()` to build query/mutation options.
export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();
