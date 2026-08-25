import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import { env } from '../env';

// The authenticated identity, attached to every request that clears requireAuth.
export type AuthUser = { sub: string; name: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const JWKS = createRemoteJWKSet(
  new URL(`https://${env.ZITADEL_DOMAIN}/oauth/v2/keys`)
);

/**
 * Why a token was refused, and whether that is the client's problem.
 *
 * The distinction matters because the UI answers 401 by throwing the session
 * away and bouncing to Zitadel — which, against a live SSO session, is an
 * instant round trip back to the same rejection. A JWKS fetch that timed out
 * says nothing about the token, so it must not read as "log in again": 503
 * surfaces as a plain error the operator can see, and the session survives.
 */
export function classifyAuthError(err: unknown): { status: 401 | 503; code: string } {
  const code = (err as { code?: string })?.code ?? 'ERR_UNKNOWN';
  const infra =
    code === 'ERR_JWKS_TIMEOUT' ||
    code === 'ERR_JWKS_MULTIPLE_MATCHING_KEYS' ||
    code === 'ERR_JOSE_GENERIC' ||
    // jose surfaces a failed key fetch as a bare fetch/network error.
    (code === 'ERR_UNKNOWN' && err instanceof TypeError);
  return { status: infra ? 503 : 401, code };
}

// Enough of the token to tell the common misconfigurations apart without
// putting a credential in the logs: an opaque Zitadel token (no JWT header at
// all), or one signed by a key the JWKS doesn't carry.
export function tokenShape(token: string): string {
  try {
    const { alg, kid } = decodeProtectedHeader(token);
    return `alg=${alg ?? '?'} kid=${kid ?? '?'}`;
  } catch {
    return "not-a-jwt (opaque token — check the app's Auth Token Type in Zitadel)";
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  // SSE (EventSource) can't set an Authorization header, so the events stream
  // passes the token as a query param instead.
  const token = header?.startsWith('Bearer ')
    ? header.slice(7)
    : typeof req.query?.access_token === 'string'
      ? req.query.access_token
      : undefined;
  if (!token) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://${env.ZITADEL_DOMAIN}`,
      audience: env.ZITADEL_CLIENT_ID,
      // Zitadel and this host keep their own clocks; without a tolerance a
      // second of drift rejects a token that was just issued.
      clockTolerance: '30s',
    });

    const roles = payload['urn:zitadel:iam:org:project:roles'] as Record<string, unknown> | undefined;
    if (!roles || !('member' in roles)) {
      console.warn(`Auth: no member role for ${String(payload.sub)} (${req.method} ${req.path})`);
      res.status(403).json({ error: 'Access not granted' });
      return;
    }

    const name =
      (payload.name as string) ||
      (payload.preferred_username as string) ||
      (payload.email as string) ||
      payload.sub!;
    req.user = { sub: payload.sub!, name };

    next();
  } catch (err) {
    // Silent 401s are what made the UI's sign-in loop unreadable: the browser
    // bounced through Zitadel forever and the server never said why.
    const { status, code } = classifyAuthError(err);
    console.warn(
      `Auth: rejected token (${code}) on ${req.method} ${req.path} — ${tokenShape(token)}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    res.status(status).json(
      status === 503 ? { error: 'Auth backend unavailable', code } : { error: 'Invalid token', code }
    );
  }
}
