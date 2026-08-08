/**
 * Offline mock backend for UI work — dev only.
 *
 * Run `pnpm dev` and open `/?mock=1` to get the whole app driven by fixtures:
 * no API, no database, no Zitadel, and no chance of a stray click mutating a
 * real record. It exists so layout and interaction can be checked at real
 * viewport sizes (which is where the mobile problems actually live) without
 * pointing a browser at production.
 *
 * It is loaded by a dynamic import behind `import.meta.env.DEV` in main.tsx, so
 * none of this — including the fixtures — reaches the production bundle.
 */

import { shows, uploads, archiveStates, genres, videoInfo } from './fixtures';

// tRPC batch responses are positional: one entry per procedure in the URL.
// There is no real file to play in mock mode. A data: URI keeps the <video>
// element inert and quiet — a blob:/http: placeholder makes the browser log a
// scary "not allowed to load local resource" that reads like an app bug.
const MOCK_VIDEO_URL = 'data:video/mp4;base64,';
// Number of status polls spent "converting" before the preview turns ready, so
// the progress UI is reachable in mock mode.
const MOCK_CONVERT_POLLS = 4;
let previewPolls = 0;

function trpcBody(datas: unknown[]) {
  return JSON.stringify(datas.map((data) => ({ result: { data } })));
}

function resolve(proc: string, input: unknown): unknown {
  const arg = (input ?? {}) as Record<string, string>;
  switch (proc) {
    case 'shows.listShows':
      return shows;
    case 'shows.listGenres':
      return genres;
    case 'shows.listStates':
      return archiveStates;
    case 'shows.get':
      return shows.find((s) => s.id === arg.id) ?? null;
    case 'shows.generateMeta':
      return {
        youtubeDescription: 'Recorded live at coming soon. Two hours of talk, requests and tape hiss.',
        mixcloudDescription: 'Recorded live at coming soon.',
        tags: ['talk', 'community', 'live'],
      };
    case 'shows.saveMetadata':
      return { ok: true };
    case 'shows.syncPlatforms':
      return { results: { youtube: 'ok', mixcloud: 'ok' } };
    case 'uploads.list':
      return uploads;
    case 'uploads.getStagedShowIds':
      return ['show_dubplate'];
    case 'uploads.getStaged':
      return arg.showId === 'show_dubplate'
        ? { s3_key: 'staged/dubplate.mkv', filename: 'dubplate-2026-07-20.mkv' }
        : null;
    case 'uploads.getUploadingProgress':
      return [{ show_id: 'show_latenight', pct: 37 }];
    case 'uploads.videoInfo':
      return videoInfo[arg.uploadId] ?? { exists: false, size: null, filename: 'unknown' };
    case 'uploads.getJinglePreview':
      return { url: '' };
    // Walks the real state machine: the first poll reports converting, and after
    // a few it flips to ready — so the progress UI and the player are both
    // reachable without ffmpeg, redis or s3.
    case 'uploads.startPreview':
      previewPolls = 0;
      return { state: 'working', pct: 0 };
    case 'uploads.previewStatus': {
      if (/\.mp4$/i.test(String(arg.videoS3Key))) {
        return { state: 'ready', key: arg.videoS3Key, url: MOCK_VIDEO_URL };
      }
      previewPolls += 1;
      if (previewPolls < MOCK_CONVERT_POLLS) {
        return { state: 'working', pct: Math.round((previewPolls / MOCK_CONVERT_POLLS) * 100), url: null };
      }
      return { state: 'ready', key: 'staged/dubplate.mp4', url: MOCK_VIDEO_URL };
    }
    case 'uploads.deleteStaged':
      return { ok: true };
    case 'uploads.create':
      return { uploadId: 'upl_running' };
    case 'uploads.deleteUpload':
      return { ok: true, stillRunning: 1 };
    case 'uploads.publishRecord':
    case 'uploads.unpublishRecord':
      return { ok: true };
    case 'uploads.remuxBackfill':
      return { enqueued: 1 };
    case 'uploads.generateAudio':
      return { ok: true };
    case 'watcher.pending':
      return [
        { id: 'pv1', s3_key: 'dropfolder/obs-2026-07-31.mkv', filename: 'obs-2026-07-31.mkv', size_bytes: 2_293_760_000 },
        { id: 'pv2', s3_key: 'dropfolder/obs-2026-07-28.mkv', filename: 'obs-2026-07-28.mkv', size_bytes: 1_500_000_000 },
      ];
    case 'watcher.claim':
      return { ok: true };
    case 'platform.youtubeStatus':
      return { privacyStatus: 'unlisted' };
    case 'platform.update':
    case 'platform.setPublic':
    case 'platform.removeLink':
      return { ok: true };
    default:
      console.warn(`[mock] unhandled tRPC procedure: ${proc}`);
      return null;
  }
}

const json = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });

export function install() {
  // A fake signed-in user, written where oidc-client-ts looks for it, so the
  // real AuthProvider loads it without any auth-specific branch in app code.
  const authority = `https://${import.meta.env.VITE_ZITADEL_DOMAIN}`;
  const clientId = import.meta.env.VITE_ZITADEL_CLIENT_ID ?? 'mock-client';
  // localStorage, matching the userStore AuthProvider now configures — writing
  // to sessionStorage would leave the real UserManager seeing no session.
  localStorage.setItem(
    `oidc.user:${authority}:${clientId}`,
    JSON.stringify({
      access_token: 'mock-token',
      token_type: 'Bearer',
      scope: 'openid profile email',
      profile: { sub: 'mock-operator', name: 'Dev Operator', email: 'dev@example.invalid' },
      // Far enough out that the silent-renew timer never fires during a session.
      expires_at: Math.floor(Date.now() / 1000) + 86_400,
    })
  );

  // Presence/job streams: a stub that connects and says nothing, rather than a
  // console full of failed EventSource retries.
  class MockEventSource extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 2;
    readyState = 1;
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;
    onopen: ((e: Event) => void) | null = null;
    close() {
      this.readyState = 2;
    }
  }
  window.EventSource = MockEventSource as unknown as typeof EventSource;

  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url, location.origin);

    if (!url.pathname.startsWith('/api/')) return realFetch(input as RequestInfo, init);

    if (url.pathname.startsWith('/api/trpc/')) {
      const procs = url.pathname.slice('/api/trpc/'.length).split(',');
      let inputs: Record<string, unknown> = {};
      if (req.method === 'GET') {
        try {
          inputs = JSON.parse(url.searchParams.get('input') ?? '{}');
        } catch {
          inputs = {};
        }
      } else {
        try {
          inputs = JSON.parse(await req.text());
        } catch {
          inputs = {};
        }
      }
      // Mutations arrive one per request; queries batch. Either way the keys are
      // positional indices.
      const data = procs.map((p, i) => resolve(p, inputs[String(i)] ?? inputs));
      console.info(`[mock] ${req.method} ${procs.join(', ')}`);
      return json(trpcBody(data));
    }

    if (url.pathname.startsWith('/api/auth')) return json(JSON.stringify({ ok: true, roles: ['member'] }));
    if (url.pathname.startsWith('/api/presence')) return json(JSON.stringify({ ok: true }));

    console.warn(`[mock] unhandled REST call: ${req.method} ${url.pathname}`);
    return json(JSON.stringify({ ok: true }));
  };

  console.info('[mock] offline fixtures installed — no real backend is being called');
}
