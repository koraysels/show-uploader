import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { listShows, listGenres } from '../../services/shows-api';
import { generateMeta } from '../../services/groq';

// tRPC mirror of the plain request/response endpoints in routes/shows.ts. The SSE
// routes stay REST; this router lives ALONGSIDE the Express routes (additive) and
// reuses the exact same services, so behaviour + responses match. All three
// endpoints require the same Zitadel JWT + `member` role that requireAuth
// enforces, so they use protectedProcedure.
export const showsRouter = router({
  // GET /api/shows/genres — full genre vocabulary for tag autocomplete
  // (PocketBase is the master list).
  listGenres: protectedProcedure.query(async () => {
    try {
      return await listGenres();
    } catch (err) {
      console.error('Failed to fetch genres:', err);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch genres',
      });
    }
  }),

  // GET /api/shows — the "to process" list (draft archive records).
  listShows: protectedProcedure.query(async () => {
    try {
      return await listShows();
    } catch (err) {
      console.error('Failed to fetch shows:', err);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch shows',
      });
    }
  }),

  // GET /api/shows/meta?title=&description= — AI-generated upload copy. Never
  // blocks the form on an AI hiccup: falls back to the show's own copy (the REST
  // route always returns 200 here, so this resolver never throws).
  generateMeta: protectedProcedure
    .input(
      z
        .object({
          title: z.string().optional(),
          description: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const title = input?.title ?? '';
      const description = input?.description ?? '';
      try {
        return await generateMeta(title, description);
      } catch (err) {
        // Never block the form on an AI hiccup — fall back to the show's own copy.
        console.error('Groq meta generation failed, using fallback:', err);
        return {
          youtubeDescription: description || title || '',
          mixcloudDescription: description || title || '',
          tags: [] as string[],
        };
      }
    }),
});
