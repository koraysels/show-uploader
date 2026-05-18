# Show Uploader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Dockerized TypeScript tool that uploads recorded music shows to YouTube and MixCloud from a single video file, with metadata sourced from an external shows agenda API and AI-generated copy.

**Architecture:** Three Docker containers (api, worker, redis) + Neon (managed Postgres) + Netcup S3. The API container serves an Express backend and React UI; the worker container processes BullMQ jobs (ffmpeg, platform uploads, archiving). Video files upload directly from the browser to S3 via presigned URLs — never through the API server.

**Tech Stack:** TypeScript 5, Node 20, Express, React + Vite, BullMQ + Redis, postgres (pg driver), @aws-sdk/client-s3, googleapis (YouTube), fluent-ffmpeg, groq-sdk, zod, vitest, Tailwind CSS

---

## File Map

```
show-uploader/
├── package.json                    (root, npm workspaces)
├── docker-compose.yml
├── .env.example
├── api/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                server entry point
│       ├── app.ts                  Express app factory (testable)
│       ├── env.ts                  zod env validation
│       ├── db/
│       │   ├── client.ts           Neon postgres client
│       │   ├── queries.ts          all DB queries
│       │   └── migrations/
│       │       └── 001_initial.sql schema
│       ├── queue/
│       │   └── index.ts            BullMQ Queue instance
│       ├── routes/
│       │   ├── shows.ts            GET /api/shows
│       │   ├── uploads.ts          POST/GET /api/uploads
│       │   └── events.ts           GET /api/uploads/:id/events (SSE)
│       └── services/
│           ├── shows-api.ts        fetch from agenda API
│           ├── s3.ts               presigned URL generation
│           └── groq.ts             AI description generation
├── worker/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                worker entry, register processors
│       ├── env.ts                  zod env validation
│       ├── jobs/
│       │   ├── youtube.ts          YouTube upload processor
│       │   ├── mixcloud.ts         MixCloud audio extract + upload
│       │   └── archive.ts          MKV → MP4 archive processor
│       └── services/
│           ├── s3.ts               S3 download/upload helpers
│           ├── ffmpeg.ts           fluent-ffmpeg wrappers
│           ├── youtube-client.ts   googleapis wrapper
│           ├── mixcloud-client.ts  MixCloud API wrapper
│           └── shows-api.ts        write back upload URLs
└── ui/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/
        │   └── client.ts           fetch wrappers for API endpoints
        ├── pages/
        │   ├── NewUpload.tsx       upload form page
        │   └── History.tsx         upload history page
        └── components/
            ├── ShowPicker.tsx      dropdown from agenda API
            ├── MetadataForm.tsx    title/description/tags/image fields
            ├── FileDropzone.tsx    direct-to-S3 file upload
            ├── PlatformSelector.tsx YouTube / MixCloud toggles
            └── JobProgress.tsx     SSE-driven progress bars
```

---

## Task 1: Root scaffold + npm workspaces + Docker Compose

**Files:**
- Modify: `package.json`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Update root package.json for workspaces**

Replace `/Users/koraysels/work/show-uploader/package.json`:
```json
{
  "name": "show-uploader",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["api", "worker", "ui"]
}
```

- [ ] **Step 2: Create docker-compose.yml**

Create `/Users/koraysels/work/show-uploader/docker-compose.yml`:
```yaml
services:
  api:
    build:
      context: .
      dockerfile: api/Dockerfile
    ports:
      - "3000:3000"
    env_file: .env
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    volumes:
      - ./api/src:/app/api/src
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: worker/Dockerfile
    env_file: .env
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

- [ ] **Step 3: Create .env.example**

Create `/Users/koraysels/work/show-uploader/.env.example`:
```env
# Shows Agenda API
SHOWS_API_URL=https://your-agenda-api.com
SHOWS_API_TOKEN=your-bearer-token

# Netcup S3-compatible storage
S3_ENDPOINT=https://your-s3-endpoint.netcup.net
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
S3_BUCKET=show-uploader
S3_REGION=us-east-1

# Neon (managed Postgres)
DATABASE_URL=postgresql://user:pass@host.neon.tech/dbname?sslmode=require

# Redis (set automatically in Docker Compose via environment)
REDIS_URL=redis://localhost:6379

# Groq AI
GROQ_API_KEY=your-groq-api-key

# YouTube OAuth2
# Setup: https://console.cloud.google.com → YouTube Data API v3 → OAuth2 credentials
YOUTUBE_CLIENT_ID=your-client-id.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=your-client-secret
YOUTUBE_REFRESH_TOKEN=your-refresh-token

# MixCloud OAuth2
# Setup: https://www.mixcloud.com/developers/
MIXCLOUD_CLIENT_ID=your-client-id
MIXCLOUD_CLIENT_SECRET=your-client-secret
MIXCLOUD_ACCESS_TOKEN=your-access-token

# Archive quality (ffmpeg bitrate strings)
ARCHIVE_VIDEO_BITRATE=4000k
ARCHIVE_AUDIO_BITRATE=256k

# Jingle S3 key (optional, leave empty to skip)
JINGLE_S3_KEY=jingles/intro.m4a

# App
PORT=3000
NODE_ENV=production
```

- [ ] **Step 4: Update .gitignore**

Replace `/Users/koraysels/work/show-uploader/.gitignore`:
```
node_modules/
dist/
.env
*.tsbuildinfo
ui/dist/
tmp/
```

- [ ] **Step 5: Commit**
```bash
git add package.json docker-compose.yml .env.example .gitignore
git commit -m "feat: root scaffold with npm workspaces and docker-compose"
```

---

## Task 2: API package scaffold

**Files:**
- Create: `api/package.json`
- Create: `api/tsconfig.json`
- Create: `api/src/env.ts`
- Create: `api/src/app.ts`
- Create: `api/src/index.ts`
- Create: `api/Dockerfile`

- [ ] **Step 1: Create api/package.json**

```json
{
  "name": "@show-uploader/api",
  "version": "1.0.0",
  "private": true,
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.600.0",
    "@aws-sdk/s3-request-presigner": "^3.600.0",
    "bullmq": "^5.12.0",
    "cors": "^2.8.5",
    "express": "^4.19.0",
    "groq-sdk": "^0.5.0",
    "ioredis": "^5.4.1",
    "postgres": "^3.4.4",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.0.0",
    "tsx": "^4.15.0",
    "typescript": "^5.5.3",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create api/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create api/src/env.ts**

```typescript
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_BUCKET: z.string(),
  S3_REGION: z.string().default('us-east-1'),
  SHOWS_API_URL: z.string().url(),
  SHOWS_API_TOKEN: z.string(),
  GROQ_API_KEY: z.string(),
  PORT: z.string().default('3000'),
  NODE_ENV: z.string().default('development'),
});

export const env = schema.parse(process.env);
```

- [ ] **Step 4: Create api/src/app.ts**

```typescript
import express from 'express';
import cors from 'cors';
import path from 'path';
import { showsRouter } from './routes/shows';
import { uploadsRouter } from './routes/uploads';
import { eventsRouter } from './routes/events';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/shows', showsRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/uploads', eventsRouter);

  // Serve React UI
  const uiDist = path.join(__dirname, '../../ui/dist');
  app.use(express.static(uiDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(uiDist, 'index.html'));
  });

  return app;
}
```

- [ ] **Step 5: Create api/src/index.ts**

```typescript
import { createApp } from './app';
import { env } from './env';
import { db } from './db/client';
import { runMigrations } from './db/migrate';

async function main() {
  await runMigrations(db);
  const app = createApp();
  app.listen(Number(env.PORT), () => {
    console.log(`API listening on port ${env.PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start API:', err);
  process.exit(1);
});
```

- [ ] **Step 6: Create api/Dockerfile**

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json .
COPY api/package.json api/
RUN npm install --workspace=@show-uploader/api

FROM base AS ui-builder
COPY ui/package.json ui/
RUN npm install --workspace=@show-uploader/ui --ignore-scripts
COPY ui/ ui/
RUN npm run build --workspace=@show-uploader/ui

FROM base AS builder
COPY api/src/ api/src/
COPY api/tsconfig.json api/
RUN npm run build --workspace=@show-uploader/api

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/api/dist api/dist
COPY --from=builder /app/node_modules node_modules
COPY --from=ui-builder /app/ui/dist ui/dist
EXPOSE 3000
CMD ["node", "api/dist/index.js"]
```

