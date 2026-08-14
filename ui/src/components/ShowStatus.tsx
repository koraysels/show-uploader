import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useUploads, useStagedShowIds, useUploadingProgress } from '../api/hooks';
import { useUpload } from '../upload/UploadProvider';
import { resolveShowStatus, showStatusRank, type ShowStatus } from '../upload/resolveShowStatus';
import { c } from '../theme';

/**
 * Every input resolveShowStatus needs, fetched once for the whole screen.
 *
 * Called by the list, not per row: these are four queries, and while React
 * Query would dedupe them by key anyway, fetching per row makes that a
 * property of the cache rather than of the code. The returned lookup is
 * cheap to call in a map().
 */
export function useShowStatuses() {
  const { uploads: live } = useUpload();
  const { data: uploadRows = [] } = useUploads();
  const { data: stagedIds = [] } = useStagedShowIds();
  const { data: uploading = [] } = useUploadingProgress();

  const staged = new Set(stagedIds);
  const elsewhere = new Map(uploading.map((u) => [u.show_id, u.pct]));
  // Newest first: a re-upload leaves the older, finished row behind, and the
  // recent one is what the operator is watching.
  const rowsByShow = new Map(
    [...uploadRows]
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
      .map((u) => [u.show_id, u])
  );

  return (showId: string, opts: { archived?: boolean } = {}): ShowStatus =>
    resolveShowStatus({
      live: live[showId] ?? null,
      jobs: rowsByShow.get(showId)?.jobs ?? null,
      staged: staged.has(showId),
      elsewhere: { present: elsewhere.has(showId), pct: elsewhere.get(showId) ?? null },
      archived: opts.archived ?? rowsByShow.has(showId),
    });
}

export { showStatusRank };

const bar = { width: 64, height: 6, flexShrink: 0 } as const;

/**
 * One recording's state, rendered the same way everywhere it appears.
 *
 * `variant` is presentation only — the same status reads as a chip in a table
 * cell and as a plain line in a card row; both say the same thing.
 */
export default function ShowStatusView({
  status,
  variant = 'chip',
}: {
  status: ShowStatus;
  variant?: 'chip' | 'inline';
}) {
  switch (status.state) {
    case 'uploading':
      return (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <LinearProgress variant="determinate" value={status.pct} sx={bar} />
          <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {status.pct}%
          </Typography>
        </Stack>
      );

    case 'upload-failed':
      return (
        <Tooltip title={status.message}>
          {variant === 'chip' ? (
            <Chip label="✕ upload failed" sx={{ borderColor: c.danger, color: c.danger, bgcolor: c.dangerSoft }} />
          ) : (
            <Typography variant="caption" sx={{ color: c.danger }}>
              ✕ upload failed
            </Typography>
          )}
        </Tooltip>
      );

    case 'processing':
      return (
        <Tooltip title={`${status.platform} — converting; it leaves this list when it finishes`}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <LinearProgress variant="determinate" value={status.pct} sx={bar} />
            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {status.pct}%
            </Typography>
          </Stack>
        </Tooltip>
      );

    case 'queued':
      return (
        <Tooltip title={`${status.platform} — waiting for a worker`}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <LinearProgress sx={bar} />
            <Typography variant="body2" color="text.secondary">
              queued
            </Typography>
          </Stack>
        </Tooltip>
      );

    case 'job-failed':
      return (
        <Tooltip title={status.message}>
          {variant === 'chip' ? (
            <Chip
              label={`✕ ${status.platform} failed`}
              sx={{ borderColor: c.danger, color: c.danger, bgcolor: c.dangerSoft }}
            />
          ) : (
            <Typography variant="caption" sx={{ color: c.danger }}>
              ✕ {status.platform} failed
            </Typography>
          )}
        </Tooltip>
      );

    case 'ready':
      return (
        <Tooltip title="recording uploaded — open the show to start it">
          {variant === 'chip' ? (
            <Chip label="● ready" sx={{ borderColor: c.ok, color: c.ok, bgcolor: c.okSoft, fontWeight: 600 }} />
          ) : (
            <Typography variant="caption" sx={{ color: c.ok, fontWeight: 600 }}>
              ● ready to process
            </Typography>
          )}
        </Tooltip>
      );

    case 'uploading-elsewhere':
      return (
        <Tooltip title="a recording is being uploaded on another machine">
          {variant === 'chip' ? (
            <Chip
              label={`● uploading elsewhere${status.pct !== null ? ` · ${status.pct}%` : ''}`}
              sx={{ borderColor: c.ink, color: c.ink }}
            />
          ) : (
            <Typography variant="caption" color="text.secondary">
              ● uploading elsewhere{status.pct !== null ? ` · ${status.pct}%` : ''}
            </Typography>
          )}
        </Tooltip>
      );

    case 'archived':
      return (
        <Tooltip title="already uploaded — the archived recording is on the archive page">
          {variant === 'chip' ? (
            <Chip label="● uploaded" sx={{ color: c.muted }} />
          ) : (
            <Typography variant="caption" color="text.secondary">
              ● uploaded
            </Typography>
          )}
        </Tooltip>
      );

    case 'none':
      return (
        <Typography variant={variant === 'chip' ? 'body2' : 'caption'} color="text.disabled">
          {variant === 'chip' ? '— no video' : 'no recording yet'}
        </Typography>
      );
  }
}
