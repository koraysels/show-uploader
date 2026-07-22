import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { userManager } from '../auth/AuthProvider';
// Type-only import of the server's router shape. No path alias exists between the
// packages, so we reach into the api source directly (the type is erased at build
// time — nothing from the api runtime is bundled into the UI).
import type { AppRouter } from '../../../api/src/trpc/root';

// Auth-aware fetch for the tRPC link — full parity with api/client.ts's apiFetch:
// attach the Zitadel access token, and on a 401 try a silent renew + retry once,
// then bounce to login rather than dead-ending. Every request is cloned before
// sending so the body survives the retry.
async function sendWithToken(base: Request, token: string | undefined): Promise<Response> {
  const req = base.clone();
  if (token) req.headers.set('Authorization', `Bearer ${token}`);
  return fetch(req);
}

const authedFetch: typeof fetch = async (input, init) => {
  const base = input instanceof Request ? input : new Request(input as string, init);
  const user = await userManager.getUser();
  let res = await sendWithToken(base, user?.access_token);
  if (res.status === 401) {
    let renewed = null;
    try {
      renewed = await userManager.signinSilent();
    } catch {
      renewed = null;
    }
    if (renewed?.access_token) res = await sendWithToken(base, renewed.access_token);
    if (res.status === 401) {
      await userManager.signinRedirect();
      throw new Error('Session expired');
    }
  }
  return res;
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