- [ ] **Step 7: Commit**
```bash
git add api/
git commit -m "feat: api package scaffold"
```

---

## Task 3: Database schema + client + queries

**Files:**
- Create: `api/src/db/client.ts`
- Create: `api/src/db/migrations/001_initial.sql`
- Create: `api/src/db/migrate.ts`
- Create: `api/src/db/queries.ts`

- [ ] **Step 1: Create api/src/db/client.ts**

```typescript
import postgres from 'postgres';
import { env } from '../env';

export const db = postgres(env.DATABASE_URL, {
  ssl: 'require',
  max: 10,
});
```

- [ ] **Step 2: Create api/src/db/migrations/001_initial.sql**

```sql
CREATE TABLE IF NOT EXISTS show_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  image_url TEXT,
  video_s3_key TEXT NOT NULL,
  archive_s3_key TEXT,
  jingle_s3_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES show_uploads(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'mixcloud', 'archive')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  result_url TEXT,
  error TEXT,
  progress_pct INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_jobs_upload_id ON platform_jobs(upload_id);
CREATE INDEX IF NOT EXISTS idx_platform_jobs_status ON platform_jobs(status);
```

- [ ] **Step 3: Create api/src/db/migrate.ts**

```typescript
import fs from 'fs';
import path from 'path';
import type { Sql } from 'postgres';

export async function runMigrations(db: Sql) {
  await db`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      ran_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  for (const file of files) {
    const [ran] = await db`
      SELECT filename FROM schema_migrations WHERE filename = ${file}
    `;
    if (ran) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await db.unsafe(sql);
    await db`INSERT INTO schema_migrations (filename) VALUES (${file})`;
    console.log(`Migration applied: ${file}`);
  }
}
```

- [ ] **Step 4: Create api/src/db/queries.ts**

```typescript
import type { Sql } from 'postgres';

export type ShowUpload = {
  id: string;
  show_id: string;
  title: string;
  description: string | null;
  tags: string[];
  image_url: string | null;
  video_s3_key: string;
  archive_s3_key: string | null;
  jingle_s3_key: string | null;
  created_at: Date;
};

export type PlatformJob = {
  id: string;
  upload_id: string;
  platform: 'youtube' | 'mixcloud' | 'archive';
  status: 'queued' | 'processing' | 'done' | 'failed';
  result_url: string | null;
  error: string | null;
  progress_pct: number;
  created_at: Date;
  updated_at: Date;
};

export function createUpload(
  db: Sql,
  data: Pick<ShowUpload, 'show_id' | 'title' | 'description' | 'tags' | 'image_url' | 'video_s3_key' | 'jingle_s3_key'>
) {
  return db<ShowUpload[]>`
    INSERT INTO show_uploads (show_id, title, description, tags, image_url, video_s3_key, jingle_s3_key)
    VALUES (${data.show_id}, ${data.title}, ${data.description ?? null}, ${db.array(data.tags)},
            ${data.image_url ?? null}, ${data.video_s3_key}, ${data.jingle_s3_key ?? null})
    RETURNING *
  `.then((rows) => rows[0]);
}

export function createPlatformJob(
  db: Sql,
  data: Pick<PlatformJob, 'upload_id' | 'platform'>
) {
  return db<PlatformJob[]>`
    INSERT INTO platform_jobs (upload_id, platform)
    VALUES (${data.upload_id}, ${data.platform})
    RETURNING *
  `.then((rows) => rows[0]);
}

export function getUploadWithJobs(db: Sql, uploadId: string) {
  return db<(ShowUpload & { jobs: PlatformJob[] })[]>`
    SELECT
      u.*,
      COALESCE(
        json_agg(j ORDER BY j.created_at) FILTER (WHERE j.id IS NOT NULL),
        '[]'
      ) AS jobs
    FROM show_uploads u
    LEFT JOIN platform_jobs j ON j.upload_id = u.id
    WHERE u.id = ${uploadId}
    GROUP BY u.id
  `.then((rows) => rows[0] ?? null);
}

export function listUploadsWithJobs(db: Sql) {
  return db<(ShowUpload & { jobs: PlatformJob[] })[]>`
    SELECT
      u.*,
      COALESCE(
        json_agg(j ORDER BY j.created_at) FILTER (WHERE j.id IS NOT NULL),
        '[]'
      ) AS jobs
    FROM show_uploads u
    LEFT JOIN platform_jobs j ON j.upload_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
    LIMIT 50
  `;
}

export function updateJobStatus(
  db: Sql,
  jobId: string,
  update: Partial<Pick<PlatformJob, 'status' | 'result_url' | 'error' | 'progress_pct'>>
) {
  return db`
    UPDATE platform_jobs
    SET
      status = COALESCE(${update.status ?? null}, status),
      result_url = COALESCE(${update.result_url ?? null}, result_url),
      error = COALESCE(${update.error ?? null}, error),
      progress_pct = COALESCE(${update.progress_pct ?? null}, progress_pct),
      updated_at = NOW()
    WHERE id = ${jobId}
  `;
}

export function updateArchiveKey(db: Sql, uploadId: string, archiveS3Key: string) {
  return db`
    UPDATE show_uploads SET archive_s3_key = ${archiveS3Key} WHERE id = ${uploadId}
  `;
}

export function getPlatformJobsForUpload(db: Sql, uploadId: string) {
  return db<PlatformJob[]>`
    SELECT * FROM platform_jobs WHERE upload_id = ${uploadId}
  `;
}
```

- [ ] **Step 5: Commit**
```bash
git add api/src/db/
git commit -m "feat: database schema, migrations, and query layer"
```

---

## Task 4: BullMQ queue + Redis connection

**Files:**
- Create: `api/src/queue/index.ts`

- [ ] **Step 1: Create api/src/queue/index.ts**

```typescript
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../env';

export const QUEUE_NAME = 'platform-uploads';

export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const uploadQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

