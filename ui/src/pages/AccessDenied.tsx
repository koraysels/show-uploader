import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export default function AccessDenied() {
  return (
    <Stack sx={{ minHeight: '100vh', alignItems: 'center', justifyContent: 'center', px: 3, textAlign: 'center' }}>
      <Box sx={{ maxWidth: 384 }}>
        <Box sx={{ width: 12, height: 12, borderRadius: '999px', bgcolor: 'primary.main', mx: 'auto', mb: 2 }} aria-hidden />
        <Typography variant="h1">access pending</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1.5 }}>
          ask an admin to grant you the{' '}
          <Box component="span" sx={{ bgcolor: 'divider', px: 0.75, py: 0.25, color: 'text.primary' }}>
            member
          </Box>{' '}
          role in zitadel, then reload.
        </Typography>
      </Box>
    </Stack>
  );
}
