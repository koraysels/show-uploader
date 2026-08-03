import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
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
  youtube: 'youtube',
  mixcloud: 'mixcloud',
  archive: 'archive',
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
    // Matches the worker's split: download → audio → remux → upload.
    if (pct < 20) return 'downloading';
    if (pct < 50) return 'extracting audio';
    if (pct < 80) return 'remuxing to mp4';
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
    <Stack spacing={1.75}>
      {Object.entries(state).map(([platform, s]) => {
        const color = s.status === 'done' ? 'success' : s.status === 'failed' ? 'error' : 'primary';
        return (
          <Box key={platform}>
            {/* Wraps rather than squeezing: a failed job's error text is long and
                used to push the retry button off a narrow screen. */}
            <Stack
              direction="row"
              spacing={1}
              sx={{ mb: 0.75, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
            >
              <Typography variant="caption" sx={{ fontWeight: 500 }} color="text.secondary">
                {PLATFORM_LABELS[platform] ?? platform}
              </Typography>

              {s.status === 'done' && s.url ? (
                <Link
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  variant="caption"
                  sx={{ display: 'inline-flex', alignItems: 'center', minHeight: 32, fontWeight: 500 }}
                >
                  view ↗
                </Link>
              ) : s.status === 'done' ? (
                <Typography variant="caption" color="success.main">
                  done
                </Typography>
              ) : s.status === 'failed' ? (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                  <Typography variant="caption" color="error.main" sx={{ overflowWrap: 'anywhere' }}>
                    {s.error ?? 'failed'}
                  </Typography>
                  <Button
                    onClick={() => retry.mutate(platform as 'youtube' | 'mixcloud' | 'archive')}
                    disabled={retry.isPending}
                    sx={{ px: 1.25, py: 0.25, fontSize: '0.6875rem', minHeight: 32, flexShrink: 0 }}
                  >
                    {retry.isPending ? 'retrying…' : 'retry'}
                  </Button>
                </Stack>
              ) : (
                <Typography variant="caption" color="text.disabled" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {phaseLabel(platform, s.pct, s.status)} · {s.pct}%
                </Typography>
              )}
            </Stack>

            <LinearProgress
              variant="determinate"
              value={s.status === 'done' ? 100 : s.pct}
              color={color}
              sx={{ '& .MuiLinearProgress-bar': { transition: 'transform 0.5s ease' } }}
            />
          </Box>
        );
      })}
    </Stack>
  );
}
