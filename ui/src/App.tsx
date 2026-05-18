import { Routes, Route, Link, useLocation } from 'react-router-dom';
import NewUpload from './pages/NewUpload';
import History from './pages/History';

export default function App() {
  const { pathname } = useLocation();
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
