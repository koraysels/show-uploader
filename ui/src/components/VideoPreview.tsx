import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { usePreviewStatus, useStartPreview } from '../api/hooks';
import { useTRPC } from '../api/trpc';
import { c } from '../theme';
import VideoPlayer from './VideoPlayer';

/**
 * Watch the recording before publishing it.
 *
 * Browsers can't play MKV, so a non-MP4 recording is rewrapped first — the same
 * lossless rewrap the archive job would do later, moved earlier, replacing the
 * source rather than making a second copy. An MP4 plays immediately with no job
 * at all.
 */
export default function VideoPreview({ videoS3Key, open }: { videoS3Key: string; open: boolean }) {
  const status = usePreviewStatus(videoS3Key, open);
  const start = useStartPreview();
  const qc = useQueryClient();
  const trpc = useTRPC();

  const state = status.data?.state;

  // Opening the preview on a recording that needs converting starts the convert.
  // Guarded by the key so reopening doesn't re-fire, and so a failure needs a
  // deliberate retry rather than looping.
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open || state !== 'idle' || startedFor.current === videoS3Key) return;
    startedFor.current = videoS3Key;
    start.mutate({ videoS3Key });
  }, [open, state, videoS3Key, start]);

  // The convert repoints the row to the new .mp4 key, so the form's own copy of
  // the video is stale the moment this turns ready. Playback already works (the
  // signed URL points at the new object) — this just catches the filename up.
  const refreshedFor = useRef<string | null>(null);
  useEffect(() => {
    if (state !== 'ready' || refreshedFor.current === videoS3Key) return;
    refreshedFor.current = videoS3Key;
    void qc.invalidateQueries(trpc.uploads.pathFilter());
  }, [state, videoS3Key, qc, trpc]);

  if (!open) return null;

  if (status.isPending) return <Hint>checking…</Hint>;
  if (status.isError) return <Hint>could not check this recording</Hint>;

  if (state === 'ready' && status.data?.url) {
    return <VideoPlayer url={status.data.url} />;
  }

  if (state === 'error') {
    return (
      <Stack spacing={1} sx={{ mt: 2 }}>
        <Typography variant="caption" sx={{ color: c.danger }}>
          {status.data?.message ?? 'could not convert this recording'}
        </Typography>
        <Box>
          <Button
            variant="text"
            onClick={() => {
              startedFor.current = videoS3Key;
              start.mutate({ videoS3Key });
            }}
            sx={{ minHeight: 32, fontSize: '0.6875rem' }}
          >
            try again
          </Button>
        </Box>
      </Stack>
    );
  }

  // 'working', or 'idle' in the moment before the mutation lands.
  const pct = state === 'working' ? status.data?.pct ?? 0 : 0;
  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.75 }}>
        converting for preview — {pct}% · this replaces the mkv with the mp4 the archive would
        have made anyway, so publishing gets faster too
      </Typography>
      <LinearProgress variant={pct > 0 ? 'determinate' : 'indeterminate'} value={pct} />
    </Box>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="caption" color="text.disabled" sx={{ mt: 2, display: 'block' }}>
      {children}
    </Typography>
  );
}
