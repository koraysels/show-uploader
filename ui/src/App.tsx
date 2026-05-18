import { useEffect, useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { useAuth } from './auth/useAuth';
import AuthCallback from './pages/AuthCallback';
import AccessDenied from './pages/AccessDenied';
import NewUpload from './pages/NewUpload';
import History from './pages/History';
import { api } from './api/client';

function AppShell() {
  const { user, loading, userManager } = useAuth();
  const [accessDenied, setAccessDenied] = useState(false);
  const [checking, setChecking] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      userManager.signinRedirect();
    }
  }, [loading, user, userManager]);

  useEffect(() => {
    if (!user) return;
    setChecking(true);
    api
      .checkAuth()
      .then(() => setAccessDenied(false))
      .catch((err: Error) => {
        if (err.message.includes('403')) setAccessDenied(true);
      })
      .finally(() => setChecking(false));
  }, [user]);

  if (loading || checking) return null;

  if (!user) return null;

  if (accessDenied) return <AccessDenied />;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center gap-6">
        <span className="font-semibold text-white tracking-tight">Show Uploader</span>
        <Link
          to="/"
          className={`text-sm ${pathname === '/' ? 'text-white' : 'text-gray-400 hover:text-white'}`}
        >
          New Upload
        </Link>
        <Link
          to="/history"
          className={`text-sm ${pathname === '/history' ? 'text-white' : 'text-gray-400 hover:text-white'}`}
        >
          History
        </Link>
      </nav>
      <main className="max-w-2xl mx-auto px-6 py-10">
        <Routes>
          <Route path="/" element={<NewUpload />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/callback" element={<AuthCallback />} />
        <Route path="*" element={<AppShell />} />
      </Routes>
    </AuthProvider>
  );
}
