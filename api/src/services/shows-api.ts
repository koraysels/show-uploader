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
  // Links already on the record (YouTube/MixCloud), so the UI can show what's
  // published and pre-select only the missing platform on a re-publish.
  mediaLinks: MediaLink[];
};

// PocketBase serialises datetimes as "YYYY-MM-DD HH:MM:SS.sssZ".
function splitDateTime(ts: string | undefined): { date: string; time: string } {
  const [date = '', rest = ''] = (ts ?? '').split(' ');
  return { date, time: rest.slice(0, 5) };
}

type ArchiveItem = Pick<
  ArchiveRecord,
  'id' | 'title' | 'notes' | 'startTime' | 'endTime' | 'image' | 'genres' | 'mediaLinks'
> & { collectionId: string; expand?: { genres?: { name: string }[] } };

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
    // Genres are a relation; use the expanded names (not the raw record IDs).
    tags: rec.expand?.genres?.length ? rec.expand.genres.map((g) => g.name).filter(Boolean) : null,
    mediaLinks: Array.isArray(rec.mediaLinks) ? (rec.mediaLinks as MediaLink[]) : [],
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
  const fields = 'id,title,notes,startTime,endTime,image,genres,mediaLinks,collectionId,expand.genres.name';
  const url =
    `${pbBase}/api/collections/archive/records` +
    `?perPage=200&sort=-startTime&expand=genres&fields=${fields}&filter=${encodeURIComponent(filter)}`;
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

// Merge incoming links into the existing ones by label: an incoming link
// replaces a same-label entry and others are kept. So publishing MixCloud onto a
// record that already has a YouTube link keeps both, rather than clobbering it.
function mergeMediaLinks(existing: MediaLink[], incoming: MediaLink[]): MediaLink[] {
  const byLabel = new Map(existing.map((l) => [l.label, l]));
  for (const l of incoming) byLabel.set(l.label, l);
  return [...byLabel.values()];
}

/**
 * Write the published result back onto a draft archive record: the platform
 * links (mediaLinks) plus any metadata the operator finalised (title, notes).
 * mediaLinks are MERGED with whatever's already on the record (so you can add a
 * second platform later); title/notes overwrite. Deliberately never touches
 * `status` — a human flips draft→published in the agenda admin after reviewing.
 * Uses the same superuser auth as listShows.
 */
export async function updateArchiveRecord(id: string, patch: ArchivePatch): Promise<void> {
  const recUrl = `${pbBase}/api/collections/archive/records/${id}`;

  const run = async (token: string): Promise<Response> => {
    let mediaLinks = patch.mediaLinks;
    if (mediaLinks && mediaLinks.length) {
      const cur = await fetch(`${recUrl}?fields=mediaLinks`, { headers: { Authorization: token } });
      if (cur.ok) {
        const existing = (await cur.json()).mediaLinks as MediaLink[] | null;
        mediaLinks = mergeMediaLinks(Array.isArray(existing) ? existing : [], mediaLinks);
      }
    }
    return fetch(recUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({ ...patch, ...(mediaLinks ? { mediaLinks } : {}) }),
    });
  };

  let token = cachedToken ?? (await authenticate());
  let res = await run(token);
  if (res.status === 401 || res.status === 403) {
    token = await authenticate();
    res = await run(token);
  }
  if (!res.ok) {
    throw new Error(`PocketBase archive update failed (${id}): ${res.status} ${await res.text()}`);
  }
}