export type JobPayload = {
  jobId: string;        // platform_jobs.id
  uploadId: string;     // show_uploads.id
  platform: 'youtube' | 'mixcloud' | 'archive';
  videoS3Key: string;
  title: string;
  description: string;
  tags: string[];
  imageUrl: string | null;
  jingleS3Key: string | null;
  includeJingle: boolean;
};
```

- [ ] **Step 2: Commit**
```bash
git add api/src/queue/
git commit -m "feat: bullmq queue setup"
```

---

## Task 5: Shows agenda API client + S3 presigned URL service + Groq service

**Files:**
- Create: `api/src/services/shows-api.ts`
- Create: `api/src/services/s3.ts`
- Create: `api/src/services/groq.ts`

- [ ] **Step 1: Create api/src/services/shows-api.ts**

```typescript
import { env } from '../env';

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

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${env.SHOWS_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.SHOWS_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`Shows API error: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export function listShows(params?: { from?: string; to?: string; status?: string }) {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return apiFetch<AgendaShow[]>(`/shows${qs ? `?${qs}` : ''}`);
}

export function getShow(id: string) {
  return apiFetch<AgendaShow>(`/shows/${id}`);
}

export function writeBackUrls(
  id: string,
  uploads: { youtube?: string; mixcloud?: string }
) {
  return apiFetch(`/shows/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ uploads }),
  });
}
```

- [ ] **Step 2: Create api/src/services/s3.ts**

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env';

export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

export async function createUploadPresignedUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(s3, command, { expiresIn: 3600 * 6 }); // 6h
  return url;
}
```

- [ ] **Step 3: Create api/src/services/groq.ts**

```typescript
import Groq from 'groq-sdk';
import { env } from '../env';

const groq = new Groq({ apiKey: env.GROQ_API_KEY });

export type GeneratedMeta = {
  youtubeDescription: string;
  mixcloudDescription: string;
  tags: string[];
};

export async function generateMeta(
  title: string,
  description: string
): Promise<GeneratedMeta> {
  const chat = await groq.chat.completions.create({
    model: 'llama3-70b-8192',
    messages: [
      {
        role: 'system',
        content: `You write copy for music show uploads. Rules: brief, human, no hype, no filler, no buzzwords. The music is the value — the text just sets context. Never mention AI. Respond with JSON only.`,
      },
      {
        role: 'user',
        content: `Show: "${title}"\nNotes: "${description}"\n\nReturn JSON:\n{"youtubeDescription":"2-3 lines max","mixcloudDescription":"1-2 lines max","tags":["5 to 8 lowercase tags"]}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4,
  });

  const raw = chat.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw) as Partial<GeneratedMeta>;

  return {
    youtubeDescription: parsed.youtubeDescription ?? title,
    mixcloudDescription: parsed.mixcloudDescription ?? title,
    tags: parsed.tags ?? [],
  };
}
```

- [ ] **Step 4: Commit**
```bash
git add api/src/services/
git commit -m "feat: shows API client, S3 presigned URLs, Groq AI service"
```

---

## Task 6: API routes

**Files:**
- Create: `api/src/routes/shows.ts`
- Create: `api/src/routes/uploads.ts`
- Create: `api/src/routes/events.ts`

- [ ] **Step 1: Create api/src/routes/shows.ts**

```typescript
import { Router } from 'express';
import { listShows } from '../services/shows-api';
import { generateMeta } from '../services/groq';

export const showsRouter = Router();

// GET /api/shows
showsRouter.get('/', async (req, res) => {
  try {
    const shows = await listShows({ status: 'all' });
    res.json(shows);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch shows' });
  }
});

// GET /api/shows/:id/meta — generate AI metadata for a show
showsRouter.get('/:id/meta', async (req, res) => {
  try {
    const { title, description } = req.query as Record<string, string>;
    const meta = await generateMeta(title ?? '', description ?? '');
    res.json(meta);
  } catch (err) {
    res.status(502).json({ error: 'Failed to generate metadata' });
  }
});
```

- [ ] **Step 2: Create api/src/routes/uploads.ts**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { createUpload, createPlatformJob, listUploadsWithJobs, getUploadWithJobs } from '../db/queries';
import { uploadQueue } from '../queue';
import { createUploadPresignedUrl } from '../services/s3';
import { env } from '../env';

export const uploadsRouter = Router();

const CreateUploadSchema = z.object({
  showId: z.string(),
  title: z.string().min(1),
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
  imageUrl: z.string().url().nullable().default(null),
  videoS3Key: z.string().min(1),
  platforms: z.array(z.enum(['youtube', 'mixcloud'])).min(1),
  includeJingle: z.boolean().default(true),
});

// POST /api/uploads/presign — get a presigned URL to upload video directly to S3
uploadsRouter.post('/presign', async (req, res) => {
  const { filename, contentType } = req.body as { filename: string; contentType: string };
  if (!filename || !contentType) {
    return res.status(400).json({ error: 'filename and contentType required' });
  }
  const key = `uploads/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  try {
    const url = await createUploadPresignedUrl(key, contentType);
    res.json({ url, key });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create presigned URL' });
  }
});

// POST /api/uploads — create upload record and queue jobs
uploadsRouter.post('/', async (req, res) => {
  const parsed = CreateUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const data = parsed.data;
  const jingleS3Key = env.JINGLE_S3_KEY || null;

  try {
    const upload = await createUpload(db, {
      show_id: data.showId,
      title: data.title,
      description: data.description,
      tags: data.tags,
      image_url: data.imageUrl,
      video_s3_key: data.videoS3Key,
      jingle_s3_key: jingleS3Key,
    });

    const jobs = await Promise.all(
      data.platforms.map((platform) => createPlatformJob(db, { upload_id: upload.id, platform }))
    );

    await Promise.all(
      jobs.map((job) =>
        uploadQueue.add(job.platform, {
          jobId: job.id,
          uploadId: upload.id,
          platform: job.platform,
          videoS3Key: data.videoS3Key,
          title: data.title,
          description: data.description,
          tags: data.tags,
          imageUrl: data.imageUrl,
          jingleS3Key,
          includeJingle: data.includeJingle,
        })
      )
    );

    res.status(201).json({ uploadId: upload.id, jobs });
  } catch (err) {
    console.error('Failed to create upload:', err);
    res.status(500).json({ error: 'Failed to create upload' });
  }
});

// GET /api/uploads — list all uploads
uploadsRouter.get('/', async (_req, res) => {
  try {
    const uploads = await listUploadsWithJobs(db);
    res.json(uploads);
  } catch {
    res.status(500).json({ error: 'Failed to list uploads' });
  }
});

// GET /api/uploads/:id — single upload with jobs
uploadsRouter.get('/:id', async (req, res) => {
  try {
    const upload = await getUploadWithJobs(db, req.params.id);
    if (!upload) return res.status(404).json({ error: 'Not found' });
    res.json(upload);
  } catch {
    res.status(500).json({ error: 'Failed to get upload' });
  }
});
```

Note: Add `JINGLE_S3_KEY` to `api/src/env.ts` schema:
```typescript
JINGLE_S3_KEY: z.string().optional(),
```

- [ ] **Step 3: Create api/src/routes/events.ts (SSE)**

```typescript
import { Router } from 'express';
import { QueueEvents } from 'bullmq';
import { redis, QUEUE_NAME } from '../queue';

export const eventsRouter = Router();

