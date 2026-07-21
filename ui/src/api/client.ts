import type { User } from 'oidc-client-ts';
import { userManager } from '../auth/AuthProvider';

export type MediaLink = { label: string; type: string; url: string };

export type AgendaShow = {
  id: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  imageUrl: string | null;
  tags: string[] | null;
  mediaLinks: MediaLink[];
};

export type GeneratedMeta = {
  youtubeDescription: string;
  mixcloudDescription: string;
  tags: string[];
};

export type PlatformJob = {
  id: string;
  upload_id: string;
  platform: 'youtube' | 'mixcloud' | 'archive';
  status: 'queued' | 'processing' | 'done' | 'failed';
  result_url: string | null;
  error: string | null;
  progress_pct: number;
};

export type UploadWithJobs = {
  id: string;
  show_id: string;
  title: string;
  description: string | null;
  tags: string[];
  image_url: string | null;
  video_s3_key: string;
  archive_s3_key: string | null;
  audio_s3_key: string | null;
  video_url: string;
  audio_url: string | null;
  archive_url: string | null;
  created_at: string;
  jobs: PlatformJob[];
};

export type MetadataSync = { ok: boolean; sync: Record<string, string> };

async function requestWith<T>(path: string, token: string | undefined, options?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = { ...(options?.headers as Record<string, string>) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(path, { ...options, headers });
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const user = await userManager.getUser();
  let res = await requestWith(path, user?.access_token, options);

  // Access token expired mid-session → try a silent renew and retry once; if
  // that fails, bounce to the login page rather than dead-ending on a 401.
  if (res.status === 401) {
    let renewed: User | null = null;
    try {
      renewed = await userManager.signinSilent();
    } catch {
      renewed = null;
    }
    if (renewed?.access_token) {
      res = await requestWith(path, renewed.access_token, options);
    }
    if (res.status === 401) {
      await userManager.signinRedirect();
      throw new Error('Session expired');
    }
  }

  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  checkAuth: () => apiFetch<{ ok: boolean }>('/api/auth/me'),

  listShows: () => apiFetch<AgendaShow[]>('/api/shows'),

  listGenres: () => apiFetch<string[]>('/api/shows/genres'),

  generateMeta: (title: string, description: string) =>
    apiFetch<GeneratedMeta>(
      `/api/shows/meta?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`
    ),

  getPresignedUrl: (filename: string, contentType: string) =>
    apiFetch<{ url: string; key: string }>('/api/uploads/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, contentType }),
    }),

  // Resumable multipart upload
  mpCreate: (filename: string, contentType: string, size: number, showId: string) =>
    apiFetch<{ sessionId: string; key: string; partSize: number; partCount: number }>(
      '/api/uploads/multipart/create',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, contentType, size, showId }),
      }
    ),
  mpStatus: (sessionId: string) =>
    apiFetch<{
      sessionId: string;
      key: string;
      filename: string;
      size: number;
      contentType: string;
      partSize: number;
      status: string;
      uploadedParts: { partNumber: number; size: number }[];
    }>(`/api/uploads/multipart/${sessionId}`),
  mpPartUrl: (sessionId: string, n: number) =>
    apiFetch<{ url: string }>(`/api/uploads/multipart/${sessionId}/part/${n}`, { method: 'POST' }),
  mpComplete: (sessionId: string) =>
    apiFetch<{ key: string }>(`/api/uploads/multipart/${sessionId}/complete`, { method: 'POST' }),
  mpAbort: (sessionId: string) =>
    apiFetch(`/api/uploads/multipart/${sessionId}/abort`, { method: 'POST' }),

  createUpload: (body: {
    showId: string;
    title: string;
    description: string;
    tags: string[];
    imageUrl: string | null;
    videoS3Key: string;
    platforms: string[];
    includeJingle: boolean;
    autoTrimSilence: boolean;
    trimStart?: string | null;
    trimEnd?: string | null;
  }) =>
    apiFetch<{ uploadId: string }>('/api/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  listUploads: () => apiFetch<UploadWithJobs[]>('/api/uploads'),

  retryJob: (uploadId: string, platform: string) =>
    apiFetch<{ ok: boolean }>(`/api/uploads/${uploadId}/jobs/${platform}/retry`, { method: 'POST' }),

  updateMetadata: (uploadId: string, body: { title: string; description: string; tags: string[] }) =>
    apiFetch<MetadataSync>(`/api/uploads/${uploadId}/metadata`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  // Flip the PocketBase archive record to published (live on the agenda site).
  publishRecord: (uploadId: string) =>
    apiFetch<{ ok: boolean }>(`/api/uploads/${uploadId}/publish`, { method: 'POST' }),

  // (Re)generate the downloadable audio archive (m4a) for an upload.
  generateAudio: (uploadId: string) =>
    apiFetch<{ ok: boolean }>(`/api/uploads/${uploadId}/archive`, { method: 'POST' }),

  // Cover image → the PocketBase archive record's `image` field (PB is master).
  // Sends the raw image bytes; the api proxies them into PB. Returns the new URL.
  uploadCover: (showId: string, file: File) =>
    apiFetch<{ imageUrl: string | null }>(`/api/shows/${showId}/cover`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'image/jpeg' },
      body: file,
    }),
  clearCover: (showId: string) =>
    apiFetch<{ ok: boolean }>(`/api/shows/${showId}/cover`, { method: 'DELETE' }),

  // Managing an already-published platform link (from the "Publish to" section).
  platformUpdate: (body: {
    platform: string;
    url: string;
    title: string;
    description: string;
    tags: string[];
  }) =>
    apiFetch<{ error: string | null }>('/api/uploads/platform/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  platformSetPublic: (url: string) =>
    apiFetch<{ error: string | null }>('/api/uploads/platform/set-public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }),
  platformRemove: (showId: string, label: string) =>
    apiFetch<{ ok: boolean }>('/api/uploads/platform/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showId, label }),
    }),

  // Staged (uploaded-but-unpublished) video per show — survives refresh / works cross-machine.
  getStaged: (showId: string) =>
    apiFetch<{ show_id: string; s3_key: string; filename: string; size_bytes: number } | null>(
      `/api/uploads/staged/${showId}`
    ),
  // The most recent COMPLETED upload's video for a show (staged rows are cleared
  // on publish; this restores the published recording into the form).
  getShowVideo: (showId: string) =>
    apiFetch<{ videoS3Key: string; filename: string } | null>(`/api/uploads/for-show/${showId}`),
  // show_ids that already have a staged (uploaded, not-yet-published) video.
  getStagedShowIds: () => apiFetch<string[]>('/api/uploads/staged'),
  putStaged: (showId: string, body: { s3Key: string; filename: string; sizeBytes: number }) =>
    apiFetch(`/api/uploads/staged/${showId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteStaged: (showId: string) => apiFetch(`/api/uploads/staged/${showId}`, { method: 'DELETE' }),

  getJinglePreview: () => apiFetch<{ url: string; filename: string }>('/api/uploads/jingle-preview'),

  listPendingVideos: () =>
    apiFetch<{ id: string; s3_key: string; filename: string; size_bytes: number; created_at: string }[]>(
      '/api/watcher/pending'
    ),

  claimPendingVideo: (id: string) =>
    apiFetch(`/api/watcher/pending/${id}`, { method: 'DELETE' }),

  // Presence / soft-claims
  claimShow: (showId: string) =>
    apiFetch('/api/presence/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showId }),
    }),
  heartbeatShow: (showId: string) =>
    apiFetch('/api/presence/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showId }),
    }),
  releaseShow: (showId: string) =>
    apiFetch('/api/presence/claim', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showId }),
    }),
};

// EventSource can't set an Authorization header, so the presence stream takes
// the token as a query param (same pattern as the upload events stream).
export async function presenceStreamUrl(): Promise<string | null> {
  const user = await userManager.getUser();
  if (!user?.access_token) return null;
  return `/api/presence/stream?access_token=${encodeURIComponent(user.access_token)}`;
}

export type OnlineUser = { sub: string; name: string };
export type ClaimView = { showId: string; userSub: string; userName: string; claimedAt: string };
