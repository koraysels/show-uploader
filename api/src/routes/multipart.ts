import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import {
  createMultipart,
  presignUploadPart,
  listUploadedParts,
  completeMultipart,
  abortMultipart,
} from '../services/s3';

export const multipartRouter = Router();

// 16 MiB parts: well above S3's 5 MiB minimum, few enough requests for large
// files, small enough that a failed part is cheap to retry.
export const PART_SIZE = 16 * 1024 * 1024;

type Session = {
  id: string;
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
});

// Start a session: create the S3 multipart upload and persist it.
multipartRouter.post('/create', async (req, res) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body' });
  const { filename, contentType, size } = parsed.data;
  const key = `uploads/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  try {
    const uploadId = await createMultipart(key, contentType);
    const rows = await db<{ id: string }[]>`
      INSERT INTO multipart_uploads (s3_key, s3_upload_id, filename, size_bytes, content_type, part_size)
      VALUES (${key}, ${uploadId}, ${filename}, ${size}, ${contentType}, ${PART_SIZE})
      RETURNING id
    `;
    res.status(201).json({
      sessionId: rows[0].id,
      key,
      partSize: PART_SIZE,
      partCount: Math.max(1, Math.ceil(size / PART_SIZE)),
    });
  } catch (err) {
    console.error('multipart create failed:', err);
    res.status(500).json({ error: 'Failed to start multipart upload' });
  }
});

// Resume info: which part numbers already landed (server is source of truth).
multipartRouter.get('/:sessionId', async (req, res) => {
  const s = await getSession(req.params.sessionId);
  if (!s) return res.status(404).json({ error: 'Unknown session' });
  try {
    const parts = s.status === 'in_progress' ? await listUploadedParts(s.s3_key, s.s3_upload_id) : [];
    res.json({
      sessionId: s.id,
      key: s.s3_key,
      filename: s.filename,
      size: Number(s.size_bytes),
      contentType: s.content_type,
      partSize: s.part_size,
      status: s.status,
      uploadedParts: parts.map((p) => ({ partNumber: p.PartNumber, size: p.Size })),
    });
  } catch (err) {
    console.error('multipart status failed:', err);
    res.status(500).json({ error: 'Failed to read session' });
  }
});

// Presigned URL to PUT a single part.
multipartRouter.post('/:sessionId/part/:n', async (req, res) => {
  const partNumber = Number(req.params.n);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
    return res.status(400).json({ error: 'Invalid part number' });
  }
  const s = await getSession(req.params.sessionId);
  if (!s || s.status !== 'in_progress') return res.status(404).json({ error: 'Session not open' });
  try {
    const url = await presignUploadPart(s.s3_key, s.s3_upload_id, partNumber);
    res.json({ url });
  } catch (err) {
    console.error('presign part failed:', err);
    res.status(500).json({ error: 'Failed to presign part' });
  }
});

// Finish: server gathers ETags via ListParts and completes the object.
multipartRouter.post('/:sessionId/complete', async (req, res) => {
  const s = await getSession(req.params.sessionId);
  if (!s) return res.status(404).json({ error: 'Unknown session' });
  if (s.status === 'completed') return res.json({ key: s.s3_key });
  try {
    await completeMultipart(s.s3_key, s.s3_upload_id);
    await db`UPDATE multipart_uploads SET status = 'completed', completed_at = now() WHERE id = ${s.id}`;
    res.json({ key: s.s3_key });
  } catch (err) {
    console.error('multipart complete failed:', err);
    res.status(500).json({ error: 'Failed to complete upload' });
  }
});

// Cancel: abort the S3 upload and mark the session.
multipartRouter.post('/:sessionId/abort', async (req, res) => {
  const s = await getSession(req.params.sessionId);
  if (!s) return res.status(404).json({ error: 'Unknown session' });
  try {
    if (s.status === 'in_progress') await abortMultipart(s.s3_key, s.s3_upload_id);
    await db`UPDATE multipart_uploads SET status = 'aborted' WHERE id = ${s.id}`;
    res.json({ ok: true });
  } catch (err) {
    console.error('multipart abort failed:', err);
    res.status(500).json({ error: 'Failed to abort upload' });
  }
});
