import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '../auth/useAuth';
import { PageLoading } from '../components/Skeleton';
import AuthFailed from './AuthFailed';
import type { AuthFailure } from '../auth/signin';

export default function AuthCallback() {
  const { userManager } = useAuth();
  const navigate = useNavigate();
  // A failed token exchange used to bounce to `/`, where the route guard
  // started another signin — the same failure, on repeat, with nothing on
  // screen. Show it instead; the operator gets the actual error text.
  const [failure, setFailure] = useState<AuthFailure | null>(null);

  useEffect(() => {
    userManager
      .signinRedirectCallback()
      .then(() => navigate({ to: '/', replace: true }))
      .catch((err: unknown) =>
        setFailure({ reason: 'callback-failed', attempts: 1, detail: String(err) })
      );
  }, [userManager, navigate]);

  if (failure) return <AuthFailed failure={failure} />;
  // The token exchange is a network round-trip; rendering null blanked the page
  // for its duration, which reads as a crash on a slow connection.
  return <PageLoading label="signing in…" />;
}
