import { env } from '../env';
import type { ArchiveRecord } from '../pocketbase-types';

// Server-side calls prefer the internal host (no NAT hairpin on a single box).
const pbBase = env.POCKETBASE_INTERNAL_URL ?? env.POCKETBASE_URL;

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
function splitDateTime(ts: string | undefined): { date: string; time: string } {
  const [date = '', rest = ''] = (ts ?? '').split(' ');
  return { date, time: rest.slice(0, 5) };
}

type ArchiveItem = Pick<
  ArchiveRecord,
  'id' | 'title' | 'notes' | 'startTime' | 'endTime' | 'image' | 'genres'
> & { collectionId: string };

export function toAgendaShow(rec: ArchiveItem): AgendaShow {
  const start = splitDateTime(rec.startTime);
  const end = splitDateTime(rec.endTime);
  return {
    id: rec.id,
    title: rec.title ?? '',
    description: rec.notes ?? '',
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    imageUrl: rec.image
      ? `${env.POCKETBASE_URL}/api/files/${rec.collectionId}/${rec.id}/${rec.image}`
      : null,
    tags: rec.genres && rec.genres.length ? rec.genres : null,
  };
}

// Draft archive records are gated behind superuser auth, so we hold a token and
// re-authenticate on demand (and once on a 401).
let cachedToken: string | null = null;

async function authenticate(): Promise<string> {
  if (!env.PB_SERVICE_EMAIL || !env.PB_SERVICE_PASSWORD) {
    throw new Error('PB_SERVICE_EMAIL / PB_SERVICE_PASSWORD required to read archive drafts');
  }
  const res = await fetch(`${pbBase}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: env.PB_SERVICE_EMAIL, password: env.PB_SERVICE_PASSWORD }),
  });
  if (!res.ok) throw new Error(`PocketBase auth failed: ${res.status}`);
  const { token } = (await res.json()) as { token: string };
  cachedToken = token;
  return token;
}

async function fetchDrafts(token: string): Promise<Response> {
  const filter = `(status='draft')`;
  const fields = 'id,title,notes,startTime,endTime,image,genres,collectionId';
  const url =
    `${pbBase}/api/collections/archive/records` +
    `?perPage=200&sort=-startTime&fields=${fields}&filter=${encodeURIComponent(filter)}`;
  return fetch(url, { headers: { Authorization: token } });
}

/**
 * The "to process" list: draft records in the PocketBase `archive` collection —
 * past shows whose recording still needs uploading. Requires superuser auth.
 */
export async function listShows(): Promise<AgendaShow[]> {
  let token = cachedToken ?? (await authenticate());
  let res = await fetchDrafts(token);
  if (res.status === 401 || res.status === 403) {
    token = await authenticate();
    res = await fetchDrafts(token);
  }
  if (!res.ok) throw new Error(`PocketBase archive error: ${res.status}`);
  const body = (await res.json()) as { items: ArchiveItem[] };
  return body.items.map(toAgendaShow);
}

// One entry in the archive record's `mediaLinks` JSON array, matching the shape
// the agenda site already stores/renders, e.g. { label:'YouTube', type:'video', url }.
export type MediaLink = { label: string; type: string; url: string };

export type ArchivePatch = {
  title?: string;
  notes?: string;
  mediaLinks?: MediaLink[];
};

/**
 * Write the published result back onto a draft archive record: the platform
 * links (mediaLinks) plus any metadata the operator finalised (title, notes).
 * Deliberately never touches `status` — a human flips draft→published in the
 * agenda admin after reviewing. Uses the same superuser auth as listShows.
 */
export async function updateArchiveRecord(id: string, patch: ArchivePatch): Promise<void> {
  const body = JSON.stringify(patch);
  const patchOnce = (token: string) =>
    fetch(`${pbBase}/api/collections/archive/records/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body,
    });

  let token = cachedToken ?? (await authenticate());
  let res = await patchOnce(token);
  if (res.status === 401 || res.status === 403) {
    token = await authenticate();
    res = await patchOnce(token);
  }
  if (!res.ok) {
    throw new Error(`PocketBase archive update failed (${id}): ${res.status} ${await res.text()}`);
  }
}
