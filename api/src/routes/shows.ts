import { Router, raw } from 'express';
import { listShows, listGenres, uploadArchiveImage, clearArchiveImage, listArchiveCovers } from '../services/shows-api';
import { generateMeta } from '../services/groq';

export const showsRouter = Router();

// Cover URL per archive record (all statuses) for thumbnails — keyed by show_id.
showsRouter.get('/covers', async (_req, res) => {
  try {
    res.json(await listArchiveCovers());
  } catch (err) {
    console.error('Failed to fetch covers:', err);
    res.status(502).json({ error: 'Failed to fetch covers' });
  }
});

// Cover image = the archive record's `image` field in PocketBase (the master).
// The browser can't hold PB creds, so it POSTs the raw image bytes here and the
// api proxies them into PB. No S3 involved. 15 MiB cap — covers are small.
showsRouter.post('/:id/cover', raw({ type: () => true, limit: '15mb' }), async (req, res) => {
  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || body.length === 0) return res.status(400).json({ error: 'Empty image body' });
  const contentType = req.headers['content-type'] ?? 'image/jpeg';
  if (!contentType.startsWith('image/')) return res.status(400).json({ error: 'Not an image' });
  const filename = `cover.${contentType.split('/')[1]?.split(';')[0] || 'jpg'}`;
  try {
    const imageUrl = await uploadArchiveImage(req.params.id, body, filename, contentType);
    res.json({ imageUrl });
  } catch (err) {
    console.error('Failed to upload cover:', err);
    res.status(502).json({ error: 'Failed to upload cover' });
  }
});

showsRouter.delete('/:id/cover', async (req, res) => {
  try {
    await clearArchiveImage(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to clear cover:', err);
    res.status(502).json({ error: 'Failed to clear cover' });
  }
});

// Full genre vocabulary for tag autocomplete (PocketBase is the master list).
showsRouter.get('/genres', async (_req, res) => {
  try {
    res.json(await listGenres());
  } catch (err) {
    console.error('Failed to fetch genres:', err);
    res.status(502).json({ error: 'Failed to fetch genres' });
  }
});

showsRouter.get('/', async (_req, res) => {
  try {
    const shows = await listShows();
    res.json(shows);
  } catch (err) {
    console.error('Failed to fetch shows:', err);
    res.status(502).json({ error: 'Failed to fetch shows' });
  }
});

showsRouter.get('/meta', async (req, res) => {
  const { title, description } = req.query as Record<string, string>;
  try {
    const meta = await generateMeta(title ?? '', description ?? '');
    res.json(meta);
  } catch (err) {
    // Never block the form on an AI hiccup — fall back to the show's own copy.
    console.error('Groq meta generation failed, using fallback:', err);
    res.json({
      youtubeDescription: description || title || '',
      mixcloudDescription: description || title || '',
      tags: [],
    });
  }
});
