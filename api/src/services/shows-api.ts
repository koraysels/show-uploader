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
let cachedTokenAt = 0;
// Re-auth well within PocketBase's token lifetime. Crucially, an EXPIRED token is
// treated by PB as anonymous — draft reads/writes then come back 404/400 (not
// 401/403), so the "retry on 401/403" path never fires and a long-lived process
// would stay stuck as anonymous. A short TTL sidesteps that entirely.
const TOKEN_TTL_MS = 15 * 60 * 1000;

// Fresh cached token, or a newly authenticated one.
async function getToken(): Promise<string> {
  if (cachedToken && Date.now() - cachedTokenAt < TOKEN_TTL_MS) return cachedToken;
  return authenticate();
}

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
  cachedTokenAt = Date.now();
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
  let token = await getToken();
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
  // Genre record IDs — the archive record's tag relation. Resolve free-text tag
  // names to IDs with resolveGenreIds() before passing them here.
  genres?: string[];
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

async function pbFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = (token: string) => ({ ...(init?.headers ?? {}), Authorization: token });
  let token = await getToken();
  let res = await fetch(`${pbBase}${path}`, { ...init, headers: headers(token) });
  if (res.status === 401 || res.status === 403) {
    token = await authenticate();
    res = await fetch(`${pbBase}${path}`, { ...init, headers: headers(token) });
  }
  return res;
}

// All genre names, for tag autocomplete in the UI.
export async function listGenres(): Promise<string[]> {
  const res = await pbFetch(`/api/collections/genres/records?perPage=500&sort=name&fields=name`);
  if (!res.ok) throw new Error(`PocketBase genres error: ${res.status}`);
  const body = (await res.json()) as { items: { name: string }[] };
  return body.items.map((g) => g.name).filter(Boolean);
}

// Map free-text tag names to genre record IDs so the archive's `genres` relation
// mirrors the tags exactly. PocketBase is the master list: unknown tags become
// new genre records. Matching is case-insensitive on name; a failed create is
// logged and skipped (never aborts the surrounding write-back).
export async function resolveGenreIds(names: string[]): Promise<string[]> {
  // Dedup case-insensitively (matching below is case-insensitive too), so "House"
  // and "house" don't resolve to the same genre id twice.
  const seen = new Set<string>();
  const wanted: string[] = [];
  for (const raw of names) {
    const n = raw.trim();
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    wanted.push(n);
  }
  if (!wanted.length) return [];

  const listRes = await pbFetch(`/api/collections/genres/records?perPage=500&fields=id,name`);
  const byName = new Map<string, string>();
  if (listRes.ok) {
    const body = (await listRes.json()) as { items: { id: string; name: string }[] };
    for (const g of body.items) byName.set(g.name.toLowerCase(), g.id);
  }

  const ids: string[] = [];
  for (const name of wanted) {
    const key = name.toLowerCase();
    let id = byName.get(key);
    if (!id) {
      const res = await pbFetch(`/api/collections/genres/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug: slugify(name) }),
      });
      if (res.ok) {
        id = ((await res.json()) as { id: string }).id;
        byName.set(key, id);
      } else {
        console.error(`Failed to create genre "${name}": ${res.status} ${await res.text()}`);
        continue;
      }
    }
    ids.push(id);
  }
  return [...new Set(ids)];
}

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

  let token = await getToken();
  let res = await run(token);
  if (res.status === 401 || res.status === 403) {
    token = await authenticate();
    res = await run(token);
  }
  if (!res.ok) {
    throw new Error(`PocketBase archive update failed (${id}): ${res.status} ${await res.text()}`);
  }
}
