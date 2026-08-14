import { Component, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { userManager } from '../auth/AuthProvider';

type Props = { children: ReactNode };
type State = { error: Error | null };

const RELOADED = 'stale-chunk-reloaded';

/**
 * A lazy chunk that 404s because the build it belonged to is gone. Browsers
 * word this differently (Firefox "error loading dynamically imported module",
 * Chrome "Failed to fetch dynamically imported module", Safari "Importing a
 * module script failed"), so match on the shared shape rather than one string.
 */
function isStaleChunk(error: Error): boolean {
  return /dynamically imported module|importing a module script failed/i.test(error.message ?? '');
}

// A render crash used to blank the whole page (no boundary → React unmounts the
// tree). This catches it and shows a recoverable screen instead — reload, or
// re-authenticate (the common cause is a session that went bad after long idle).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  // Rendering at all means this build loaded fine, so the next stale-chunk
  // error (after some future deploy) gets its own one-shot reload.
  componentDidMount() {
    sessionStorage.removeItem(RELOADED);
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('UI crashed:', error, info);

    // A deploy renames every chunk (content hashes), so a tab left open across
    // one fails the moment it lazy-loads a chunk that no longer exists. The fix
    // is always the same — load the new build — so do it rather than showing an
    // error the operator can only respond to by reloading anyway.
    //
    // Guarded by a session flag: if the reload doesn't fix it, the second crash
    // shows the error screen instead of reloading forever.
    if (isStaleChunk(error) && !sessionStorage.getItem(RELOADED)) {
      sessionStorage.setItem(RELOADED, '1');
      window.location.reload();
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Box sx={{ mx: 'auto', maxWidth: 448, py: 10, px: 3, textAlign: 'center' }}>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
          something went wrong
        </Typography>
        <Typography variant="h1" sx={{ mt: 1, fontSize: '1.25rem' }}>
          the page hit an error
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 2, overflowWrap: 'break-word' }}>
          {this.state.error.message || 'unexpected error'}
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 3, justifyContent: 'center' }}>
          <Button variant="contained" onClick={() => window.location.reload()}>
            reload
          </Button>
          <Button variant="outlined" onClick={() => void userManager.signinRedirect({ prompt: 'login' })}>
            sign in again
          </Button>
        </Stack>
      </Box>
    );
  }
}
