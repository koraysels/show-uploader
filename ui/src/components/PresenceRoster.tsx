import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { usePresence } from '../presence/PresenceProvider';
import { c } from '../theme';

// Short, human label from a name/email (first token or local-part).
export function shortName(name: string): string {
  const base = name.includes('@') ? name.split('@')[0] : name;
  return base.split(/[.\s]+/)[0].toLowerCase();
}

export function PresenceRoster() {
  const { online, myUserId } = usePresence();
  if (online.length === 0) return null;

  const others = online.filter((u) => u.sub !== myUserId);
  const label =
    others.length === 0
      ? 'only you'
      : [...(myUserId ? ['you'] : []), ...others.map((u) => shortName(u.name))].join(', ');

  return (
    <Tooltip title={`${online.length} online`}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Box sx={{ width: 6, height: 6, borderRadius: '999px', bgcolor: c.ok, flexShrink: 0 }} aria-hidden />
        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 220 }}>
          {label}
        </Typography>
      </Stack>
    </Tooltip>
  );
}