// GET /api/uploads/:id/events — SSE stream for job progress
eventsRouter.get('/:id/events', (req, res) => {
  const uploadId = req.params.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const queueEvents = new QueueEvents(QUEUE_NAME, { connection: redis });

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const onProgress = ({ jobId, data }: { jobId: string; data: unknown }) => {
    const progress = data as { uploadId?: string; platform?: string; pct?: number };
    if (progress.uploadId === uploadId) {
      send({ type: 'progress', jobId, platform: progress.platform, pct: progress.pct });
    }
  };

  const onCompleted = ({ jobId, returnvalue }: { jobId: string; returnvalue: string }) => {
    const result = JSON.parse(returnvalue || '{}') as { uploadId?: string; platform?: string; url?: string };
    if (result.uploadId === uploadId) {
      send({ type: 'completed', jobId, platform: result.platform, url: result.url });
    }
  };

  const onFailed = ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
    send({ type: 'failed', jobId, error: failedReason });
  };

  queueEvents.on('progress', onProgress);
  queueEvents.on('completed', onCompleted);
  queueEvents.on('failed', onFailed);

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    queueEvents.close();
  });
});
```

- [ ] **Step 4: Commit**
```bash
git add api/src/routes/
git commit -m "feat: API routes for shows, uploads, and SSE events"
```

---

## Task 7: Worker package scaffold

**Files:**
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/src/env.ts`
- Create: `worker/Dockerfile`
- Create: `worker/src/index.ts`

- [ ] **Step 1: Create worker/package.json**

```json
{
  "name": "@show-uploader/worker",
  "version": "1.0.0",
  "private": true,
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.600.0",
    "bullmq": "^5.12.0",
    "fluent-ffmpeg": "^2.1.3",
    "form-data": "^4.0.0",
    "googleapis": "^140.0.0",
    "ioredis": "^5.4.1",
    "node-fetch": "^3.3.2",
    "postgres": "^3.4.4",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/fluent-ffmpeg": "^2.1.24",
    "@types/node": "^20.0.0",
    "tsx": "^4.15.0",
    "typescript": "^5.5.3",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create worker/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create worker/src/env.ts**

```typescript
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_BUCKET: z.string(),
  S3_REGION: z.string().default('us-east-1'),
  SHOWS_API_URL: z.string().url(),
  SHOWS_API_TOKEN: z.string(),
  YOUTUBE_CLIENT_ID: z.string(),
  YOUTUBE_CLIENT_SECRET: z.string(),
  YOUTUBE_REFRESH_TOKEN: z.string(),
  MIXCLOUD_ACCESS_TOKEN: z.string(),
  ARCHIVE_VIDEO_BITRATE: z.string().default('4000k'),
  ARCHIVE_AUDIO_BITRATE: z.string().default('256k'),
  JINGLE_S3_KEY: z.string().optional(),
});

export const env = schema.parse(process.env);
```

- [ ] **Step 4: Create worker/Dockerfile**

```dockerfile
FROM node:20-alpine AS builder
RUN apk add --no-cache ffmpeg python3 make g++
WORKDIR /app
COPY package.json .
COPY worker/package.json worker/
RUN npm install --workspace=@show-uploader/worker
COPY worker/src/ worker/src/
COPY worker/tsconfig.json worker/
RUN npm run build --workspace=@show-uploader/worker

FROM node:20-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY --from=builder /app/worker/dist worker/dist
COPY --from=builder /app/node_modules node_modules
CMD ["node", "worker/dist/index.js"]
```

- [ ] **Step 5: Create worker/src/index.ts**

```typescript
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env';
import { processYoutube } from './jobs/youtube';
import { processMixcloud } from './jobs/mixcloud';
import { processArchive } from './jobs/archive';
import type { JobPayload } from './types';

const QUEUE_NAME = 'platform-uploads';

const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker<JobPayload>(
  QUEUE_NAME,
  async (job) => {
    console.log(`Processing job ${job.id}: ${job.name} for upload ${job.data.uploadId}`);
    switch (job.data.platform) {
      case 'youtube': return processYoutube(job);
      case 'mixcloud': return processMixcloud(job);
      case 'archive': return processArchive(job);
      default: throw new Error(`Unknown platform: ${job.data.platform}`);
    }
  },
  {
    connection: redis,
    concurrency: 2,
  }
);

worker.on('completed', (job) => {
  console.log(`Job completed: ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`Job failed: ${job?.id}`, err.message);
});

console.log('Worker started');
```

- [ ] **Step 6: Create worker/src/types.ts**

```typescript
export type JobPayload = {
  jobId: string;
  uploadId: string;
  platform: 'youtube' | 'mixcloud' | 'archive';
  videoS3Key: string;
  title: string;
  description: string;
  tags: string[];
  imageUrl: string | null;
  jingleS3Key: string | null;
  includeJingle: boolean;
};
```

- [ ] **Step 7: Commit**
```bash
git add worker/
git commit -m "feat: worker package scaffold with bullmq processor"
```

---

## Task 8: Worker S3 + ffmpeg services

**Files:**
- Create: `worker/src/services/s3.ts`
- Create: `worker/src/services/ffmpeg.ts`

- [ ] **Step 1: Create worker/src/services/s3.ts**

```typescript
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { env } from '../env';

export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

export async function downloadFromS3(key: string, destPath: string): Promise<void> {
  const cmd = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key });
  const { Body } = await s3.send(cmd);
  if (!Body) throw new Error(`Empty body for S3 key: ${key}`);

  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const stream = (Body as NodeJS.ReadableStream).pipe(fs.createWriteStream(destPath));
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

export async function uploadToS3(localPath: string, key: string, contentType: string): Promise<void> {
  const body = fs.createReadStream(localPath);
  const stat = await fs.promises.stat(localPath);
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: stat.size,
    })
  );
}

export async function deleteFromS3(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}
```

- [ ] **Step 2: Create worker/src/services/ffmpeg.ts**

```typescript
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { env } from '../env';

export async function extractAudio(
  videoPath: string,
  outputPath: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(videoPath)
      .noVideo()
      .audioCodec('aac')
      .audioBitrate(env.ARCHIVE_AUDIO_BITRATE)
      .output(outputPath);

    if (onProgress) {
      cmd.on('progress', (p: { percent?: number }) => onProgress(Math.round(p.percent ?? 0)));
    }

    cmd.on('end', resolve).on('error', reject).run();
  });
}

export async function prependJingle(
  jinglePath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const listFile = `${outputPath}.txt`;
    fs.writeFileSync(listFile, `file '${jinglePath}'\nfile '${audioPath}'\n`);

    ffmpeg()
      .input(listFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .audioCodec('aac')
      .audioBitrate(env.ARCHIVE_AUDIO_BITRATE)
      .output(outputPath)
      .on('end', () => {
        fs.unlinkSync(listFile);
        resolve();
      })
      .on('error', (err: Error) => {
        fs.unlinkSync(listFile);
        reject(err);
      })
      .run();
  });
}

export async function transcodeToMp4(
  inputPath: string,
  outputPath: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputPath)
      .videoCodec('libx264')
      .videoBitrate(env.ARCHIVE_VIDEO_BITRATE)
      .audioCodec('aac')
      .audioBitrate(env.ARCHIVE_AUDIO_BITRATE)
      .outputOptions(['-movflags', '+faststart'])
      .output(outputPath);

    if (onProgress) {
      cmd.on('progress', (p: { percent?: number }) => onProgress(Math.round(p.percent ?? 0)));
    }

    cmd.on('end', resolve).on('error', reject).run();
  });
}

export function makeTempPath(suffix: string): string {
  const dir = path.join('/tmp', 'show-uploader');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${Date.now()}-${suffix}`);
}

export function cleanup(...paths: string[]): void {
  for (const p of paths) {
    try { fs.unlinkSync(p); } catch { /* ignore */ }
  }
}
```

- [ ] **Step 3: Commit**
```bash
git add worker/src/services/s3.ts worker/src/services/ffmpeg.ts
git commit -m "feat: worker S3 and ffmpeg service helpers"
```

---

## Task 9: Worker platform clients (YouTube + MixCloud)

**Files:**
- Create: `worker/src/services/youtube-client.ts`
- Create: `worker/src/services/mixcloud-client.ts`
- Create: `worker/src/services/shows-api.ts`

- [ ] **Step 1: Create worker/src/services/youtube-client.ts**

```typescript
import { google } from 'googleapis';
import fs from 'fs';
import { env } from '../env';

function getYouTubeClient() {
  const auth = new google.auth.OAuth2(
    env.YOUTUBE_CLIENT_ID,
    env.YOUTUBE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: env.YOUTUBE_REFRESH_TOKEN });
  return google.youtube({ version: 'v3', auth });
}

