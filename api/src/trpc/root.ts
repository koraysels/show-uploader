import { router } from './trpc';

// Empty root for now. Sub-routers (shows, uploads, presence, watcher) get added
// in the next phase — tRPC lives ALONGSIDE the existing Express REST routes so
// the client can adopt it incrementally.
export const appRouter = router({});

export type AppRouter = typeof appRouter;
