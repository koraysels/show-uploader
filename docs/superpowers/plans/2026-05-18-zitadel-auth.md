# Zitadel Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace HTTP Basic Auth with Zitadel Cloud OIDC — PKCE login from the React SPA, JWT validation on the Express API, `member` role required for access.

**Architecture:** Frontend uses `oidc-client-ts` to redirect to Zitadel login and receive a JWT access token. Every API call includes the token as a Bearer header. The backend validates the JWT locally using cached Zitadel public keys (`jose`) and checks for the `member` role claim. Watcher endpoint keeps its own API key and is mounted before the JWT middleware.

**Tech Stack:** `jose` (Node JWT validation), `oidc-client-ts` (React OIDC client), Zitadel Cloud instance `onder-stroom-auth-n32ncs.eu1.zitadel.cloud`, Client ID `373451781885243427`

---

## File map

| File | Action | Purpose |
|---|---|---|
| `api/src/middleware/requireAuth.ts` | Create | JWT validation + `member` role check |
| `api/src/middleware/requireAuth.test.ts` | Create | Unit tests for requireAuth |
| `api/src/middleware/basicAuth.ts` | Delete | Replaced by requireAuth |
| `api/src/app.ts` | Modify | Swap basicAuth → requireAuth, add `/api/auth/me` |
| `api/src/env.ts` | Modify | Add `ZITADEL_DOMAIN`, remove `UI_USERNAME`/`UI_PASSWORD` |
| `api/package.json` | Modify | Add `jose` |
| `ui/src/auth/AuthProvider.tsx` | Create | OIDC context + exported `userManager` singleton |
| `ui/src/auth/useAuth.ts` | Create | Hook to read auth context |
| `ui/src/pages/AuthCallback.tsx` | Create | Handles Zitadel redirect back to app |
| `ui/src/pages/AccessDenied.tsx` | Create | Shown when token is valid but role is missing |
| `ui/src/App.tsx` | Modify | Wrap in `AuthProvider`, add `/callback` route, auth gate |
| `ui/src/api/client.ts` | Modify | Add Bearer token to every `apiFetch`, add `checkAuth` |
| `ui/package.json` | Modify | Add `oidc-client-ts` |
| `ui/.env.example` | Create | Document `VITE_` env vars |
| `.env.example` | Modify | Add `ZITADEL_DOMAIN`, remove `UI_USERNAME`/`UI_PASSWORD` |
| `README.md` | Modify | Update auth section |

---

### Task 1: Backend — requireAuth middleware

**Files:**
- Create: `api/src/middleware/requireAuth.ts`
- Create: `api/src/middleware/requireAuth.test.ts`
- Modify: `api/package.json`

- [ ] **Step 1: Install jose**

From the repo root:

```bash
cd api && npm install jose
```

Expected: `"jose"` appears in `api/package.json` dependencies.

- [ ] **Step 2: Write the failing tests**

Create `api/src/middleware/requireAuth.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'mock-jwks'),
  jwtVerify: vi.fn(),
}));

vi.mock('../env', () => ({
  env: { ZITADEL_DOMAIN: 'test.zitadel.cloud' },
}));

import { jwtVerify } from 'jose';
import { requireAuth } from './requireAuth';

function makeReq(authHeader?: string) {
  return { headers: { authorization: authHeader } } as any;
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('requireAuth', () => {
  const next = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when Authorization header is missing', async () => {
    const res = makeRes();
    await requireAuth(makeReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token verification throws', async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error('bad token'));
    const res = makeRes();
    await requireAuth(makeReq('Bearer badtoken'), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when roles claim is absent from payload', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({ payload: {} } as any);
    const res = makeRes();
    await requireAuth(makeReq('Bearer token'), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when member key is not in roles', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { 'urn:zitadel:iam:org:project:roles': {} },
    } as any);
    const res = makeRes();
    await requireAuth(makeReq('Bearer token'), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when token has member role', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: {
        'urn:zitadel:iam:org:project:roles': { member: { orgId: 'org' } },
      },
    } as any);
    const res = makeRes();
    await requireAuth(makeReq('Bearer token'), res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests — confirm they fail**

```bash
cd api && npm test
```

Expected: 5 tests fail with `Cannot find module './requireAuth'`

- [ ] **Step 4: Implement requireAuth.ts**

Create `api/src/middleware/requireAuth.ts`:

```typescript
import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../env';

