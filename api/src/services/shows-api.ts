import { env } from '../env';
import type { EpisodesRecord } from '../pocketbase-types';

export type AgendaShow = {
  id: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  imageUrl: string | null;
  tags: string[] | null;
};

// PocketBase serialises datetimes as "YYYY-MM-DD HH:MM:SS.sssZ".
function splitDateTime(ts: string): { date: string; time: string } {
  const [date = '', rest = ''] = ts.split(' ');
  return { date, time: rest.slice(0, 5) };
}

type EpisodeItem = Pick<
  EpisodesRecord,
  'id' | 'title' | 'notes' | 'startTime' | 'endTime' | 'image' | 'genres'
> & { collectionId: string };

export function toAgendaShow(ep: EpisodeItem): AgendaShow {
  const start = splitDateTime(ep.startTime);
  const end = splitDateTime(ep.endTime);
  return {
    id: ep.id,
    title: ep.title ?? '',
    description: ep.notes ?? '',
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    imageUrl: ep.image
      ? `${env.POCKETBASE_URL}/api/files/${ep.collectionId}/${ep.id}/${ep.image}`
      : null,
    tags: ep.genres && ep.genres.length ? ep.genres : null,
  };
}

// Read the schedule from PocketBase `episodes`, same source/format as the
// live-guard (see live-guard.ts). Returns dated occurrences newest-first.
export async function listShows(): Promise<AgendaShow[]> {
  const fields = 'id,title,notes,startTime,endTime,image,genres,collectionId';
  const url =
    `${env.POCKETBASE_URL}/api/collections/episodes/records` +
    `?perPage=100&sort=-startTime&fields=${fields}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PocketBase episodes error: ${res.status}`);
  const body = (await res.json()) as { items: EpisodeItem[] };
  return body.items.map(toAgendaShow);
}
