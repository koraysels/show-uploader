import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useRetryJob } from '../api/hooks';
import type { PlatformJob } from '../api/client';

type Props = {
  uploadId: string;
  jobs: PlatformJob[];
};

type JobState = {
  pct: number;
  status: string;
  url?: string;
  error?: string;
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  mixcloud: 'MixCloud',
  archive: 'Archive',
};

// Human-readable phase, derived from the platform + progress checkpoints the
// worker emits, so the operator sees what's happening (not just a number).
function phaseLabel(platform: string, pct: number, status: string): string {
  if (status === 'queued' || pct === 0) return 'queued';
  if (platform === 'youtube') return pct < 20 ? 'downloading' : 'trimming + uploading to youtube';
  if (platform === 'mixcloud') {
    if (pct < 15) return 'downloading';
    if (pct < 55) return 'extracting + trimming audio';
    if (pct < 70) return 'prepending jingle';
    return 'uploading to mixcloud';
  }
  if (platform === 'archive') {
    if (pct < 15) return 'downloading';
    if (pct < 95) return 'transcoding to mp4';
    return 'storing archive';
  }
  return 'processing';
}

export default function JobProgress({ uploadId, jobs }: Props) {
  const { user } = useAuth();
  const retry = useRetryJob(uploadId);
  const [state, setState] = useState<Record<string, JobState>>(() =>
    Object.fromEntries(
      jobs.map((j) => [
        j.platform,
        {
          pct: j.progress_pct,
          status: j.status,
          url: j.result_url ?? undefined,
          error: j.error ?? undefined,
        },
      ])
    )
  );

  useEffect(() => {
    const allSettled = jobs.every((j) => j.status === 'done' || j.status === 'failed');
    if (allSettled || !user?.access_token) return;

    // EventSource can't set an Authorization header — pass the token as a query param.
    const es = new EventSource(
      `/api/uploads/${uploadId}/events?access_token=${encodeURIComponent(user.access_token)}`
    );

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as {
          type: string;
          platform?: string;
          pct?: number;
          url?: string;
          error?: string;
        };
        if (!data.platform) return;
        setState((prev) => ({
          ...prev,
          [data.platform!]: {
            pct: data.pct ?? prev[data.platform!]?.pct ?? 0,
            status:
              data.type === 'completed'
                ? 'done'
                : data.type === 'failed'
                ? 'failed'
                : 'processing',
            url: data.url ?? prev[data.platform!]?.url,
            error: data.error ?? prev[data.platform!]?.error,
          },
        }));
      } catch { /* ignore parse errors */ }
    };

    return () => es.close();
  }, [uploadId, jobs, user?.access_token]);

  return (
    <div className="space-y-3.5">
      {Object.entries(state).map(([platform, s]) => (
        <div key={platform}>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-muted">{PLATFORM_LABELS[platform] ?? platform}</span>
            <span
              className={
                s.status === 'done' ? 'text-ok' : s.status === 'failed' ? 'text-danger' : 'text-faint tabular-nums'
              }
            >
              {s.status === 'done' && s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                  View ↗
                </a>
              ) : s.status === 'done' ? (
                'Done'
              ) : s.status === 'failed' ? (
                <span className="flex items-center gap-2">
                  <span className="text-danger">{s.error ?? 'Failed'}</span>
                  <button
                    type="button"
                    onClick={() => retry.mutate(platform)}
                    disabled={retry.isPending}
                    className="border border-line px-2 py-0.5 font-medium text-accent hover:bg-line disabled:opacity-50"
                  >
                    {retry.isPending ? 'retrying…' : 'retry'}
                  </button>
                </span>
              ) : (
                <span className="lowercase">
                  {phaseLabel(platform, s.pct, s.status)} · {s.pct}%
                </span>
              )}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                s.status === 'done' ? 'bg-ok' : s.status === 'failed' ? 'bg-danger' : 'bg-accent'
              }`}
              style={{ width: `${s.status === 'done' ? 100 : s.pct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
