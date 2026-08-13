import { createLink } from '@tanstack/react-router';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useListPublishedShows } from '../api/hooks';
import PlatformIcon from '../components/PlatformIcon';
import { c } from '../theme';

const LABEL_TO_PLATFORM: Record<string, string> = { YouTube: 'youtube', MixCloud: 'mixcloud' };

// MUI's ButtonBase overloads for the `component` prop don't infer TanStack
// Router's typed `params` correctly (see brief discussion) — createLink
// produces a component whose props resolve cleanly instead.
const LinkButtonBase = createLink(ButtonBase);

export default function Attach() {
  const { data: shows = [], isPending, isError } = useListPublishedShows();

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
              <Typography sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{s.title}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block' }}>
                {s.date}
              </Typography>
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
