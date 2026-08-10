import { useEffect } from 'react';
import Typography from '@mui/material/Typography';
import { useSignObject } from '../api/hooks';
import { c } from '../theme';
import VideoPlayer from './VideoPlayer';

/**
 * Signs an object key once, then plays it.
 *
 * Lists carry keys rather than presigned URLs, so a player needs one signature
 * of its own. Signing here — once, on open — rather than in the list is what
 * keeps the URL stable for the whole viewing session: the list can refetch as
 * often as it likes without touching what the media element is playing.
 */
export default function SignedVideoPlayer({ objectKey, note }: { objectKey: string; note?: string }) {
  const sign = useSignObject();

  // Fires once per mount: the player is rendered only while open, so closing and
  // reopening deliberately signs afresh rather than risking an expired URL.
  const { mutate } = sign;
  useEffect(() => {
    mutate({ key: objectKey });
  }, [mutate, objectKey]);

  if (sign.isError) {
    return (
      <Typography variant="caption" sx={{ color: c.danger, mt: 2, display: 'block' }}>
        could not open this recording: {sign.error.message}
      </Typography>
    );
  }

  if (!sign.data) {
    return (
      <Typography variant="caption" color="text.disabled" sx={{ mt: 2, display: 'block' }}>
        loading…
      </Typography>
    );
  }

  return <VideoPlayer url={sign.data.url} note={note} />;
}
