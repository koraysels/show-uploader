import { userManager } from '../auth/AuthProvider';

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
  video_s3_key: string;
  archive_s3_key: string | null;
  archive_url: string | null;
  created_at: string;
  jobs: PlatformJob[];
};

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const user = await userManager.getUser();
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };
  if (user?.access_token) {
    headers['Authorization'] = `Bearer ${user.access_token}`;
  }
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  checkAuth: () => apiFetch<{ ok: boolean }>('/api/auth/me'),

  listShows: () => apiFetch<AgendaShow[]>('/api/shows'),

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
  mpCreate: (filename: string, contentType: string, size: number) =>
    apiFetch<{ sessionId: string; key: string; partSize: number; partCount: number }>(
      '/api/uploads/multipart/create',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, contentType, size }),
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
    trimStart?: string | null;
    trimEnd?: string | null;
  }) =>
    apiFetch<{ uploadId: string }>('/api/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  listUploads: () => apiFetch<UploadWithJobs[]>('/api/uploads'),

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
