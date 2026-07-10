import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
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
    });

    const roles = payload['urn:zitadel:iam:org:project:roles'] as Record<string, unknown> | undefined;
    if (!roles || !('member' in roles)) {
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
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