export async function uploadToYoutube(params: {
  videoPath: string;
  title: string;
  description: string;
  tags: string[];
  imagePath?: string;
  onProgress?: (pct: number) => void;
}): Promise<string> {
  const youtube = getYouTubeClient();
  const stat = fs.statSync(params.videoPath);
  let uploaded = 0;

  const res = await youtube.videos.insert(
    {
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: params.title,
          description: params.description,
          tags: params.tags,
          categoryId: '10', // Music
        },
        status: { privacyStatus: 'public' },
      },
      media: {
        mimeType: 'video/x-matroska',
        body: fs.createReadStream(params.videoPath).on('data', (chunk: Buffer) => {
          uploaded += chunk.length;
          params.onProgress?.(Math.round((uploaded / stat.size) * 100));
        }),
      },
    },
    {
      onUploadProgress: (evt: { bytesRead: number }) => {
        params.onProgress?.(Math.round((evt.bytesRead / stat.size) * 100));
      },
    }
  );

  const videoId = res.data.id;
  if (!videoId) throw new Error('YouTube upload returned no video ID');

  // Set thumbnail if provided
  if (params.imagePath && fs.existsSync(params.imagePath)) {
    await youtube.thumbnails.set({
      videoId,
      media: { body: fs.createReadStream(params.imagePath) },
    });
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
}
```

- [ ] **Step 2: Create worker/src/services/mixcloud-client.ts**

```typescript
import FormData from 'form-data';
import fs from 'fs';
import { env } from '../env';

