import express from 'express';
import cors from 'cors';
import path from 'path';
import { showsRouter } from './routes/shows';
import { uploadsRouter } from './routes/uploads';
import { eventsRouter } from './routes/events';
import { watcherRouter } from './routes/watcher';
import { requireAuth } from './middleware/requireAuth';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Watcher uses its own API key — exempt from JWT auth
  app.use('/api/watcher', watcherRouter);

  // All routes below require a valid Zitadel JWT with the member role
  app.use(requireAuth);

  app.get('/api/auth/me', (_req, res) => res.json({ ok: true }));
  app.use('/api/shows', showsRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/uploads', eventsRouter);

  const uiDist = path.join(__dirname, '..', '..', 'ui', 'dist');
  app.use(express.static(uiDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(uiDist, 'index.html'));
  });

  return app;
}
