import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { c } from '../theme';

/**
 * Plays an MP4 from a presigned S3 URL. The archive job and the preview remux
 * both write `+faststart`, so seeking works over plain range requests — no
 * streaming server involved.
 */
export default function VideoPlayer({ url, note }: { url: string; note?: string }) {
  // Pin the URL for the life of the element.
  //
  // These URLs are presigned and re-signed on every fetch, while the lists
  // feeding the players poll every 10s — so the prop changes underneath a
  // playing video. Assigning a new src makes the browser tear the media element
  // down and start over, which is why playback died a few seconds in.
  //
  // Pinned per object rather than per mount: the query string carries the
  // signature and churns, the path identifies the recording. A genuinely
  // different recording re-pins; a re-signed same one does not. Signatures last
  // hours, far longer than any viewing session.
  const objectPath = url.split('?')[0];
  const [src, setSrc] = useState(url);
  const pinnedTo = useRef(objectPath);
  useEffect(() => {
    if (pinnedTo.current === objectPath) return;
    pinnedTo.current = objectPath;
    setSrc(url);
  }, [objectPath, url]);

  return (
    <Box sx={{ mt: 2, p: 1, border: `1px solid ${c.line}`, backgroundColor: c.paper }}>
      <Box
        component="video"
        src={src}
        controls
        preload="metadata"
        playsInline
        sx={{ width: '100%', maxHeight: '70vh', display: 'block', backgroundColor: '#000' }}
      />
      <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: 'block' }}>
        {note ?? 'recordings are hevc — safari and chrome play them, firefox may not. the download always works.'}
      </Typography>
    </Box>
  );
}
