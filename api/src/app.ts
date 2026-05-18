import express from 'express';
import cors from 'cors';
import path from 'path';
import { showsRouter } from './routes/shows';
import { uploadsRouter } from './routes/uploads';
import { eventsRouter } from './routes/events';
import { watcherRouter } from './routes/watcher';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/shows', showsRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/uploads', eventsRouter);
  app.use('/api/watcher', watcherRouter);

  const uiDist = path.join(__dirname, '..', '..', 'ui', 'dist');
  app.use(express.static(uiDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(uiDist, 'index.html'));
  });

  return app;
}
