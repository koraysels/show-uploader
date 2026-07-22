import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db/client';
import { listUploadsWithJobs, getUploadWithJobs } from '../../db/queries';
import { withDownloadUrls } from '../../services/upload-urls';

// tRPC mirror of the read endpoints in routes/uploads.ts (list + get). The
// create/retry/publish/metadata mutations, the multipart flow and the SSE event
// stream stay REST for now — file uploads + SSE don't fit tRPC's batch link.
export const uploadsRouter = router({
  // GET /api/uploads — every upload with its jobs + presigned download URLs.
  list: protectedProcedure.query(async () => {
    try {
      const uploads = await listUploadsWithJobs(db);
      return await Promise.all(uploads.map(withDownloadUrls));
    } catch (err) {
      console.error('Failed to list uploads:', err);
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list uploads' });
    }
  }),

  // GET /api/uploads/:id — one upload with its jobs + download URLs.
  get: protectedProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ input }) => {
    try {
      const upload = await getUploadWithJobs(db, input.id);
      if (!upload) throw new TRPCError({ code: 'NOT_FOUND', message: 'Not found' });
      return await withDownloadUrls(upload);
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      console.error('Failed to get upload:', err);
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get upload' });
    }
  }),
});
