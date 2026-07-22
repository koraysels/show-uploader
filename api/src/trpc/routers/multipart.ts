import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../../db/client';
import {
  createMultipart,
  presignUploadPart,
  listUploadedParts,
  completeMultipart,
  abortMultipart,
} from '../../services/s3';
import { upsertStagedUpload } from '../../db/queries';
import { PART_SIZE } from '../../routes/multipart';
import { router, protectedProcedure } from '../trpc';

// Mirror of the Express multipart route (api/src/routes/multipart.ts) as tRPC v11
// procedures. Same zod validation, the same S3 service calls, and the same db
// queries — only the transport differs. SSE/event-stream endpoints stay REST and
// are intentionally not represented here. This router lives ALONGSIDE the REST
// routes; neither replaces the other.

type Session = {
  id: string;
  show_id: string | null;
  s3_key: string;
  s3_upload_id: string;
  filename: string;
  size_bytes: string;
  content_type: string;
  part_size: number;
  status: string;
};

async function getSession(id: string): Promise<Session | null> {
  const rows = await db<Session[]>`SELECT * FROM multipart_uploads WHERE id = ${id}`;
  return rows[0] ?? null;
}

const CreateSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
  // The show this upload belongs to — bound from the start so completion can
  // record the staged video server-side. Optional so a stale (pre-deploy) client
  // that doesn't send it still uploads instead of hard-failing.
  showId: z.string().min(1).optional(),
});

export const multipartRouter = router({
  // Start a session: create the S3 multipart upload and persist it. (REST: POST
  // /api/uploads/multipart/create — 201 { sessionId, key, partSize, partCount }.)
  create: protectedProcedure.input(CreateSchema).mutation(async ({ input }) => {
    const { filename, contentType, size, showId } = input;
    const key = `uploads/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    try {
      const uploadId = await createMultipart(key, contentType);
      const rows = await db<{ id: string }[]>`
        INSERT INTO multipart_uploads (show_id, s3_key, s3_upload_id, filename, size_bytes, content_type, part_size)
        VALUES (${showId ?? null}, ${key}, ${uploadId}, ${filename}, ${size}, ${contentType}, ${PART_SIZE})
        RETURNING id
      `;
      return {
        sessionId: rows[0].id,
        key,
        partSize: PART_SIZE,
        partCount: Math.max(1, Math.ceil(size / PART_SIZE)),
      };
    } catch (err) {
      console.error('multipart create failed:', err);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to start multipart upload',
      });
    }
  }),

  // Resume info: which part numbers already landed (server is source of truth).
  // (REST: GET /api/uploads/multipart/:sessionId — 404 unknown session.)
  status: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const s = await getSession(input.sessionId);
      if (!s) throw new TRPCError({ code: 'NOT_FOUND', message: 'Unknown session' });
      try {
        const parts =
          s.status === 'in_progress' ? await listUploadedParts(s.s3_key, s.s3_upload_id) : [];
        return {
          sessionId: s.id,
          key: s.s3_key,
          filename: s.filename,
          size: Number(s.size_bytes),
          contentType: s.content_type,
          partSize: s.part_size,
          status: s.status,
          uploadedParts: parts.map((p) => ({ partNumber: p.PartNumber, size: p.Size })),
        };
      } catch (err) {
        console.error('multipart status failed:', err);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to read session' });
      }
    }),

  // Presigned URL to PUT a single part. Invalid part numbers (outside 1..10000)
  // are rejected by zod as BAD_REQUEST, mirroring the REST 400. (REST: POST
  // /api/uploads/multipart/:sessionId/part/:n — 404 if session not in_progress.)
  partUrl: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        n: z.number().int().min(1).max(10000),
      })
    )
    .mutation(async ({ input }) => {
      const s = await getSession(input.sessionId);
      if (!s || s.status !== 'in_progress') {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not open' });
      }
      try {
        const url = await presignUploadPart(s.s3_key, s.s3_upload_id, input.n);
        return { url };
      } catch (err) {
        console.error('presign part failed:', err);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to presign part' });
      }
    }),

  // Finish: server gathers ETags via ListParts, completes the object, and — the
  // key robustness point — records the staged video against the show ATOMICALLY
  // here. Idempotent: a session already completed just returns its key. (REST:
  // POST /api/uploads/multipart/:sessionId/complete — 404 unknown session.)
  complete: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      const s = await getSession(input.sessionId);
      if (!s) throw new TRPCError({ code: 'NOT_FOUND', message: 'Unknown session' });
      if (s.status === 'completed') return { key: s.s3_key };
      try {
        await completeMultipart(s.s3_key, s.s3_upload_id);
        await db`UPDATE multipart_uploads SET status = 'completed', completed_at = now() WHERE id = ${s.id}`;
        if (s.show_id) {
          await upsertStagedUpload(db, s.show_id, s.s3_key, s.filename, Number(s.size_bytes));
        }
        return { key: s.s3_key };
      } catch (err) {
        console.error('multipart complete failed:', err);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to complete upload',
        });
      }
    }),

  // Cancel: abort the S3 upload and mark the session. (REST: POST
  // /api/uploads/multipart/:sessionId/abort — 404 unknown session.)
  abort: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      const s = await getSession(input.sessionId);
      if (!s) throw new TRPCError({ code: 'NOT_FOUND', message: 'Unknown session' });
      try {
        if (s.status === 'in_progress') await abortMultipart(s.s3_key, s.s3_upload_id);
        await db`UPDATE multipart_uploads SET status = 'aborted' WHERE id = ${s.id}`;
        return { ok: true as const };
      } catch (err) {
        console.error('multipart abort failed:', err);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to abort upload' });
      }
    }),
});