const JWKS = createRemoteJWKSet(
  new URL(`https://${env.ZITADEL_DOMAIN}/oauth/v2/keys`)
);

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  const token = header.slice(7);
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://${env.ZITADEL_DOMAIN}`,
    });

    const roles = payload['urn:zitadel:iam:org:project:roles'] as Record<string, unknown> | undefined;
    if (!roles || !('member' in roles)) {
      res.status(403).json({ error: 'Access not granted' });
      return;
    }

    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
cd api && npm test
```

Expected: 5 tests pass

- [ ] **Step 6: Commit**

```bash
git add api/package.json api/package-lock.json api/src/middleware/requireAuth.ts api/src/middleware/requireAuth.test.ts
git commit -m "feat: add requireAuth middleware with Zitadel JWT validation"
```

---

### Task 2: Wire requireAuth into the app

**Files:**
- Modify: `api/src/env.ts`
- Modify: `api/src/app.ts`
- Delete: `api/src/middleware/basicAuth.ts`

- [ ] **Step 1: Update env.ts**

Replace the full contents of `api/src/env.ts`:

```typescript
import { z } from 'zod';

const schema = z.object({
  DATABASE_URI: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().default('show-uploader'),
  S3_REGION: z.string().default('us-east-1'),
  SHOWS_API_URL: z.string().url(),
  SHOWS_API_KEY: z.string(),
  GROQ_API_KEY: z.string(),
  JINGLE_S3_KEY: z.string().optional(),
  WATCHER_API_KEY: z.string().default('change-me'),
  ZITADEL_DOMAIN: z.string(),
  PORT: z.string().default('3000'),
  NODE_ENV: z.string().default('development'),
});

export const env = schema.parse(process.env);
```

- [ ] **Step 2: Update app.ts**

Replace the full contents of `api/src/app.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import path from 'path';
import { showsRouter } from './routes/shows';
import { uploadsRouter } from './routes/uploads';
import { eventsRouter } from './routes/events';
import { watcherRouter } from './routes/watcher';
import { requireAuth } from './middleware/requireAuth';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Watcher uses its own API key — exempt from JWT auth
  app.use('/api/watcher', watcherRouter);

  // All routes below require a valid Zitadel JWT with the member role
  app.use(requireAuth);

  app.get('/api/auth/me', (_req, res) => res.json({ ok: true }));
  app.use('/api/shows', showsRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/uploads', eventsRouter);

  const uiDist = path.join(__dirname, '..', '..', 'ui', 'dist');
  app.use(express.static(uiDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(uiDist, 'index.html'));
  });

  return app;
}
```

- [ ] **Step 3: Delete basicAuth.ts**

```bash
git rm api/src/middleware/basicAuth.ts
```

- [ ] **Step 4: Run tests — confirm still passing**

```bash
cd api && npm test
```

Expected: 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add api/src/app.ts api/src/env.ts
git commit -m "feat: wire requireAuth into Express, remove basicAuth"
```

---

### Task 3: Frontend — AuthProvider and useAuth

**Files:**
- Modify: `ui/package.json`
- Create: `ui/.env.example`
- Create: `ui/src/auth/AuthProvider.tsx`
- Create: `ui/src/auth/useAuth.ts`

- [ ] **Step 1: Install oidc-client-ts**

```bash
cd ui && npm install oidc-client-ts
```

Expected: `"oidc-client-ts"` appears in `ui/package.json` dependencies.

- [ ] **Step 2: Create ui/.env.example and copy to ui/.env**

Create `ui/.env.example`:

```
VITE_ZITADEL_DOMAIN=onder-stroom-auth-n32ncs.eu1.zitadel.cloud
VITE_ZITADEL_CLIENT_ID=373451781885243427
```

Copy for local dev (Vite reads `ui/.env` automatically):

```bash
cp ui/.env.example ui/.env
```

- [ ] **Step 3: Create ui/src/auth/AuthProvider.tsx**

Create the file:

