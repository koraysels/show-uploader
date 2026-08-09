import { router } from './trpc';
import { showsRouter } from './routers/shows';
import { uploadsRouter } from './routers/uploads';
import { platformRouter } from './routers/platform';
import { watcherRouter } from './routers/watcher';
import { storageRouter } from './routers/storage';

// tRPC lives ALONGSIDE the Express REST routes so the client adopts it
// incrementally. Migrated: `shows` (full), `uploads` (all non-SSE/non-multipart),
// `platform` (update/youtube-status/set-public/remove) and `watcher` (the UI's
// pending/claim; the watcher daemon + worker keep calling the REST route with
// the shared API key). Multipart + the SSE streams (events, presence) stay REST
// — file uploads + SSE don't fit tRPC's batch link.
export const appRouter = router({
  shows: showsRouter,
  uploads: uploadsRouter,
  platform: platformRouter,
  watcher: watcherRouter,
  storage: storageRouter,
});

export type AppRouter = typeof appRouter;
