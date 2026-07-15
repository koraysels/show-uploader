import { Router } from 'express';
import { listShows, listGenres } from '../services/shows-api';
import { generateMeta } from '../services/groq';

export const showsRouter = Router();

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
