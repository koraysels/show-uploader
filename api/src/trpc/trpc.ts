import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../env';
import type { AuthUser } from '../middleware/requireAuth';

// Reuse the EXACT same JWKS + verification that requireAuth performs, so tRPC
// procedures enforce identical auth (Zitadel JWT + the `member` project role).
const JWKS = createRemoteJWKSet(
  new URL(`https://${env.ZITADEL_DOMAIN}/oauth/v2/keys`)
);

// Verify a bearer token the same way requireAuth does. Returns the identity on
// success, or null if the token is missing/invalid or lacks the member role.
async function verifyMember(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://${env.ZITADEL_DOMAIN}`,
      audience: env.ZITADEL_CLIENT_ID,
    });

    const roles = payload['urn:zitadel:iam:org:project:roles'] as
      | Record<string, unknown>
      | undefined;
    if (!roles || !('member' in roles)) return null;

    const name =
      (payload.name as string) ||
      (payload.preferred_username as string) ||
      (payload.email as string) ||
      payload.sub!;
    return { sub: payload.sub!, name };
  } catch {
    return null;
  }
}

// The tRPC request context. `user` mirrors requireAuth's identity (null when not
// a valid member). `headers` is exposed as a plain record — deliberately NOT the
// Express request — so per-procedure auth (e.g. the watcher API key, added in a
// later phase) can read the Authorization header without the client type import
// coupling to Express types.
export interface Context {
  user: AuthUser | null;
  headers: Record<string, string | string[] | undefined>;
}

export async function createContext({ req }: CreateExpressContextOptions): Promise<Context> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const user = token ? await verifyMember(token) : null;
  return { user, headers: req.headers };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Enforce the same gate as requireAuth: a valid Zitadel JWT carrying the member
// role. Downstream resolvers get a non-null `ctx.user`.
const enforceMember = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Access not granted' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(enforceMember);
