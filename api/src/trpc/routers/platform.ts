import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  syncYoutubeMetadata,
  syncMixcloudMetadata,
  setYoutubePublic,
  getYoutubePrivacyStatus,
} from '../../services/platform-metadata';
import { removeArchiveMediaLink } from '../../services/shows-api';

// Managing an already-published platform link (from the archive + upload form):
// push metadata, flip YouTube to public, read its privacy status, or un-link.
// tRPC mirror of the /api/uploads/platform/* REST endpoints, same services.
export const platformRouter = router({
  // Push the current metadata (+ cover to MixCloud) to one platform. The service
  // returns an error string (never throws), surfaced as { error }.
  update: protectedProcedure
    .input(
      z.object({
        platform: z.enum(['youtube', 'mixcloud']),
        url: z.string().url(),
        title: z.string().min(1),
        description: z.string().default(''),
        tags: z.array(z.string()).default([]),
        imageUrl: z.string().url().nullable().default(null),
      })
    )
    .mutation(async ({ input }) => {
      const { platform, url, imageUrl, ...edit } = input;
      const error =
        platform === 'youtube'
          ? await syncYoutubeMetadata(url, edit)
          : await syncMixcloudMetadata(url, edit, imageUrl);
      return { error };
    }),

  // Read a video's real privacy status (public/unlisted/private) so the UI can
  // hide "set public" once it's actually public.
  youtubeStatus: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .query(async ({ input }) => getYoutubePrivacyStatus(input.url)),

  // Flip a published YouTube video to public (needs the force-ssl scope). Scalar
  // input so the call site stays `setPublic.mutate(url)`.
  setPublic: protectedProcedure.input(z.string().url()).mutation(async ({ input }) => {
    const error = await setYoutubePublic(input);
    return { error };
  }),

  // Un-link a platform from the archive record (does NOT delete the video/cast).
  removeLink: protectedProcedure
    .input(z.object({ showId: z.string().min(1), label: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        await removeArchiveMediaLink(input.showId, input.label);
        return { ok: true };
      } catch (err) {
        console.error('Failed to remove media link:', err);
        throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Failed to remove link' });
      }
    }),
});
