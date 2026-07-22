import { router } from './trpc';
import { showsRouter } from './routers/shows';
import { uploadsRouter } from './routers/uploads';
import { platformRouter } from './routers/platform';

// tRPC lives ALONGSIDE the Express REST routes so the client adopts it
// incrementally. Migrated so far: `shows` (full), `uploads` (read: list/get) and
// `platform` (update/youtube-status/set-public/remove). The upload create/retry/
// metadata mutations, the multipart flow and the SSE streams (events, presence)
// stay REST for now — file uploads + SSE don't fit tRPC's batch link.
export const appRouter = router({
  shows: showsRouter,
  uploads: uploadsRouter,
  platform: platformRouter,
});

export type AppRouter = typeof appRouter;
