import { Component, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { userManager } from '../auth/AuthProvider';

type Props = { children: ReactNode };
type State = { error: Error | null };

// A render crash used to blank the whole page (no boundary → React unmounts the
// tree). This catches it and shows a recoverable screen instead — reload, or
// re-authenticate (the common cause is a session that went bad after long idle).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('UI crashed:', error, info);
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
