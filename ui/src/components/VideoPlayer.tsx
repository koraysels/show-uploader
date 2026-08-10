import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { c } from '../theme';

/**
 * Plays an MP4 from a presigned S3 URL. The archive job and the preview remux
 * both write `+faststart`, so seeking works over plain range requests — no
 * streaming server involved.
 */
export default function VideoPlayer({ url, note }: { url: string; note?: string }) {
  return (
    <Box sx={{ mt: 2, p: 1, border: `1px solid ${c.line}`, backgroundColor: c.paper }}>
      <Box
        component="video"
        src={url}
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
