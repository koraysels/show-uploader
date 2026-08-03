import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

// Loading placeholders so a pending state is never a blank screen.

// Full-screen centred loader — used for auth/route transitions (was `return null`,
// which rendered a blank page after a session expired mid-navigation).
export function PageLoading({ label = 'loading…' }: { label?: string }) {
  return (
    <Stack spacing={1.5} sx={{ minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress size={24} thickness={5} color="primary" />
      <Typography variant="caption" color="text.disabled">
        {label}
      </Typography>
    </Stack>
  );
}

// One placeholder row that echoes the archive/history card layout (thumb + lines).
// Hides the thumb below sm, matching the cards themselves.
function CardSkeleton() {
  return (
    <Paper variant="outlined" sx={{ display: 'flex', gap: 2, p: { xs: 2, sm: 2.5 } }}>
      <Skeleton
        variant="rectangular"
        width={64}
        height={64}
        sx={{ flexShrink: 0, display: { xs: 'none', sm: 'block' } }}
      />
      <Box sx={{ flex: 1, py: 0.5 }}>
        <Skeleton variant="rectangular" height={16} width="50%" sx={{ mb: 1.5 }} />
        <Skeleton variant="rectangular" height={12} width="75%" />
      </Box>
    </Paper>
  );
}

// A list of card placeholders for the data pages while their queries load.
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Stack spacing={1.5} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </Stack>
  );
}
