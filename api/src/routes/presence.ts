import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { upsertClaim, heartbeatClaim, releaseClaim } from '../db/queries';
import { presenceHub } from '../services/presence-hub';

export const presenceRouter = Router();

// SSE stream: roster + claims. Sends a full snapshot on connect, then pushes
// `roster` / `claims` events on change. The connection itself is the "online"
// signal, so no heartbeat is needed to stay in the roster.
presenceRouter.get('/stream', async (req, res) => {
  const user = req.user!;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const snapshot = await presenceHub.snapshot();
  res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);

  const id = presenceHub.add(user, res);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    presenceHub.remove(id);
  });
});

const ShowIdBody = z.object({ showId: z.string().min(1) });

// Auto-claim (or steal) a show. Durable write, then broadcast so others see it
// within ~1s even though the claim outlives any SSE connection.
presenceRouter.post('/claim', async (req, res) => {
  const parsed = ShowIdBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'showId required' });
  const user = req.user!;
  const claim = await upsertClaim(db, parsed.data.showId, user.sub, user.name);
  void presenceHub.broadcastClaims();
  res.json({ claim });
});

// Keep a claim alive while viewing the item or while an upload for it runs.
presenceRouter.post('/heartbeat', async (req, res) => {
  const parsed = ShowIdBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'showId required' });
  await heartbeatClaim(db, parsed.data.showId, req.user!.sub);
  res.json({ ok: true });
});

// Release if still owned by this user (explicit leave / publish handled elsewhere).
presenceRouter.delete('/claim', async (req, res) => {
  const parsed = ShowIdBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'showId required' });
  await releaseClaim(db, parsed.data.showId, req.user!.sub);
  void presenceHub.broadcastClaims();
  res.json({ ok: true });
});
