import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { retrySignin, signOut, type AuthFailure } from '../auth/signin';

const REASONS: Record<string, string> = {
  'api-rejected-token': 'zitadel signed you in, but the api rejected the token it issued.',
  'silent-renew-failed': 'the session could not be renewed in the background.',
  'route-guard': 'the app never saw a signed-in session after returning from zitadel.',
  'callback-failed': 'the login could not be completed when zitadel redirected back.',
  'manual-retry': 'the retry did not get further than the previous attempt.',
  'signout-failed': 'signing out could not reach zitadel.',
  'renew-unavailable':
    'the session expired and could not be renewed without sending you back to zitadel.',
};

/**
 * Terminal state for the signin loop breaker. Anything that ends here is a
 * config or backend problem the operator has to act on, so it says what failed
 * and offers the two moves that can help — rather than bouncing through Zitadel
 * again, which is exactly what produced the loop.
 */
export default function AuthFailed({ failure }: { failure: AuthFailure }) {
  return (
    <Stack sx={{ minHeight: '100vh', alignItems: 'center', justifyContent: 'center', px: 3, textAlign: 'center' }}>
      <Box sx={{ maxWidth: 480 }}>
        <Box sx={{ width: 12, height: 12, borderRadius: '999px', bgcolor: 'error.main', mx: 'auto', mb: 2 }} aria-hidden />
        <Typography variant="h1">sign-in loop stopped</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1.5 }}>
          {REASONS[failure.reason] ?? 'signing in failed repeatedly.'} stopped after{' '}
          {failure.attempts} attempts so the page can't keep bouncing.
        </Typography>
        {failure.detail && (
          <Typography
            variant="caption"
            component="pre"
            color="text.secondary"
            sx={{ mt: 2, textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >
            {failure.detail}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 2 }}>
          reason code: <Box component="span" sx={{ bgcolor: 'divider', px: 0.75, py: 0.25, color: 'text.primary' }}>{failure.reason}</Box>
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'center', mt: 3 }}>
          <Button variant="outlined" onClick={() => void retrySignin()}>
            try again
          </Button>
          <Button variant="text" onClick={() => void signOut()}>
            sign out
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}
