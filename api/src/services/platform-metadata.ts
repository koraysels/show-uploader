import { env } from '../env';

// Edit already-published metadata (title/description/tags) in place on each
// platform — no re-upload. Called when an operator changes an archive record.
// Every function returns null on success or an error string (never throws), so
// one platform failing doesn't abort the others or the DB write.

export type MetaEdit = { title: string; description: string; tags: string[] };

// https://www.youtube.com/watch?v=<id>  ->  <id>
function youtubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get('v') ?? (u.pathname.startsWith('/watch') ? null : u.pathname.slice(1) || null);
  } catch {
    return null;
  }
}

// https://www.mixcloud.com/<user>/<slug>/  ->  /<user>/<slug>/  (the cloudcast key)
function mixcloudKey(url: string): string | null {
  try {
    const p = new URL(url).pathname;
    return p.endsWith('/') ? p : `${p}/`;
  } catch {
    return null;
  }
}

async function youtubeAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID ?? '',
      client_secret: env.YOUTUBE_CLIENT_SECRET ?? '',
      refresh_token: env.YOUTUBE_REFRESH_TOKEN ?? '',
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`token exchange ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('no access_token');
  return data.access_token;
}

export async function syncYoutubeMetadata(url: string, edit: MetaEdit): Promise<string | null> {
  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_REFRESH_TOKEN) return 'YouTube not configured';
  const id = youtubeVideoId(url);
  if (!id) return `couldn't parse video id from ${url}`;
  try {
    const token = await youtubeAccessToken();
    // videos.update replaces the whole snippet, so categoryId must be re-sent.
    const res = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        snippet: { title: edit.title, description: edit.description, tags: edit.tags, categoryId: '10' },
      }),
    });
    if (!res.ok) return `YouTube update ${res.status}: ${await res.text()}`;
    return null;
  } catch (err) {
    return `YouTube: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function syncMixcloudMetadata(url: string, edit: MetaEdit): Promise<string | null> {
  if (!env.MIXCLOUD_ACCESS_TOKEN) return 'MixCloud not configured';
  const key = mixcloudKey(url);
  if (!key) return `couldn't parse cloudcast key from ${url}`;
  try {
    // POST /upload/<user>/<slug>/edit/ — tags are all-or-nothing, so re-send them.
    const body = new URLSearchParams({ name: edit.title, description: edit.description });
    edit.tags.slice(0, 5).forEach((tag, i) => body.append(`tags-${i}-tag`, tag));
    const res = await fetch(
      `https://api.mixcloud.com/upload${key}edit/?access_token=${encodeURIComponent(env.MIXCLOUD_ACCESS_TOKEN)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
    );
    if (!res.ok) return `MixCloud edit ${res.status}: ${await res.text()}`;
    const data = (await res.json()) as { error?: { message: string } };
    if (data.error) return `MixCloud: ${data.error.message}`;
    return null;
  } catch (err) {
    return `MixCloud: ${err instanceof Error ? err.message : String(err)}`;
  }
}
