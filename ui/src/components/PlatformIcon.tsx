import Box from '@mui/material/Box';

/**
 * Platform marks, inline.
 *
 * Inline SVG rather than an icon package or a remote logo: no extra dependency,
 * no network request, and nothing to break when a CDN or a brand asset URL
 * moves. Both paths use `currentColor`, so an icon takes the colour of the link
 * or button it sits in and can't fight the palette.
 *
 * The archive column is the same three or four labels on every row — a shape is
 * recognised long before a word is read.
 */

const PATHS: Record<string, string> = {
  // YouTube's rounded-rectangle-and-triangle mark.
  youtube:
    'M23.5 6.2a3 3 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.51A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.12 2.14c1.88.51 9.38.51 9.38.51s7.5 0 9.38-.51a3 3 0 0 0 2.12-2.14A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8ZM9.55 15.57V8.43L15.82 12l-6.27 3.57Z',
  // MixCloud is a cloud; the wordmark next to it carries the rest.
  mixcloud:
    'M19.35 10.04A7.49 7.49 0 0 0 12 4a7.48 7.48 0 0 0-6.63 4.04A6 6 0 0 0 6 20h13a5 5 0 0 0 .35-9.96Z',
  // The in-house archive isn't a platform — a hard drive stands in for it.
  archive: 'M4 4h16a1 1 0 0 1 1 1v5H3V5a1 1 0 0 1 1-1Zm-1 8h18v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7Zm3 2v2h6v-2H6Z',
};

export default function PlatformIcon({ platform, size = 14 }: { platform: string; size?: number }) {
  const d = PATHS[platform];
  if (!d) return null;
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      // Decorative: every use sits next to the platform's name in text, so a
      // screen reader announcing it again would only add noise.
      aria-hidden
      focusable="false"
      sx={{ width: size, height: size, flexShrink: 0, fill: 'currentColor', display: 'block' }}
    >
      <path d={d} />
    </Box>
  );
}
