# Video lifecycle — architecture

How a show's recording gets from the operator's disk to "ready to publish", and
why the design is what it is.

## The rule

> **The show record is the single source of truth for its video. An upload is
> bound to its show from the moment it is created, and the "this show has a
> recording" fact is written server-side, atomically, the instant the upload
> finishes. The UI never *stores* video state — it *derives* it.**

## Why (the failure it prevents)

The original design linked an upload to its show **late and on the client**: the
multipart session had no `show_id`, and only after the upload finished did a
React effect call `PUT /staged/:showId` to register it. Video "presence" was then
reconstructed in the form from four places (the staged table, the published
`show_uploads`, the in-memory upload map, and local `videoS3Key` state) via
race-prone `useEffect`s.

Consequences we actually hit: an upload leaking onto a different show's form; the
publish button disabled while a video was clearly "ready"; a finished upload
"disappearing" after navigation; a record that didn't know it had a video.

Root cause: **derived state that can drift, and a link established too late by the
wrong tier.**

## The pieces

### 1. Bind at creation (server)
`POST /uploads/multipart/create` now takes `showId` and stores it on
`multipart_uploads.show_id`. The session knows its show for its whole life.

### 2. Record on completion, atomically (server)
`POST /uploads/multipart/:id/complete` completes the S3 object **and** upserts
`staged_uploads[show_id]` in the same request. After this returns, the record
authoritatively has a recording — regardless of what the client does next
(navigate away, refresh, crash). `staged_uploads` (PK = `show_id`) is the durable
source of truth; it is cleared when the show is published.

### 3. Derive, don't store (client)
The form's video is a pure function of three inputs, all keyed by `showId`:

```
resolveVideo({ live, staged, pending }) -> uploading | error | ready | none
```

- `live` — the in-memory upload for this show (progress / just-finished). Uploads
  live in a `Record<showId, UploadItem>` (`UploadProvider`), so several run
  concurrently and each only ever appears on its own show.
- `staged` — `GET /uploads/staged/:showId` (react-query), the server truth.
- `pending` — a hand-picked file from the drop folder.

Precedence: a live upload drives the transient `uploading`/`error` states; `ready`
resolves to the first durable key of `live.done → pending → staged`. There is no
`videoS3Key`/`videoFilename` component state and no restore/reset effects to race.
`resolveVideo` is a pure function with unit tests
(`ui/src/upload/resolveVideo.test.ts`).

## Visibility

Because the fact lives on the record, the app can show it anywhere:
- **to process** table — a `Video` column: live `%` while uploading, `✓` when a
  recording is staged (`GET /uploads/staged`), else `—`.
- **upload form** — the `resolveVideo` state.
- **header** — the concurrent upload queue (`UploadIndicator`), each row linking
  to its show.

## Data stores at a glance

| store | keyed by | holds | written when |
|---|---|---|---|
| `multipart_uploads` | id | resumable session (+ `show_id`) | create → complete/abort |
| `staged_uploads` | `show_id` | the recording ready to publish | multipart complete (server) |
| `show_uploads` | id | a published upload + its platform jobs | on publish |

## Tests

Real functionality is unit-tested: `resolveVideo` (all precedence/leak cases) and
the title/hashtag convention (`api/src/services/format.test.ts`). Run with
`pnpm --filter @show-uploader/ui test` and `pnpm --filter @show-uploader/api test`.
