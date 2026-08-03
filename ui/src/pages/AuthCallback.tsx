import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '../auth/useAuth';
import { PageLoading } from '../components/Skeleton';

export default function AuthCallback() {
  const { userManager } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    userManager
      .signinRedirectCallback()
      .then(() => navigate({ to: '/', replace: true }))
      .catch(() => navigate({ to: '/', replace: true }));
  }, [userManager, navigate]);

  // The token exchange is a network round-trip; rendering null blanked the page
  // for its duration, which reads as a crash on a slow connection.
  return <PageLoading label="signing in…" />;
}