```typescript
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { UserManager, type User } from 'oidc-client-ts';

export const userManager = new UserManager({
  authority: `https://${import.meta.env.VITE_ZITADEL_DOMAIN}`,
  client_id: import.meta.env.VITE_ZITADEL_CLIENT_ID,
  redirect_uri: `${window.location.origin}/callback`,
  scope: 'openid profile email urn:zitadel:iam:org:project:roles',
  response_type: 'code',
});

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  userManager: UserManager;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    userManager.getUser().then(setUser).finally(() => setLoading(false));

    const handleUserLoaded = (u: User) => setUser(u);
    const handleUserUnloaded = () => setUser(null);

    userManager.events.addUserLoaded(handleUserLoaded);
    userManager.events.addUserUnloaded(handleUserUnloaded);

    return () => {
      userManager.events.removeUserLoaded(handleUserLoaded);
      userManager.events.removeUserUnloaded(handleUserUnloaded);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, userManager }}>
      {children}
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 4: Create ui/src/auth/useAuth.ts**

```typescript
import { useContext } from 'react';
import { AuthContext } from './AuthProvider';

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
```

- [ ] **Step 5: Commit**

```bash
git add ui/package.json ui/package-lock.json ui/.env.example ui/src/auth/AuthProvider.tsx ui/src/auth/useAuth.ts
git commit -m "feat: add AuthProvider and useAuth with oidc-client-ts"
```

---

### Task 4: Frontend — AuthCallback and AccessDenied pages

**Files:**
- Create: `ui/src/pages/AuthCallback.tsx`
- Create: `ui/src/pages/AccessDenied.tsx`

- [ ] **Step 1: Create ui/src/pages/AuthCallback.tsx**

```typescript
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

export default function AuthCallback() {
  const { userManager } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    userManager
      .signinRedirectCallback()
      .then(() => navigate('/', { replace: true }))
      .catch(() => navigate('/', { replace: true }));
  }, [userManager, navigate]);

  return null;
}
```

- [ ] **Step 2: Create ui/src/pages/AccessDenied.tsx**

```typescript
export default function AccessDenied() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-lg font-medium">Access pending approval</p>
        <p className="text-sm text-gray-400">
          Ask an admin to grant you the{' '}
          <span className="font-mono text-white">member</span> role in Zitadel.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/AuthCallback.tsx ui/src/pages/AccessDenied.tsx
git commit -m "feat: add AuthCallback and AccessDenied pages"
```

---

### Task 5: Wire auth into App.tsx and apiFetch

**Files:**
- Modify: `ui/src/api/client.ts`
- Modify: `ui/src/App.tsx`

- [ ] **Step 1: Update ui/src/api/client.ts**

Replace the full contents:

```typescript
import { userManager } from '../auth/AuthProvider';

export type AgendaShow = {
  id: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  imageUrl: string | null;
  tags: string[] | null;
};

export type GeneratedMeta = {
  youtubeDescription: string;
  mixcloudDescription: string;
  tags: string[];
};

export type PlatformJob = {
  id: string;
  upload_id: string;
  platform: 'youtube' | 'mixcloud' | 'archive';
  status: 'queued' | 'processing' | 'done' | 'failed';
  result_url: string | null;
  error: string | null;
  progress_pct: number;
};

export type UploadWithJobs = {
  id: string;
  show_id: string;
  title: string;
  description: string | null;
  tags: string[];
  video_s3_key: string;
  archive_s3_key: string | null;
  created_at: string;
  jobs: PlatformJob[];
};

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const user = await userManager.getUser();
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };
  if (user?.access_token) {
    headers['Authorization'] = `Bearer ${user.access_token}`;
  }
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  checkAuth: () => apiFetch<{ ok: boolean }>('/api/auth/me'),

  listShows: () => apiFetch<AgendaShow[]>('/api/shows'),

  generateMeta: (title: string, description: string) =>
    apiFetch<GeneratedMeta>(
      `/api/shows/meta?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`
    ),

  getPresignedUrl: (filename: string, contentType: string) =>
    apiFetch<{ url: string; key: string }>('/api/uploads/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, contentType }),
    }),

  createUpload: (body: {
    showId: string;
    title: string;
    description: string;
    tags: string[];
    imageUrl: string | null;
    videoS3Key: string;
    platforms: string[];
    includeJingle: boolean;
    trimStart?: string | null;
    trimEnd?: string | null;
  }) =>
    apiFetch<{ uploadId: string }>('/api/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  listUploads: () => apiFetch<UploadWithJobs[]>('/api/uploads'),

  listPendingVideos: () =>
    apiFetch<{ id: string; s3_key: string; filename: string; size_bytes: number; created_at: string }[]>(
      '/api/watcher/pending'
    ),

  claimPendingVideo: (id: string) =>
    apiFetch(`/api/watcher/pending/${id}`, { method: 'DELETE' }),
};
```

