import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { usePreviewStatus, useStartPreview } from '../api/hooks';
import { useTRPC } from '../api/trpc';
import { c } from '../theme';
import SignedVideoPlayer from './SignedVideoPlayer';

/**
 * Watch the recording before publishing it.
 *
 * Browsers can't play MKV, so a non-MP4 recording is rewrapped first — the same
 * lossless rewrap the archive job would do later, moved earlier, replacing the
 * source rather than making a second copy. An MP4 plays immediately with no job
 * at all.
 */
export default function VideoPreview({
  videoS3Key,
  open,
  onConverted,
  onConvertingChange,
}: {
  videoS3Key: string;
  open: boolean;
  /**
   * The remux replaced the recording, so the form is still holding a key that no
   * longer exists on S3. Publishing with it would hand the platform jobs a
   * deleted object, so the parent has to be told the new one.
   */
  onConverted: (mp4Key: string) => void;
  /** Publishing mid-remux would hand the platform jobs a key about to be deleted. */
  onConvertingChange: (converting: boolean) => void;
}) {
  const [converting, setConverting] = useState(false);
  // Keep polling once a conversion is under way even if the panel is collapsed:
  // the remux deletes the source whether or not anyone is watching, so the form
  // still has to learn the new key.
  const status = usePreviewStatus(videoS3Key, open || converting);
  const start = useStartPreview();
  const qc = useQueryClient();
  const trpc = useTRPC();

  const state = status.data?.state;

  useEffect(() => {
    const now = state === 'working';
    setConverting(now);
    onConvertingChange(now);
  }, [state, onConvertingChange]);

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
  const readyKey = status.data?.state === 'ready' ? status.data.key : null;
  useEffect(() => {
    if (state !== 'ready' || !readyKey || refreshedFor.current === videoS3Key) return;
    refreshedFor.current = videoS3Key;
    // Server-side records (staged) are re-read; the drop-folder pick lives in
    // parent state and has to be handed over explicitly.
    void qc.invalidateQueries(trpc.uploads.pathFilter());
    void qc.invalidateQueries(trpc.watcher.pathFilter());
    if (readyKey !== videoS3Key) onConverted(readyKey);
  }, [state, readyKey, videoS3Key, qc, trpc, onConverted]);

  if (!open) return null;

  if (status.isPending) return <Hint>checking…</Hint>;
  if (status.isError) return <Hint>could not check this recording</Hint>;

  if (state === 'ready' && readyKey) {
    return <SignedVideoPlayer objectKey={readyKey} />;
  }

  // A failed *request to start* leaves the status at idle forever, so without
  // this branch the progress bar below would spin for a conversion that was
  // never queued.
  if (state === 'error' || start.isError) {
    const message = start.isError
      ? start.error.message || 'could not start the conversion'
      : status.data?.state === 'error'
        ? status.data.message
        : 'could not convert this recording';
    return (
      <Stack spacing={1} sx={{ mt: 2 }}>
        <Typography variant="caption" sx={{ color: c.danger }}>
          {message}
        </Typography>
        <Box>
          <Button
            variant="text"
            onClick={() => {
              start.reset();
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
