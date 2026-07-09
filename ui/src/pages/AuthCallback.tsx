import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '../auth/useAuth';

export default function AuthCallback() {
  const { userManager } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    userManager
      .signinRedirectCallback()
      .then(() => navigate({ to: '/', replace: true }))
      .catch(() => navigate({ to: '/', replace: true }));
  }, [userManager, navigate]);

  return null;
}
