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
};
