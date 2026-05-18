import type { Request, Response, NextFunction } from 'express';
import { env } from '../env';

export function basicAuth(req: Request, res: Response, next: NextFunction): void {
  if (!env.UI_USERNAME || !env.UI_PASSWORD) {
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header?.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Show Uploader"');
    res.status(401).send('Authentication required');
    return;
  }

  const decoded = Buffer.from(header.slice(6), 'base64').toString();
  const colon = decoded.indexOf(':');
  const user = decoded.slice(0, colon);
  const pass = decoded.slice(colon + 1);

  if (user !== env.UI_USERNAME || pass !== env.UI_PASSWORD) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Show Uploader"');
    res.status(401).send('Invalid credentials');
    return;
  }

  next();
}
