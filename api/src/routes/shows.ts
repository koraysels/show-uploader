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
  try {
    const { title, description } = req.query as Record<string, string>;
    const meta = await generateMeta(title ?? '', description ?? '');
    res.json(meta);
  } catch {
    res.status(502).json({ error: 'Failed to generate metadata' });
  }
});
