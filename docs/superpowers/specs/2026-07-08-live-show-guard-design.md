# Live-Show Guard — Design

**Date:** 2026-07-08
**Status:** Approved (design)

## Problem

Uploading an archived show kicks off heavy work — ffmpeg transcode, platform
uploads (YouTube, MixCloud), and an archive transcode. If that work runs while
a show is **on air**, it competes for CPU and bandwidth on the same host and can
degrade the live broadcast.

We want: when an upload is submitted and a show is currently live, **do not run
the heavy work now** — defer it until the live window (plus a safety buffer) has
passed. The upload must still be accepted; nothing is lost.

## Source of truth

Schedule lives in the hosted PocketBase at `https://agenda.coming-soon.space`,
collection **`episodes`**. Relevant fields:

- `startTime`, `endTime` — ISO UTC timestamps (e.g. `2026-07-17 20:00:00.000Z`)
- `status` — lifecycle: `draft` → `scheduled` → `completed` (also `cancelled` in
  schema). There is **no** stored `live` status; "live" is derived from time.

The `episodes` collection is **publicly readable** — verified: an unauthenticated
`GET /api/collections/episodes/records` returns 200 with data. So the runtime
guard needs **no auth**. (The prior `coming-soon.space/api` used by
`shows-api.ts` is dead — returns 404 — and is unrelated to this guard.)

## Definition of "live now"

An episode is live at time `now` when **both** hold:

1. `status === 'scheduled'`
2. `now ∈ [startTime − BUFFER, endTime + BUFFER]`

`BUFFER = LIVE_GUARD_BUFFER_MIN` minutes (default **15**), applied on both ends to
protect sound-check and overrun.

If one or more episodes are live, the system is "live". The resume time is:

```
resumeAt = max(endTime + BUFFER) over all currently-live episodes
```

taking the max so overlapping / back-to-back shows all clear before work runs.

## Behavior

At upload submit (`POST /api/uploads`), before enqueuing jobs:

1. Fetch candidate episodes from PocketBase and evaluate the live check for `now`.
2. **Not live** → enqueue jobs normally (no delay).
3. **Live** → enqueue every job with BullMQ `{ delay: resumeAt − now }`. Jobs sit
   in the delayed set and start automatically once the window + buffer passes.
   The archive job is triggered by the worker after the platform jobs finish, so
   it naturally lands after the live window too — no separate handling needed.
4. The upload row and jobs are created either way; the API responds 201 as today.
   When deferred, include `deferredUntil: <ISO>` in the response so the UI can
   show it.

**Fail open:** if PocketBase is unreachable or returns an error, log a warning and
enqueue immediately (no delay). Losing/blocking an upload is worse than the rare
chance of contention during an outage. The guard is best-effort.

## Components

### `api/src/services/live-guard.ts`

- `type Episode = { status: string; startTime: string; endTime: string }`
  (narrowed from generated PB types).
- `evaluateLive(episodes: Episode[], now: Date, bufferMin: number): { isLive: boolean; resumeAt: Date | null }`
  — **pure**, no I/O. This is the unit-tested core.
- `getLiveState(now: Date): Promise<{ isLive: boolean; resumeAt: Date | null }>`
  — fetches episodes from PocketBase (unauthenticated), then calls
  `evaluateLive`. Catches fetch/parse errors and returns
  `{ isLive: false, resumeAt: null }` (fail open) with a `console.warn`.

Fetch is scoped server-side to plausibly-live rows to keep it cheap, e.g.
filter `status='scheduled'` and an `endTime >= now − BUFFER` /
`startTime <= now + BUFFER` window, then apply `evaluateLive` for the exact check.

### `api/src/routes/uploads.ts`

In the `POST /` handler, call `getLiveState(new Date())` before the
`uploadQueue.add(...)` loop. Compute `delay = isLive ? max(0, resumeAt − now) : 0`
and pass `{ delay }` in the job options. Add `deferredUntil` to the JSON response
when deferred.

## PocketBase types (`pocketbase-typegen`)

Add `pocketbase-typegen` as a dev dependency and an npm script:

```
"typegen": "pocketbase-typegen --url https://agenda.coming-soon.space --email $PB_SERVICE_EMAIL --password $PB_SERVICE_PASSWORD --out api/src/pocketbase-types.ts"
```

Run manually to (re)generate `api/src/pocketbase-types.ts`; commit the generated
file. `live-guard.ts` imports the `Episodes` record type from it. Admin/service
credentials are needed **only** to run typegen, never at runtime.

## Configuration (`.env`)

| Var | Purpose | Default |
|---|---|---|
| `POCKETBASE_URL` | Runtime PB base URL (no auth) | `https://agenda.coming-soon.space` |
| `LIVE_GUARD_BUFFER_MIN` | Buffer minutes each side of the window | `15` |
| `PB_SERVICE_EMAIL` | typegen only (schema read) | — |
| `PB_SERVICE_PASSWORD` | typegen only (schema read) | — |

`.env` is gitignored; credentials never enter git. `.env.example` documents the
vars with placeholders.

## Testing

TDD the pure detector `evaluateLive`:

- not live: no episodes; episode `completed`/`draft` even if in window;
  episode `scheduled` but `now` outside `[start−buf, end+buf]`.
- live: `scheduled` and `now` inside window; inside the buffer before start;
  inside the buffer after end.
- `resumeAt` = latest `endTime + buffer` across overlapping live episodes.
- boundary: `now` exactly at `start−buf` and `end+buf`.

`getLiveState` gets a light test with the fetch mocked, including the fail-open
path (fetch throws → `{ isLive: false, resumeAt: null }`).

## Out of scope (YAGNI)

- Worker-side re-checking / re-delaying on each attempt (schedule edited mid-defer).
  The buffer absorbs normal overrun; revisit only if it proves insufficient.
- Global queue pause. Per-job delay is enough and doesn't affect unrelated jobs.
- Honoring `livestream_override` / `recurrenceRule` — all rows are `inherit`
  today; not needed for the resource-contention goal.
