import { Router } from 'express';
import { listShows } from '../services/shows-api';
import { generateMeta } from '../services/groq';

export const showsRouter = Router();

showsRouter.get('/', async (_req, res) => {
  try {
    const shows = await listShows();
    res.json(shows);
  } catch {
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
