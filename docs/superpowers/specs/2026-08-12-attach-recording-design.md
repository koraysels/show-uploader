# Attach a Recording to an Already-Published Show — Design

**Date:** 2026-08-12
**Status:** Approved (design)

## Problem

Some shows were published to YouTube/MixCloud before this tool existed, or before
archiving was built. Their PocketBase `archive` record is `status: 'published'`
with real platform links, but there's no `show_uploads` row and no archived
video/audio on S3 — nothing to watch or download from this app, and no
`cs-archive-video`/`cs-archive-audio` link on the record.

The operator wants to attach a raw MKV recording to one of these shows after the
fact: the app muxes it to a browser-playable MP4 and extracts the M4A, exactly
like the normal archive pipeline, and the result becomes that show's archive.
If the show is missing a platform link too (e.g. only YouTube, no MixCloud), the
operator should also be able to publish to the missing platform in the same
step — this is not archive-only by definition, just archive-*at least*.

## Why this needs almost no new machinery

Investigation found the existing upload flow already handles nearly all of this,
because of one behavior already in `PlatformSelector`: a platform with an
existing link on the record is shown as a read-only "already published" card,
never as a selectable checkbox. For a show with both YouTube and MixCloud
already linked, `selectable` (the togglable list) is already empty — the form
already lands on zero platforms selected, with no new UI needed to express
"nothing to publish, just archive this."

The three actual gaps:

1. **The show can't be found.** `NewUpload.tsx` resolves `selectedShow` from
   `useShows()`, which only fetches PocketBase records with `status='draft'`.
   A published show is invisible to that page today.
2. **Zero platforms is rejected.** `canSubmit` requires `platforms.length > 0`,
   and the server's `CreateUploadSchema` requires `.min(1)`. The `create`
   mutation itself already handles an empty platforms array fine (its
   job-creation loop just produces nothing) — nothing currently *stops* it.
3. **Nothing enqueues the archive job when there are no platform jobs.** The
   archive job is normally triggered by `maybeEnqueueArchive`, called as a side
   effect of a platform job completing. With zero platform jobs, nothing ever
   calls it.

Everything else — trim fields, auto-trim-silence, jingle toggle, metadata form,
the dropzone/multipart upload, `processArchive` itself — is reused completely
unmodified.

## Changes

### Backend

**`api/src/services/shows-api.ts`** — new `listPublishedShows()`, a copy of
`listShows()` with the PocketBase filter changed from `status='draft'` to
`status='published'`. Same `AgendaShow` return shape (already carries
`mediaLinks`), so "no archive yet" is a client-side filter on data already
returned — no new field, no new PocketBase query shape.

`listShows`'s `perPage=200` is fine for the draft backlog, but the full
published history for a weekly show over multiple years can exceed that —
raise this one to `perPage=500`, matching the cap `listArchiveStates` already
uses for the same "every published record" case, with the same accepted
limit (not paginated; revisit only if the agenda ever approaches it).

**`api/src/trpc/routers/shows.ts`** — `listPublished: protectedProcedure.query(...)`
wrapping it.

**`api/src/trpc/routers/uploads.ts`**:
- `CreateUploadSchema.platforms`: drop `.min(1)` — `z.array(z.enum([...]))`
  already defaults to allowing an empty array.
- `create` mutation: when `data.platforms.length === 0`, call
  `enqueueArchiveJob(db, { ...upload, jobs: [] })` right there — the same
  function `remuxBackfill` and the compress feature already use to create-or-
  reset an archive job row and enqueue it. This is the one genuinely new line
  of behavior; everything else in `create` already tolerates an empty
  platforms array.

### Frontend

**New route `/attach`** (nav tab alongside archive/storage/history): lists
published shows with no `cs-archive-video` link (`useQuery` over
`shows.listPublished`, filtered client-side on `mediaLinks`). Same table
conventions as the "to process" page (`Shows.tsx`) — reusing that page's
styling patterns, not its component, since the meaningful columns differ (no
upload-in-progress state to show; the useful column here is which platform
links already exist). Each row links to `/upload/$showId` — the existing
route, unchanged.

**`ui/src/pages/NewUpload.tsx`**:
- `selectedShow` source: `useShows().find(id)` → `useShow(showId, true)` (the
  existing single-record, any-status hook, already used in `Archive.tsx`'s
  `SyncPanel`). Fixes the "published show not found" gap, and as a side effect
  removes a latent cap for normal drafts too (`listShows` caps at
  `perPage=200`; fetch-by-id doesn't).
- `canSubmit`: `platforms.length > 0` → `platforms.length > 0 || selectable.length === 0`,
  where `selectable` is the same "platforms with no existing link" list
  `PlatformSelector` already computes. Submitting with zero platforms is only
  allowed when there's genuinely nothing left to select — guards against an
  accidental zero-platform submit on a real draft, where unchecking both boxes
  by mistake should still be blocked.

### What does not change

Trim fields, auto-trim-silence, jingle toggle, metadata form, video
upload/dropzone, `processArchive`, the archive page, `PlatformSelector`. An
attach is just a normal upload whose platform list happens to be empty (or
missing just one platform), landing on a show that happens to already be
published elsewhere.

## Data hygiene note (separate, already shipped)

Unrelated to this feature but touching the same mediaLinks data: a prior label
rename (`cs-archive-video`/`cs-archive-audio`, replacing `Recording`/`Audio`)
had sat unmerged on its own branch while production kept running the old
writer, so some already-backfilled records carry both old and new labels.
`archiveLinksBackfill` was extended (PR #24) to also strip the old labels via
the existing `removeArchiveMediaLink`. Not part of this feature's
implementation plan.

## Testing

- Worker: none needed — `processArchive` is unmodified.
- API: extend the existing `create` mutation test coverage with a
  platforms-empty case (archive job gets enqueued, no youtube/mixcloud jobs
  created); a case for `listPublishedShows` mirroring whatever coverage
  `listShows` has today.
- UI: exercise in mock mode (per this repo's established practice for
  UI changes) — the `/attach` list renders, navigating from it to
  `/upload/$showId` loads a published show correctly, submitting with zero
  platforms succeeds, submitting with one still-missing platform (e.g.
  MixCloud only) still requires selecting it.

## Out of scope

- Editing already-published platform links from the attach flow (that's
  `PlatformSelector`'s existing "update"/"remove" affordances, already
  present).
- Any change to how a show's PocketBase `status` is set — this feature never
  touches `status`, matching `updateArchiveRecord`'s existing "never touches
  status" contract.