- [ ] **Step 2: Update ui/src/App.tsx**

Replace the full contents:

```typescript
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

  if (!user) {
    userManager.signinRedirect();
    return null;
  }

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
```

- [ ] **Step 3: Verify the dev server starts and auth flow works**

Start the API (needs `ZITADEL_DOMAIN` in `.env`):

```bash
cd api && npm run dev
```

In another terminal, start the UI:

```bash
cd ui && npm run dev
```

Open `http://localhost:5173`. Expected behaviour:
1. Browser immediately redirects to `https://onder-stroom-auth-n32ncs.eu1.zitadel.cloud` login page
2. Log in with a Zitadel account that has the `member` role → lands on the app
3. Log in with an account without `member` role → sees "Access pending approval"

- [ ] **Step 4: Commit**

```bash
git add ui/src/App.tsx ui/src/api/client.ts
git commit -m "feat: wire Zitadel auth into App and apiFetch"
```

---

### Task 6: Env files and README

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Update root .env.example**

Replace the full contents of `.env.example`:

```
# Shows Agenda API
SHOWS_API_URL=https://your-agenda-api.com
SHOWS_API_KEY=your-bearer-token

# Neon (managed Postgres)
DATABASE_URI=postgresql://user:pass@host.neon.tech/dbname?sslmode=require

# Minio (S3-compatible, runs in Docker)
S3_ACCESS_KEY=your-minio-root-user
S3_SECRET_KEY=your-minio-root-password   # min 8 chars
S3_BUCKET=show-uploader
S3_REGION=us-east-1
# S3_ENDPOINT is set automatically to http://minio:9000 inside Docker
# For external access (watcher script on Windows), use your server's public URL:
# S3_ENDPOINT=https://minio.your-domain.com

# Redis (set automatically in Docker Compose)
REDIS_URL=redis://localhost:6379

# Groq AI
GROQ_API_KEY=your-groq-api-key

# YouTube OAuth2
YOUTUBE_CLIENT_ID=your-client-id.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=your-client-secret
YOUTUBE_REFRESH_TOKEN=your-refresh-token

# MixCloud
MIXCLOUD_ACCESS_TOKEN=your-access-token

# Archive quality (ffmpeg bitrate strings)
ARCHIVE_VIDEO_BITRATE=4000k
ARCHIVE_AUDIO_BITRATE=256k

# Jingle S3 key (optional — leave empty to disable)
JINGLE_S3_KEY=jingles/intro.m4a

# Watcher — API key used by the Windows drop folder watcher
WATCHER_API_KEY=generate-a-random-secret-here

# Zitadel (OIDC authentication)
# The domain of your Zitadel instance (no https://, no trailing slash)
ZITADEL_DOMAIN=onder-stroom-auth-n32ncs.eu1.zitadel.cloud

# App
PORT=3000
NODE_ENV=production
```

- [ ] **Step 2: Update README auth section**

Find the `## Authentication` section in `README.md` and replace it with:

```markdown
## Authentication

| Route | Auth |
|---|---|
| Web UI + all `/api/*` routes | Zitadel OIDC — valid JWT with `member` role required |
| `POST /api/watcher/notify` | Bearer token (`WATCHER_API_KEY`) — unaffected by Zitadel |

Users who sign up via Zitadel but haven't been granted the `member` role see "Access pending approval" and cannot use the app. To grant access: Zitadel console → Projects → Team → Users → find the user → assign role `member`.

UI env vars — set in `ui/.env` (not committed to git):

```
VITE_ZITADEL_DOMAIN=onder-stroom-auth-n32ncs.eu1.zitadel.cloud
VITE_ZITADEL_CLIENT_ID=373451781885243427
```

The `ZITADEL_DOMAIN` variable (without `VITE_` prefix) is also required in the root `.env` for the API server.
```

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: update env example and README for Zitadel auth"
```
