import { env } from '../env';

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

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${env.SHOWS_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.SHOWS_API_KEY}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`Shows API error: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export function listShows(params?: { from?: string; to?: string; status?: string }) {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return apiFetch<AgendaShow[]>(`/shows${qs ? `?${qs}` : ''}`);
}

export function writeBackUrls(
  id: string,
  uploads: { youtube?: string; mixcloud?: string }
) {
  return apiFetch(`/shows/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ uploads }),
  });
}