export async function uploadToMixcloud(params: {
  audioPath: string;
  title: string;
  description: string;
  tags: string[];
  imagePath?: string;
}): Promise<string> {
  const form = new FormData();
  form.append('mp3', fs.createReadStream(params.audioPath));
  form.append('name', params.title);
  form.append('description', params.description);
  params.tags.slice(0, 5).forEach((tag, i) => {
    form.append(`tags-${i}-tag`, tag);
  });
  if (params.imagePath && fs.existsSync(params.imagePath)) {
    form.append('picture', fs.createReadStream(params.imagePath));
  }

  const res = await fetch(
    `https://api.mixcloud.com/me/cloudcast/?access_token=${env.MIXCLOUD_ACCESS_TOKEN}`,
    { method: 'POST', body: form as unknown as BodyInit, headers: form.getHeaders() }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MixCloud upload failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { key?: string; error?: { message: string } };
  if (data.error) throw new Error(`MixCloud error: ${data.error.message}`);
  if (!data.key) throw new Error('MixCloud returned no key');

  return `https://www.mixcloud.com${data.key}`;
}
```

- [ ] **Step 3: Create worker/src/services/shows-api.ts**

```typescript
import { env } from '../env';

export async function writeBackUrls(
  showId: string,
  uploads: { youtube?: string; mixcloud?: string }
): Promise<void> {
  const res = await fetch(`${env.SHOWS_API_URL}/shows/${showId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${env.SHOWS_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uploads }),
  });
  if (!res.ok) {
    console.error(`Failed to write back URLs: ${res.status}`);
  }
}
```

- [ ] **Step 4: Commit**
```bash
git add worker/src/services/
git commit -m "feat: YouTube and MixCloud API clients, shows API writeback"
```

---

## Task 10: Worker job processors

**Files:**
- Create: `worker/src/jobs/youtube.ts`
- Create: `worker/src/jobs/mixcloud.ts`
- Create: `worker/src/jobs/archive.ts`
- Create: `worker/src/db.ts`

- [ ] **Step 1: Create worker/src/db.ts** (DB client + status update for worker)

```typescript
import postgres from 'postgres';
import { env } from './env';

export const db = postgres(env.DATABASE_URL, { ssl: 'require', max: 5 });

export async function setJobStatus(
  jobId: string,
  status: string,
  extra: { result_url?: string; error?: string; progress_pct?: number } = {}
) {
  await db`
    UPDATE platform_jobs
    SET
      status = ${status},
      result_url = COALESCE(${extra.result_url ?? null}, result_url),
      error = COALESCE(${extra.error ?? null}, error),
      progress_pct = COALESCE(${extra.progress_pct ?? null}, progress_pct),
      updated_at = NOW()
    WHERE id = ${jobId}
  `;
}

export async function getPlatformJobsForUpload(uploadId: string) {
  return db<{ id: string; platform: string; status: string }[]>`
    SELECT id, platform, status FROM platform_jobs WHERE upload_id = ${uploadId}
  `;
}

export async function getShowIdForUpload(uploadId: string) {
  const rows = await db<{ show_id: string; jingle_s3_key: string | null }[]>`
    SELECT show_id, jingle_s3_key FROM show_uploads WHERE id = ${uploadId}
  `;
  return rows[0] ?? null;
}

export async function setArchiveKey(uploadId: string, key: string) {
  await db`UPDATE show_uploads SET archive_s3_key = ${key} WHERE id = ${uploadId}`;
}
```

- [ ] **Step 2: Create worker/src/jobs/youtube.ts**

```typescript
import type { Job } from 'bullmq';
import type { JobPayload } from '../types';
import { downloadFromS3 } from '../services/s3';
import { uploadToYoutube } from '../services/youtube-client';
import { writeBackUrls } from '../services/shows-api';
import { setJobStatus, getShowIdForUpload } from '../db';
import { makeTempPath, cleanup } from '../services/ffmpeg';
import path from 'path';

export async function processYoutube(job: Job<JobPayload>): Promise<string> {
  const { jobId, uploadId, videoS3Key, title, description, tags, imageUrl } = job.data;

  await setJobStatus(jobId, 'processing');

  const videoPath = makeTempPath(path.basename(videoS3Key));
  try {
    await setJobStatus(jobId, 'processing', { progress_pct: 5 });
    await job.updateProgress({ uploadId, platform: 'youtube', pct: 5 });

    await downloadFromS3(videoS3Key, videoPath);
    await setJobStatus(jobId, 'processing', { progress_pct: 20 });
    await job.updateProgress({ uploadId, platform: 'youtube', pct: 20 });

    const resultUrl = await uploadToYoutube({
      videoPath,
      title,
      description,
      tags,
      onProgress: async (pct) => {
        const adjusted = 20 + Math.round(pct * 0.78); // 20-98%
        await setJobStatus(jobId, 'processing', { progress_pct: adjusted });
        await job.updateProgress({ uploadId, platform: 'youtube', pct: adjusted });
      },
    });

    await setJobStatus(jobId, 'done', { result_url: resultUrl, progress_pct: 100 });
    await job.updateProgress({ uploadId, platform: 'youtube', pct: 100 });

    // Write back to shows API
    const row = await getShowIdForUpload(uploadId);
    if (row) {
      await writeBackUrls(row.show_id, { youtube: resultUrl });
    }

    return JSON.stringify({ uploadId, platform: 'youtube', url: resultUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setJobStatus(jobId, 'failed', { error: msg });
    throw err;
  } finally {
    cleanup(videoPath);
  }
}
```

- [ ] **Step 3: Create worker/src/jobs/mixcloud.ts**

```typescript
import type { Job } from 'bullmq';
import type { JobPayload } from '../types';
import { downloadFromS3 } from '../services/s3';
import { uploadToMixcloud } from '../services/mixcloud-client';
import { writeBackUrls } from '../services/shows-api';
import { extractAudio, prependJingle, makeTempPath, cleanup } from '../services/ffmpeg';
import { setJobStatus, getShowIdForUpload } from '../db';
import path from 'path';

export async function processMixcloud(job: Job<JobPayload>): Promise<string> {
  const { jobId, uploadId, videoS3Key, title, description, tags, jingleS3Key, includeJingle } = job.data;

  await setJobStatus(jobId, 'processing');

  const videoPath = makeTempPath(path.basename(videoS3Key));
  const audioPath = makeTempPath('audio.m4a');
  const jinglePath = makeTempPath('jingle.m4a');
  const mergedPath = makeTempPath('merged.m4a');

  try {
    await job.updateProgress({ uploadId, platform: 'mixcloud', pct: 5 });
    await downloadFromS3(videoS3Key, videoPath);
    await setJobStatus(jobId, 'processing', { progress_pct: 15 });
    await job.updateProgress({ uploadId, platform: 'mixcloud', pct: 15 });

    await extractAudio(videoPath, audioPath, async (pct) => {
      const adjusted = 15 + Math.round(pct * 0.4); // 15-55%
      await setJobStatus(jobId, 'processing', { progress_pct: adjusted });
      await job.updateProgress({ uploadId, platform: 'mixcloud', pct: adjusted });
    });

    let finalAudioPath = audioPath;

    if (includeJingle && jingleS3Key) {
      await downloadFromS3(jingleS3Key, jinglePath);
      await prependJingle(jinglePath, audioPath, mergedPath);
      finalAudioPath = mergedPath;
    }

    await setJobStatus(jobId, 'processing', { progress_pct: 70 });
    await job.updateProgress({ uploadId, platform: 'mixcloud', pct: 70 });

    const resultUrl = await uploadToMixcloud({
      audioPath: finalAudioPath,
      title,
      description,
      tags,
    });

    await setJobStatus(jobId, 'done', { result_url: resultUrl, progress_pct: 100 });
    await job.updateProgress({ uploadId, platform: 'mixcloud', pct: 100 });

    const row = await getShowIdForUpload(uploadId);
    if (row) {
      await writeBackUrls(row.show_id, { mixcloud: resultUrl });
    }

    return JSON.stringify({ uploadId, platform: 'mixcloud', url: resultUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setJobStatus(jobId, 'failed', { error: msg });
    throw err;
  } finally {
    cleanup(videoPath, audioPath, jinglePath, mergedPath);
  }
}
```

- [ ] **Step 4: Create worker/src/jobs/archive.ts**

```typescript
import type { Job } from 'bullmq';
import type { JobPayload } from '../types';
import { downloadFromS3, uploadToS3, deleteFromS3 } from '../services/s3';
import { transcodeToMp4, makeTempPath, cleanup } from '../services/ffmpeg';
import { setJobStatus, setArchiveKey, getPlatformJobsForUpload } from '../db';
import { uploadQueue } from '../queue';
import path from 'path';
import { env } from '../env';

// Called by youtube/mixcloud jobs after completion to check if archive should start
export async function maybeEnqueueArchive(
  uploadId: string,
  videoS3Key: string,
  title: string,
  description: string,
  tags: string[]
) {
  const jobs = await getPlatformJobsForUpload(uploadId);
  const platformJobs = jobs.filter((j) => j.platform !== 'archive');
  const allDone = platformJobs.every((j) => j.status === 'done');
  const archiveAlreadyQueued = jobs.some((j) => j.platform === 'archive');

  if (allDone && !archiveAlreadyQueued) {
    // Create archive job record in DB, then enqueue
    const { createPlatformJob } = await import('../../api/src/db/queries');
    // Worker doesn't have the API's db module — use raw SQL instead
    const { db } = await import('../db');
    const [archiveJob] = await db<{ id: string }[]>`
      INSERT INTO platform_jobs (upload_id, platform)
      VALUES (${uploadId}, 'archive')
      RETURNING id
    `;
    if (!archiveJob) return;

    await uploadQueue.add('archive', {
      jobId: archiveJob.id,
      uploadId,
      platform: 'archive',
      videoS3Key,
      title,
      description,
      tags,
      imageUrl: null,
      jingleS3Key: null,
      includeJingle: false,
    });
  }
}

export async function processArchive(job: Job<JobPayload>): Promise<string> {
  const { jobId, uploadId, videoS3Key } = job.data;

  await setJobStatus(jobId, 'processing');

  const inputPath = makeTempPath(path.basename(videoS3Key));
  const outputPath = makeTempPath('archive.mp4');

  try {
    await job.updateProgress({ uploadId, platform: 'archive', pct: 5 });
    await downloadFromS3(videoS3Key, inputPath);
    await setJobStatus(jobId, 'processing', { progress_pct: 15 });
    await job.updateProgress({ uploadId, platform: 'archive', pct: 15 });

    await transcodeToMp4(inputPath, outputPath, async (pct) => {
      const adjusted = 15 + Math.round(pct * 0.7); // 15-85%
      await setJobStatus(jobId, 'processing', { progress_pct: adjusted });
      await job.updateProgress({ uploadId, platform: 'archive', pct: adjusted });
    });

    const archiveKey = `archive/${path.basename(videoS3Key, path.extname(videoS3Key))}.mp4`;
    await uploadToS3(outputPath, archiveKey, 'video/mp4');
    await setJobStatus(jobId, 'processing', { progress_pct: 95 });

    // Delete raw MKV
    await deleteFromS3(videoS3Key);

    await setArchiveKey(uploadId, archiveKey);
    await setJobStatus(jobId, 'done', { result_url: archiveKey, progress_pct: 100 });
    await job.updateProgress({ uploadId, platform: 'archive', pct: 100 });

    return JSON.stringify({ uploadId, platform: 'archive', key: archiveKey });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setJobStatus(jobId, 'failed', { error: msg });
    throw err;
  } finally {
    cleanup(inputPath, outputPath);
  }
}
```

- [ ] **Step 5: Add queue import to worker and archive trigger**

Create `worker/src/queue.ts`:
```typescript
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env';
import type { JobPayload } from './types';

export const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const uploadQueue = new Queue<JobPayload>('platform-uploads', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
  },
});
```

Update `worker/src/jobs/youtube.ts` — add at the end of `processYoutube` (before `return`):
```typescript
// Check if archive should be triggered
const { maybeEnqueueArchive } = await import('./archive');
await maybeEnqueueArchive(uploadId, videoS3Key, title, description, tags);
```

Update `worker/src/jobs/mixcloud.ts` — add same after writeback:
```typescript
const { maybeEnqueueArchive } = await import('./archive');
await maybeEnqueueArchive(uploadId, videoS3Key, title, description, tags);
```

Fix `worker/src/jobs/archive.ts` — replace the dynamic import of createPlatformJob with direct SQL (already done above — just remove the unused import line).

- [ ] **Step 6: Commit**
```bash
git add worker/src/jobs/ worker/src/db.ts worker/src/queue.ts
git commit -m "feat: youtube, mixcloud, and archive job processors"
```

---

## Task 11: React UI scaffold

**Files:**
- Create: `ui/package.json`
- Create: `ui/tsconfig.json`
- Create: `ui/vite.config.ts`
- Create: `ui/index.html`
- Create: `ui/src/main.tsx`
- Create: `ui/src/App.tsx`
- Create: `ui/src/api/client.ts`

- [ ] **Step 1: Create ui/package.json**

```json
{
  "name": "@show-uploader/ui",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.24.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.5.3",
    "vite": "^5.3.2"
  }
}
```

- [ ] **Step 2: Create ui/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create ui/vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
```

- [ ] **Step 4: Create ui/index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Show Uploader</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create ui/src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 6: Create ui/src/index.css** (Tailwind base)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 7: Create ui/tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 8: Create ui/postcss.config.js**

```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 9: Create ui/src/App.tsx**

```tsx
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
```

- [ ] **Step 10: Create ui/src/api/client.ts**

```typescript
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
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  listShows: () => apiFetch<AgendaShow[]>('/api/shows'),

  generateMeta: (title: string, description: string) =>
    apiFetch<GeneratedMeta>(`/api/shows/meta?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`),

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
  }) =>
    apiFetch<{ uploadId: string }>('/api/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  listUploads: () => apiFetch<UploadWithJobs[]>('/api/uploads'),
};
```

- [ ] **Step 11: Commit**
```bash
git add ui/
git commit -m "feat: React UI scaffold with Tailwind and API client"
```

---

## Task 12: New Upload page

**Files:**
- Create: `ui/src/pages/NewUpload.tsx`
- Create: `ui/src/components/ShowPicker.tsx`
- Create: `ui/src/components/MetadataForm.tsx`
- Create: `ui/src/components/FileDropzone.tsx`
- Create: `ui/src/components/PlatformSelector.tsx`

- [ ] **Step 1: Create ui/src/components/ShowPicker.tsx**

```tsx
import { useEffect, useState } from 'react';
import { api, type AgendaShow } from '../api/client';

type Props = {
  onSelect: (show: AgendaShow) => void;
};

export default function ShowPicker({ onSelect }: Props) {
  const [shows, setShows] = useState<AgendaShow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listShows().then(setShows).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">Select show</label>
      <select
        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gray-500"
        disabled={loading}
        defaultValue=""
        onChange={(e) => {
          const show = shows.find((s) => s.id === e.target.value);
          if (show) onSelect(show);
        }}
      >
        <option value="" disabled>
          {loading ? 'Loading shows...' : 'Pick a show'}
        </option>
        {shows.map((s) => (
          <option key={s.id} value={s.id}>
            {s.date} {s.startTime} — {s.title}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Create ui/src/components/MetadataForm.tsx**

```tsx
type Props = {
  title: string;
  description: string;
  tags: string[];
  imageUrl: string;
  generating: boolean;
  onChange: (field: string, value: string | string[]) => void;
};

export default function MetadataForm({ title, description, tags, imageUrl, generating, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1">Title</label>
        <input
          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gray-500"
          value={title}
          onChange={(e) => onChange('title', e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Description</label>
        {generating && (
          <p className="text-xs text-gray-500 mb-1">Generating...</p>
        )}
        <textarea
          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gray-500 min-h-[80px]"
          value={description}
          onChange={(e) => onChange('description', e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Tags (comma-separated)</label>
        <input
          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gray-500"
          value={tags.join(', ')}
          onChange={(e) => onChange('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))}
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Cover image URL (optional)</label>
        <input
          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gray-500"
          placeholder="https://..."
          value={imageUrl}
          onChange={(e) => onChange('imageUrl', e.target.value)}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create ui/src/components/FileDropzone.tsx**

```tsx
import { useRef, useState } from 'react';
import { api } from '../api/client';

type Props = {
  onUploaded: (key: string) => void;
};

export default function FileDropzone({ onUploaded }: Props) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [filename, setFilename] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setFilename(file.name);
    setStatus('uploading');
    setProgress(0);

    const { url, key } = await api.getPresignedUrl(file.name, file.type || 'video/x-matroska');

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
      xhr.onerror = reject;
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', file.type || 'video/x-matroska');
      xhr.send(file);
    });

    setStatus('done');
    onUploaded(key);
  };

  return (
    <div
      className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center cursor-pointer hover:border-gray-500 transition-colors"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mkv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      {status === 'idle' && (
        <p className="text-gray-400 text-sm">Drop video file here or click to browse</p>
      )}
      {status === 'uploading' && (
        <div className="space-y-2">
          <p className="text-gray-300 text-sm">{filename}</p>
          <div className="w-full bg-gray-800 rounded-full h-1.5">
            <div
              className="bg-white h-1.5 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-gray-400 text-xs">{progress}%</p>
        </div>
      )}
      {status === 'done' && (
        <p className="text-green-400 text-sm">✓ {filename} uploaded</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create ui/src/components/PlatformSelector.tsx**

```tsx
type Props = {
  platforms: string[];
  includeJingle: boolean;
  onChange: (platforms: string[]) => void;
  onJingleChange: (v: boolean) => void;
};

const PLATFORMS = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'mixcloud', label: 'MixCloud' },
];

export default function PlatformSelector({ platforms, includeJingle, onChange, onJingleChange }: Props) {
  const toggle = (id: string) => {
    onChange(platforms.includes(id) ? platforms.filter((p) => p !== id) : [...platforms, id]);
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm text-gray-400">Platforms</label>
      <div className="flex gap-3">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => toggle(p.id)}
            className={`px-4 py-2 rounded text-sm border transition-colors ${
              platforms.includes(p.id)
                ? 'bg-white text-black border-white'
                : 'bg-transparent text-gray-400 border-gray-700 hover:border-gray-500'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {platforms.includes('mixcloud') && (
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={includeJingle}
            onChange={(e) => onJingleChange(e.target.checked)}
            className="rounded"
          />
          Prepend jingle to MixCloud audio
        </label>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create ui/src/pages/NewUpload.tsx**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type AgendaShow } from '../api/client';
import ShowPicker from '../components/ShowPicker';
import MetadataForm from '../components/MetadataForm';
import FileDropzone from '../components/FileDropzone';
import PlatformSelector from '../components/PlatformSelector';

export default function NewUpload() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [videoS3Key, setVideoS3Key] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['youtube', 'mixcloud']);
  const [includeJingle, setIncludeJingle] = useState(true);
  const [selectedShow, setSelectedShow] = useState<AgendaShow | null>(null);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleShowSelect = async (show: AgendaShow) => {
    setSelectedShow(show);
    setTitle(show.title);
    setDescription(show.description);
    setTags(show.tags ?? []);
    setImageUrl(show.imageUrl ?? '');
    setGenerating(true);
    try {
      const meta = await api.generateMeta(show.title, show.description);
      setDescription(meta.youtubeDescription);
      setTags(meta.tags);
    } catch {
      // Keep original description on AI failure
    } finally {
      setGenerating(false);
    }
  };

  const handleField = (field: string, value: string | string[]) => {
    if (field === 'title') setTitle(value as string);
    if (field === 'description') setDescription(value as string);
    if (field === 'tags') setTags(value as string[]);
    if (field === 'imageUrl') setImageUrl(value as string);
  };

  const handleSubmit = async () => {
    if (!selectedShow || !videoS3Key || platforms.length === 0) return;
    setSubmitting(true);
    try {
      const { uploadId } = await api.createUpload({
        showId: selectedShow.id,
        title,
        description,
        tags,
        imageUrl: imageUrl || null,
        videoS3Key,
        platforms,
        includeJingle,
      });
      navigate(`/history?highlight=${uploadId}`);
    } catch (err) {
      alert('Failed to start upload. Check console.');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !!selectedShow && !!videoS3Key && platforms.length > 0 && !submitting;

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">New Upload</h1>

      <ShowPicker onSelect={handleShowSelect} />

      {selectedShow && (
        <>
          <MetadataForm
            title={title}
            description={description}
            tags={tags}
            imageUrl={imageUrl}
            generating={generating}
            onChange={handleField}
          />
          <FileDropzone onUploaded={setVideoS3Key} />
          <PlatformSelector
            platforms={platforms}
            includeJingle={includeJingle}
            onChange={setPlatforms}
            onJingleChange={setIncludeJingle}
          />
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full bg-white text-black rounded py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-gray-100 transition-colors"
          >
            {submitting ? 'Publishing...' : 'Publish'}
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Commit**
```bash
git add ui/src/
git commit -m "feat: New Upload page with show picker, metadata form, file dropzone"
```

---

## Task 13: History page with live SSE progress

**Files:**
- Create: `ui/src/components/JobProgress.tsx`
- Create: `ui/src/pages/History.tsx`

- [ ] **Step 1: Create ui/src/components/JobProgress.tsx**

```tsx
import { useEffect, useState } from 'react';
import type { PlatformJob } from '../api/client';

type Props = {
  uploadId: string;
  jobs: PlatformJob[];
};

type ProgressState = Record<string, { pct: number; status: string; url?: string; error?: string }>;

export default function JobProgress({ uploadId, jobs }: Props) {
  const [progress, setProgress] = useState<ProgressState>(() =>
    Object.fromEntries(
      jobs.map((j) => [
        j.platform,
        { pct: j.progress_pct, status: j.status, url: j.result_url ?? undefined, error: j.error ?? undefined },
      ])
    )
  );

  useEffect(() => {
    const allDone = jobs.every((j) => j.status === 'done' || j.status === 'failed');
    if (allDone) return;

    const es = new EventSource(`/api/uploads/${uploadId}/events`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data as string) as {
        type: string;
        platform?: string;
        pct?: number;
        url?: string;
        error?: string;
      };
      if (!data.platform) return;
      setProgress((prev) => ({
        ...prev,
        [data.platform!]: {
          pct: data.pct ?? prev[data.platform!]?.pct ?? 0,
          status: data.type === 'completed' ? 'done' : data.type === 'failed' ? 'failed' : 'processing',
          url: data.url ?? prev[data.platform!]?.url,
          error: data.error ?? prev[data.platform!]?.error,
        },
      }));
    };
    return () => es.close();
  }, [uploadId, jobs]);

  const PLATFORM_LABELS: Record<string, string> = { youtube: 'YouTube', mixcloud: 'MixCloud', archive: 'Archive' };

  return (
    <div className="space-y-2">
      {Object.entries(progress).map(([platform, state]) => (
        <div key={platform}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-400">{PLATFORM_LABELS[platform] ?? platform}</span>
            <span className={
              state.status === 'done' ? 'text-green-400' :
              state.status === 'failed' ? 'text-red-400' :
              'text-gray-400'
            }>
              {state.status === 'done' && state.url ? (
                <a href={state.url} target="_blank" rel="noreferrer" className="underline">View</a>
              ) : state.status === 'failed' ? (
                `Failed: ${state.error ?? 'unknown'}`
              ) : (
                `${state.pct}%`
              )}
            </span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-1">
            <div
              className={`h-1 rounded-full transition-all ${
                state.status === 'done' ? 'bg-green-400' :
                state.status === 'failed' ? 'bg-red-400' :
                'bg-white'
              }`}
              style={{ width: `${state.status === 'done' ? 100 : state.pct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create ui/src/pages/History.tsx**

```tsx
import { useEffect, useState } from 'react';
import { api, type UploadWithJobs } from '../api/client';
import JobProgress from '../components/JobProgress';

export default function History() {
  const [uploads, setUploads] = useState<UploadWithJobs[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listUploads().then(setUploads).finally(() => setLoading(false));
    const interval = setInterval(() => api.listUploads().then(setUploads), 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <p className="text-gray-400 text-sm">Loading...</p>;

  if (uploads.length === 0) {
    return <p className="text-gray-400 text-sm">No uploads yet.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">History</h1>
      {uploads.map((upload) => (
        <div key={upload.id} className="border border-gray-800 rounded-lg p-5 space-y-4">
          <div>
            <p className="font-medium text-white">{upload.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {new Date(upload.created_at).toLocaleString()}
            </p>
          </div>
          <JobProgress uploadId={upload.id} jobs={upload.jobs} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**
```bash
git add ui/src/
git commit -m "feat: History page with SSE live progress bars"
```

---

## Task 14: Install dependencies and verify build

- [ ] **Step 1: Install all workspace dependencies**
```bash
npm install
```

- [ ] **Step 2: Build the UI**
```bash
npm run build --workspace=@show-uploader/ui
```

Expected: `ui/dist/` directory created with `index.html` and assets.

- [ ] **Step 3: Build the API**
```bash
npm run build --workspace=@show-uploader/api
```

Expected: `api/dist/` directory created.

- [ ] **Step 4: Build the worker**
```bash
npm run build --workspace=@show-uploader/worker
```

Expected: `worker/dist/` directory created.

- [ ] **Step 5: Fix any TypeScript errors** (resolve type issues surfaced by builds)

- [ ] **Step 6: Commit build artifacts and lock file**
```bash
git add package-lock.json api/package.json worker/package.json ui/package.json
git commit -m "chore: install dependencies and verify builds"
```

---

## Task 15: Push to GitHub and finalize

- [ ] **Step 1: Push all commits**
```bash
git push -u origin master
```

- [ ] **Step 2: Create .env from example (for local testing)**

User action: `cp .env.example .env` and fill in credentials.

- [ ] **Step 3: Verify docker-compose config is valid**
```bash
docker compose config
```

Expected: valid YAML printed, no errors.

- [ ] **Step 4: Final commit with any remaining fixes**
```bash
git add -A && git commit -m "chore: final cleanup and docker-compose verification"
git push
```

---

## Notes for Implementer

- **YouTube auth:** Requires OAuth2 refresh token. The user must complete the OAuth2 flow once via `https://accounts.google.com/o/oauth2/auth` with YouTube Data API v3 scope (`https://www.googleapis.com/auth/youtube.upload`), then set the refresh token in `.env`.
- **MixCloud auth:** User must create a developer app at `https://www.mixcloud.com/developers/` and perform the OAuth2 flow to get an access token.
- **Netcup S3:** Set `S3_ENDPOINT` to the Netcup S3-compatible endpoint. Use `forcePathStyle: true` (already set in S3 clients).
- **archive job import:** The `maybeEnqueueArchive` function in `archive.ts` is called from youtube and mixcloud jobs. This creates a circular dependency via the queue. The `worker/src/queue.ts` module handles this cleanly since it's a separate file.
- **MixCloud API note:** MixCloud accepts AAC/M4A files as `mp3` form field (despite the field name). This is their documented behavior.
