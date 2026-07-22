import { router } from './trpc';
import { showsRouter } from './routers/shows';

// tRPC lives ALONGSIDE the Express REST routes so the client adopts it
// incrementally. `shows` is the first fully-migrated domain (list/genres/meta/
// covers/get/sync-platforms). The uploads/multipart/watcher scaffolds + the
// SSE streams (events, presence) are migrated in later phases — file-upload +
// SSE endpoints stay REST where they don't fit tRPC's batch link.
export const appRouter = router({
  shows: showsRouter,
});

export type AppRouter = typeof appRouter;
