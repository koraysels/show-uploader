import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type AuthUser } from '../auth/verify-token';

// Verification itself lives in ../auth/verify-token so the tRPC context uses
// the exact same checks. Re-exported here because callers have always imported
// these from this module.
export { classifyAuthError, tokenShape, type AuthUser } from '../auth/verify-token';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const MESSAGES: Record<number, string> = {
  401: 'Invalid token',
  403: 'Access not granted',
  503: 'Auth backend unavailable',
};

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
    // A loop driven by the client failing to renew never reaches jwtVerify, so
    // without this line the server log stays empty while the browser bounces.
    console.warn(`Auth: no token on ${req.method} ${req.path}`);
    res.status(401).json({ error: 'Missing token', code: 'ERR_NO_TOKEN' });
    return;
  }

  const result = await verifyToken(token, `${req.method} ${req.path}`);
  if (!result.ok) {
    res.status(result.status).json({ error: MESSAGES[result.status], code: result.code });
    return;
  }

  req.user = result.user;
  next();
}
