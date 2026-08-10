import Typography from '@mui/material/Typography';
import { useSignedUrl } from '../api/hooks';
import { c } from '../theme';
import VideoPlayer from './VideoPlayer';

/**
 * Plays an object by key.
 *
 * The URL comes from a query keyed by that object, so it is signed once and
 * served from cache thereafter. Nothing else re-signs it, which is what keeps
 * the media element's source stable for the whole viewing session.
 */
export default function SignedVideoPlayer({ objectKey, note }: { objectKey: string; note?: string }) {
  const signed = useSignedUrl(objectKey);

  if (signed.isError) {
    return (
      <Typography variant="caption" sx={{ color: c.danger, mt: 2, display: 'block' }}>
        could not open this recording: {signed.error.message}
      </Typography>
    );
  }

  if (!signed.data) {
    return (
      <Typography variant="caption" color="text.disabled" sx={{ mt: 2, display: 'block' }}>
        loading…
      </Typography>
    );
  }

  return <VideoPlayer url={signed.data.url} note={note} />;
}
