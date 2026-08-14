import { createLink } from '@tanstack/react-router';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import { useListPublishedShows, useUploads, useStagedShowIds, useUploadingProgress } from '../api/hooks';
import { useUpload } from '../upload/UploadProvider';
import PlatformIcon from '../components/PlatformIcon';
import { c } from '../theme';

const LABEL_TO_PLATFORM: Record<string, string> = { YouTube: 'youtube', MixCloud: 'mixcloud' };

// MUI's ButtonBase overloads for the `component` prop don't infer TanStack
// Router's typed `params` correctly (see brief discussion) — createLink
// produces a component whose props resolve cleanly instead.
const LinkButtonBase = createLink(ButtonBase);

/**
 * What's happening with this show's recording right now.
 *
 * The list itself is PocketBase-driven and a show only leaves it once its
 * archive links are written — which is the very end of the pipeline. Without
 * this the operator has no way to tell "not started" from "uploading" from
 * "transcoding", and was left guessing whether to touch it again.
 */
function RowStatus({
  showId,
  uploads,
  staged,
  uploadingElsewhere,
}: {
  showId: string;
  uploads: ReturnType<typeof useUploads>['data'];
  staged: Set<string>;
  uploadingElsewhere: Map<string, number | null>;
}) {
  const { get } = useUpload();
  const live = get(showId);

  // This browser is mid-upload: the only place a byte-level percentage exists.
  if (live?.status === 'uploading') {
    const pct = Math.round(live.fraction * 100);
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 160 }}>
        <LinearProgress variant="determinate" value={pct} sx={{ width: 64, height: 6, flexShrink: 0 }} />
        <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          uploading {pct}%
        </Typography>
      </Stack>
    );
  }
  if (live?.status === 'error') {
    return (
      <Tooltip title={live.error ?? 'upload failed'}>
        <Typography variant="caption" sx={{ color: c.danger }}>
          ✕ upload failed
        </Typography>
      </Tooltip>
    );
  }

  // A job is running: the recording is uploaded and being remuxed / having its
  // audio extracted. This is the long tail the operator most wants to see.
  const upload = (uploads ?? [])
    .filter((u) => u.show_id === showId)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0];
  const running = upload?.jobs.find((j) => j.status === 'processing' || j.status === 'queued');
  if (running) {
    return (
      <Tooltip title="converting to mp4, extracting audio — it leaves this list when it finishes">
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 160 }}>
          <LinearProgress
            variant={running.status === 'queued' ? 'indeterminate' : 'determinate'}
            value={running.progress_pct}
            sx={{ width: 64, height: 6, flexShrink: 0 }}
          />
          <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {running.status === 'queued' ? 'queued' : `processing ${running.progress_pct}%`}
          </Typography>
        </Stack>
      </Tooltip>
    );
  }

  const failed = upload?.jobs.find((j) => j.status === 'failed');
  if (failed) {
    return (
      <Tooltip title={failed.error ?? 'job failed — open the show to retry'}>
        <Typography variant="caption" sx={{ color: c.danger }}>
          ✕ {failed.platform} failed
        </Typography>
      </Tooltip>
    );
  }

  // Uploaded and waiting for the operator to start it.
  if (staged.has(showId)) {
    return (
      <Tooltip title="recording uploaded — open the show to start the conversion">
        <Typography variant="caption" sx={{ color: c.ok, fontWeight: 600 }}>
          ● ready to process
        </Typography>
      </Tooltip>
    );
  }

  if (uploadingElsewhere.has(showId)) {
    const pct = uploadingElsewhere.get(showId);
    return (
      <Tooltip title="a recording is being uploaded on another machine">
        <Typography variant="caption" color="text.secondary">
          ● uploading elsewhere{typeof pct === 'number' ? ` · ${pct}%` : ''}
        </Typography>
      </Tooltip>
    );
  }

  return (
    <Typography variant="caption" color="text.disabled">
      no recording yet
    </Typography>
  );
}

export default function Attach() {
  const { data: shows = [], isPending, isError } = useListPublishedShows();
  const { data: uploads } = useUploads();
  const { data: stagedIds = [] } = useStagedShowIds();
  const staged = new Set(stagedIds);
  const { data: uploadingList = [] } = useUploadingProgress();
  const uploadingElsewhere = new Map(uploadingList.map((u) => [u.show_id, u.pct]));

  // Eligible = published somewhere already, but nothing archived here yet.
  // cs-archive-video and cs-archive-audio are always written together (same
  // publishArchiveLinks call), so checking one is a reliable proxy for both.
  const eligible = shows
    .filter((s) => !s.mediaLinks.some((l) => l.label === 'cs-archive-video'))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <Stack spacing={3}>
      <Box component="header">
        <Typography variant="h1">attach a recording</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          shows already published elsewhere, with no archived recording here yet.
        </Typography>
      </Box>

      {isPending ? (
        <Typography color="text.secondary">loading…</Typography>
      ) : isError ? (
        <Typography color="error.main">couldn't load published shows.</Typography>
      ) : eligible.length === 0 ? (
        <Typography color="text.secondary">every published show already has a recording archived here.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {eligible.map((s) => (
            <LinkButtonBase
              key={s.id}
              to="/upload/$showId"
              params={{ showId: s.id }}
              sx={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: `1px solid ${c.line}`,
                backgroundColor: c.surface,
                p: 2,
                '&:hover': { borderColor: c.ink },
              }}
            >
              <Stack
                direction="row"
                spacing={2}
                sx={{ alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 1 }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{s.title}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block' }}>
                    {s.date}
                  </Typography>
                </Box>
                <RowStatus
                  showId={s.id}
                  uploads={uploads}
                  staged={staged}
                  uploadingElsewhere={uploadingElsewhere}
                />
              </Stack>
              {s.mediaLinks.length > 0 && (
                <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
                  {s.mediaLinks.map((l) => (
                    <Stack key={l.label} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                      <PlatformIcon platform={LABEL_TO_PLATFORM[l.label] ?? ''} />
                      <Typography variant="caption" color="text.secondary">
                        {l.label}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </LinkButtonBase>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
