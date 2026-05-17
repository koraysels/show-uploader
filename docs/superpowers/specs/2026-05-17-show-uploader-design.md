# Show Uploader — Design Spec
_2026-05-17_

## Overview

A Dockerized TypeScript tool for uploading recorded music shows (DJ sets, live concerts) to multiple social media platforms from a single upload. Metadata is sourced from an existing show planning API, AI generates compact copy, and a post-upload archive job transcodes and stores the canonical version.

---

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) |
| Runtime | Node.js 20 |
| Containers | Docker Compose |
| Database | Neon (managed Postgres) |
| Job queue | BullMQ + Redis |
| Storage | Netcup S3-compatible block storage |
| AI | Groq API |
| Video processing | ffmpeg (system dep in worker container) |

---

## Containers (3)

### `api`
- Express server + React UI (Vite, served statically)
- Handles: show metadata fetching, presigned S3 URL generation, job queuing, SSE progress streams, upload history
- No file processing — video never passes through this container

### `worker`
- BullMQ worker — processes jobs from Redis queue
- Dependencies: ffmpeg, googleapis, node-id3, MixCloud API client
- Handles: YouTube upload, MixCloud audio extraction + upload, archive transcoding

### `redis`
- BullMQ backing store
- Job persistence, progress state, retry tracking

**External:**
- **Neon** — Postgres for upload history, platform credentials, job state
- **Netcup S3** — raw MKV staging area, jingle storage, final MP4 archive

---

## Shows Agenda API Contract

The uploader consumes an external REST API (the user's separate show planning project) via Bearer token.

```
GET  /shows?from=&to=&status=    → list shows
GET  /shows/:id                  → single show
PATCH /shows/:id                 → write back upload URLs
```

Show shape:
```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "date": "2026-05-17",
  "startTime": "22:00",
  "endTime": "00:00",
  "imageUrl": "string | null",
  "tags": ["string"] | null
}
```

Auth: `Authorization: Bearer <SHOWS_API_TOKEN>` (configured via `.env`).

After successful platform uploads, the uploader calls `PATCH /shows/:id` with:
```json
{ "uploads": { "youtube": "https://...", "mixcloud": "https://..." } }
```

---

## Data Models (Neon)

### `show_uploads`
```sql
id            uuid primary key
show_id       text not null          -- ID from agenda API
title         text not null
description   text
tags          text[]
image_url     text
video_s3_key  text not null          -- raw MKV on S3
archive_s3_key text                  -- transcoded MP4 on S3
jingle_s3_key text                   -- jingle used (snapshot key)
created_at    timestamptz default now()
```

### `platform_jobs`
```sql
id            uuid primary key
upload_id     uuid references show_uploads(id)
platform      text not null          -- 'youtube' | 'mixcloud' | 'archive'
status        text not null          -- 'queued' | 'processing' | 'done' | 'failed'
result_url    text
error         text
progress_pct  int default 0
created_at    timestamptz default now()
updated_at    timestamptz default now()
```

### `platform_credentials`
```sql
id                  uuid primary key
platform            text not null
label               text not null
encrypted_token     text not null
encrypted_refresh   text
expires_at          timestamptz
```

---

## Worker Job Pipeline

### YouTube job
1. Stream video from Netcup S3
2. Resumable upload to YouTube via `googleapis`
3. Set title, description, tags, thumbnail
4. On success: write URL to `platform_jobs` + call `PATCH /shows/:id`

### MixCloud job
1. Stream video from Netcup S3
2. ffmpeg: extract audio as AAC (256kbps, `.m4a`)
3. ffmpeg: prepend jingle if enabled (`concat` filter)
4. Embed ID3-equivalent metadata (title, artist, cover art via ffmpeg metadata)
5. Multipart upload to MixCloud API
6. On success: write URL to `platform_jobs` + call `PATCH /shows/:id`

### Archive job (runs after YouTube + MixCloud both succeed)
1. Stream raw MKV from Netcup S3
2. ffmpeg: transcode to MP4
   - Video: H.264, bitrate = `ARCHIVE_VIDEO_BITRATE` (default `4000k`)
   - Audio: AAC, bitrate = `ARCHIVE_AUDIO_BITRATE` (default `256k`)
3. Upload MP4 to Netcup S3 under `archive/` prefix
4. Delete raw MKV from S3
5. Update `show_uploads.archive_s3_key`

**Job dependency:** Archive job is blocked until both YouTube and MixCloud jobs reach `done`. BullMQ job dependencies handle this natively.

**Retry policy:** 3 attempts, exponential backoff. Failed jobs surface in the UI with error and a manual retry button.

**Progress:** Worker emits progress via BullMQ → API reads it → SSE stream to browser.

---

## AI Integration (Groq)

Triggered when a user selects a show from the agenda. The show title + existing description are sent to Groq.

**Output:**
- YouTube description: 2–3 lines, human tone, no hype, small set of hashtags
- MixCloud description: 1–2 lines, music-focused
- Tags: 5–8 suggestions

**Principle:** Short, natural, music-first. The copy serves the show — not the algorithm. All AI output is editable before publishing.

---

## Web UI (2 screens)

### New Upload
1. Show picker (dropdown from agenda API, sorted by date)
2. Metadata panel (pre-filled, editable): title, description, tags, cover image
3. Video file drop zone → direct S3 presigned upload (never touches the API server)
4. Toggle: include jingle for MixCloud (default: on)
5. Platform checkboxes: YouTube / MixCloud
6. Publish button → queues jobs, navigates to history

### Upload History
- List of uploads with per-platform status chips
- Live progress bars (SSE) during active jobs
- Published URLs on completion
- Retry button on failure

---

## Environment Variables

```env
# Shows Agenda API
SHOWS_API_URL=
SHOWS_API_TOKEN=

# Netcup S3
S3_ENDPOINT=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=

# Neon
DATABASE_URL=

# Redis
REDIS_URL=redis://redis:6379

# Groq
GROQ_API_KEY=

# YouTube OAuth
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=

# MixCloud
MIXCLOUD_CLIENT_ID=
MIXCLOUD_CLIENT_SECRET=
MIXCLOUD_ACCESS_TOKEN=

# Archive quality
ARCHIVE_VIDEO_BITRATE=4000k
ARCHIVE_AUDIO_BITRATE=256k

# Encryption key for stored credentials
CREDENTIALS_ENCRYPTION_KEY=
```

---

## Out of Scope (v1)

- Instagram, SoundCloud, or other platforms
- Multi-user auth (single-operator tool)
- Scheduled publishing (publish immediately on job completion)
- Automatic show matching by date/time (user selects from picker)
