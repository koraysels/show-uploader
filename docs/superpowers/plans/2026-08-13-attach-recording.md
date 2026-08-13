# Attach a Recording to an Already-Published Show — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator attach a raw MKV recording (muxed to mp4, m4a extracted — same as the existing archive job) to a show that was already published to YouTube/MixCloud before this tool existed, optionally publishing to a still-missing platform in the same step.

**Architecture:** Almost entirely reuse of the existing upload flow. A new picker page (`/attach`) lists published PocketBase shows with no `cs-archive-video` link and hands off to the **existing, unmodified** `/upload/$showId` route. Three small unlocks make that route work for this case: it can find a published show (not just drafts), submitting with zero platforms is allowed when there's nothing left to publish to, and the backend starts the archive job directly when there are no platform jobs to wait on.

**Tech Stack:** Express + tRPC + zod (api), BullMQ (worker, unchanged), React + TanStack Router/Query + MUI (ui), vitest (both, plain — no jsdom/testing-library in `ui`, so components are verified in the browser, not unit tested).

## Global Constraints

- Reuse existing code paths over writing new ones (explicit user directive this session). Every task below is a small, targeted change to something that already exists, not a parallel implementation.
- `updateArchiveRecord` never touches PocketBase `status` — this feature must not either (spec: "Out of scope").
- Agenda mediaLinks labels are exactly `cs-archive-video` / `cs-archive-audio` — no other label written anywhere (live bug fixed in PR #24; don't reintroduce it).
- Spec: `docs/superpowers/specs/2026-08-12-attach-recording-design.md` (already on master) — this plan implements it section by section.

---

### Task 1: Backend — list published shows

**Files:**
- Modify: `api/src/services/shows-api.ts:108-118` (add `listPublishedShows` right after `listShows`)
- Modify: `api/src/trpc/routers/shows.ts:4-13` (import), `:36-48` (add `listPublished` procedure after `listGenres`, i.e. right before the existing `listShows` procedure block ends)

**Interfaces:**
- Produces: `listPublishedShows(): Promise<AgendaShow[]>` (shows-api.ts), `shows.listPublished` tRPC query procedure (no input, returns `AgendaShow[]`)

- [ ] **Step 1: Add `listPublishedShows` to `shows-api.ts`**

In `api/src/services/shows-api.ts`, immediately after the closing brace of `listShows` (the function ending at line 118, right before the `getArchiveShow` comment at line 120), insert:

```ts
async function fetchPublished(token: string): Promise<Response> {
  const filter = `(status='published')`;
  const url =
    `${pbBase}/api/collections/archive/records` +
    // listShows caps at 200, fine for the draft backlog. A multi-year
    // published history can exceed that, so this uses the same 500 cap
    // listArchiveStates already accepts for "every published record".
    `?perPage=500&sort=-startTime&expand=${ARCHIVE_EXPAND}&fields=${ARCHIVE_FIELDS}&filter=${encodeURIComponent(filter)}`;
  return fetch(url, { headers: { Authorization: token } });
}

/**
 * Published records in the PocketBase `archive` collection — the pool the
 * "attach a recording" picker draws from (ui/src/pages/Attach.tsx). Same
 * shape as listShows, different filter: this app never otherwise sees these
 * once they're published.
 */
export async function listPublishedShows(): Promise<AgendaShow[]> {
  let token = await getToken();
  let res = await fetchPublished(token);
  if (res.status === 401 || res.status === 403) {
    token = await authenticate();
    res = await fetchPublished(token);
  }
  if (!res.ok) throw new Error(`PocketBase archive error: ${res.status}`);
  const body = (await res.json()) as { items: ArchiveItem[] };
  return body.items.map(toAgendaShow);
}
```

- [ ] **Step 2: Wire it into the shows router**

In `api/src/trpc/routers/shows.ts`, change the import at the top:

```ts
import {
  listShows,
  listPublishedShows,
  listGenres,
  listArchiveStates,
  getArchiveShow,
  syncShowToPlatforms,
  updateArchiveRecord,
  resolveGenreIds,
  type ArchivePatch,
} from '../../services/shows-api';
```

Then add a new procedure right after `listShows` (after its closing `}),` at line 48, before `generateMeta`):

```ts
  // GET /api/shows/published — shows already live elsewhere, for the "attach
  // a recording" picker. Filtered to ones missing cs-archive-video client-side
  // (see ui/src/pages/Attach.tsx) — this returns every published record.
  listPublished: protectedProcedure.query(async () => {
    try {
      return await listPublishedShows();
    } catch (err) {
      console.error('Failed to fetch published shows:', err);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch published shows',
      });
    }
  }),
```

- [ ] **Step 3: Typecheck**

Run: `cd api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add api/src/services/shows-api.ts api/src/trpc/routers/shows.ts
git commit -m "feat(api): list published shows for the attach-recording picker"
```

---

### Task 2: Backend — allow an archive-only upload

**Files:**
- Modify: `api/src/trpc/routers/uploads.ts:74` (schema)
- Modify: `api/src/trpc/routers/uploads.ts:214-217` (create mutation)

**Interfaces:**
- Consumes: `enqueueArchiveJob(db: Sql, upload: ShowUpload & { jobs: PlatformJob[] }): Promise<boolean>` — already imported in this file (`api/src/services/archive-jobs.ts`), already used by `remuxBackfill`.

- [ ] **Step 1: Allow an empty platforms array**

In `api/src/trpc/routers/uploads.ts`, in `CreateUploadSchema`, change:

```ts
  platforms: z.array(z.enum(['youtube', 'mixcloud'])).min(1),
```

to:

```ts
  // Empty is valid: attaching a recording to a show already published
  // elsewhere needs nothing to publish, just the archive step (see the
  // platforms.length === 0 branch in `create` below).
  platforms: z.array(z.enum(['youtube', 'mixcloud'])),
```

- [ ] **Step 2: Start the archive job when there's nothing to publish**

In the same file, in the `create` mutation, immediately after:

```ts
      const jobs = await Promise.all(
        data.platforms.map((platform) => createPlatformJob(db, { upload_id: upload.id, platform }))
      );
```

insert:

```ts

      // Attach-only: no platform to publish (none picked, or none left to
      // pick on an already-published show). Nothing will ever call
      // maybeEnqueueArchive's normal "every platform job is done" trigger
      // with zero platform jobs to wait on, so start the archive job here —
      // the same enqueueArchiveJob the remux/compress backfills already use.
      if (data.platforms.length === 0) {
        await enqueueArchiveJob(db, { ...upload, jobs });
      }
```

- [ ] **Step 3: Typecheck and run the existing suite**

Run: `cd api && npx tsc --noEmit && npx vitest run`
Expected: no type errors, all existing tests still pass (this file has no existing unit tests of its own to extend — `create` and the rest of the uploads router are covered by manual/browser verification in this codebase, not vitest; see `api/test/` for what does exist).

- [ ] **Step 4: Commit**

```bash
git add api/src/trpc/routers/uploads.ts
git commit -m "feat(api): allow an archive-only upload (zero platforms)"
```

---

### Task 3: Frontend — shared "how many platforms are still selectable" helper

**Files:**
- Modify: `ui/src/components/PlatformSelector.tsx:88-91` (export a helper next to `PLATFORMS`)
- Test: `ui/test/components/selectablePlatformCount.test.ts` (new)

**Interfaces:**
- Produces: `selectablePlatformCount(existingLinks: PlatformLink[]): number` (exported from `PlatformSelector.tsx`, `PlatformLink` already exported there as `{ label: string; url: string }`)
- Consumed by: Task 4 (`NewUpload.tsx`'s `canSubmit`)

- [ ] **Step 1: Write the failing test**

Create `ui/test/components/selectablePlatformCount.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectablePlatformCount } from '../../src/components/PlatformSelector';

describe('selectablePlatformCount', () => {
  it('counts both platforms when nothing is published yet', () => {
    expect(selectablePlatformCount([])).toBe(2);
  });

  it('counts one when only YouTube is already linked', () => {
    expect(selectablePlatformCount([{ label: 'YouTube', url: 'https://youtube.com/x' }])).toBe(1);
  });

  it('counts zero when both are already linked', () => {
    expect(
      selectablePlatformCount([
        { label: 'YouTube', url: 'https://youtube.com/x' },
        { label: 'MixCloud', url: 'https://mixcloud.com/x' },
      ])
    ).toBe(0);
  });

  it('ignores a link with a label neither platform uses', () => {
    expect(selectablePlatformCount([{ label: 'SoundCloud', url: 'https://soundcloud.com/x' }])).toBe(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ui && npx vitest run test/components/selectablePlatformCount.test.ts`
Expected: FAIL — `selectablePlatformCount` is not exported from `PlatformSelector.tsx` yet.

- [ ] **Step 3: Export the helper**

In `ui/src/components/PlatformSelector.tsx`, immediately after:

```ts
const PLATFORMS = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'mixcloud', label: 'MixCloud' },
];
```

add:

```ts
// How many of the two platforms have no existing link yet. Shared with
// NewUpload's submit gate: submitting with zero platforms selected is only a
// valid archive-only action when nothing is actually left to pick.
export function selectablePlatformCount(existingLinks: PlatformLink[]): number {
  const labels = new Set(existingLinks.map((l) => l.label));
  return PLATFORMS.filter((p) => !labels.has(p.label)).length;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd ui && npx vitest run test/components/selectablePlatformCount.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/PlatformSelector.tsx ui/test/components/selectablePlatformCount.test.ts
git commit -m "feat(ui): export selectablePlatformCount from PlatformSelector"
```

---

### Task 4: Frontend — let NewUpload find a published show and submit with zero platforms

**Files:**
- Modify: `ui/src/pages/NewUpload.tsx:12` (import swap), `:24` (import addition), `:116-117` (show lookup), `:286-287` (canSubmit)

**Interfaces:**
- Consumes: `useShow(id: string, enabled: boolean)` (already in `ui/src/api/hooks.ts`, already used in `ui/src/pages/Archive.tsx`'s `SyncPanel`) — returns `UseQueryResult<AgendaShow>`. `selectablePlatformCount` from Task 3.

- [ ] **Step 1: Swap the show lookup from drafts-only to any-status-by-id**

In `ui/src/pages/NewUpload.tsx`, change the import block starting at line 11:

```ts
import {
  useShows,
  useGeneratedMeta,
  usePendingVideos,
  useClaimPending,
  useCreateUpload,
  useStaged,
  useSaveShowMetadata,
  useUploads,
} from '../api/hooks';
```

to:

```ts
import {
  useShow,
  useGeneratedMeta,
  usePendingVideos,
  useClaimPending,
  useCreateUpload,
  useStaged,
  useSaveShowMetadata,
  useUploads,
} from '../api/hooks';
```

And change line 24:

```ts
import PlatformSelector from '../components/PlatformSelector';
```

to:

```ts
import PlatformSelector, { selectablePlatformCount } from '../components/PlatformSelector';
```

- [ ] **Step 2: Replace the drafts-list lookup**

Change lines 116-117:

```tsx
  const { data: shows = [] } = useShows();
  const selectedShow = shows.find((s) => s.id === showId) ?? null;
```

to:

```tsx
  // Any status, not just drafts: an attach-recording flow points here at an
  // already-published show. Also removes listShows' perPage=200 cap for the
  // direct-by-id case.
  const selectedShow = useShow(showId ?? '', !!showId).data ?? null;
```

- [ ] **Step 3: Relax the submit gate**

Change lines 286-287:

```tsx
  const canSubmit =
    !!selectedShow && !!videoS3Key && platforms.length > 0 && !createUpload.isPending && !previewConverting;
```

to:

```tsx
  const canSubmit =
    !!selectedShow &&
    !!videoS3Key &&
    // Zero platforms is only valid when there's genuinely nothing left to
    // pick (both already published) — never a silent accidental submit on a
    // real draft.
    (platforms.length > 0 || selectablePlatformCount(existingLinks) === 0) &&
    !createUpload.isPending &&
    !previewConverting;
```

(`existingLinks` is already defined earlier in this component, at the `const existingLinks = selectedShow?.mediaLinks ?? [];` line — no new variable needed.)

- [ ] **Step 4: Typecheck**

Run: `cd ui && npx tsc --noEmit`
Expected: no errors. (No automated test possible here — `ui` has no jsdom/testing-library; verified in the browser in Task 6.)

- [ ] **Step 5: Commit**

```bash
git add ui/src/pages/NewUpload.tsx
git commit -m "feat(ui): NewUpload works for an already-published show"
```

---

### Task 5: Frontend — the `/attach` picker tab

**Files:**
- Modify: `ui/src/api/hooks.ts` (add `useListPublishedShows`, near `useShows` at line 11-14)
- Create: `ui/src/pages/Attach.tsx`
- Modify: `ui/src/router.tsx:29` (import), `:149-151` (nav button), `:230-234` (route def), `:245-248` (route tree)
- Modify: `ui/src/dev/mock-backend.ts` (add `shows.listPublished` mock case)

**Interfaces:**
- Produces: `useListPublishedShows()` hook, `Attach` page component, `/attach` route.
- Consumes: `shows.listPublished` (Task 1), `AgendaShow` type (`ui/src/api/client.ts`), `PlatformIcon` (`ui/src/components/PlatformIcon.tsx`, already used identically in `Archive.tsx`/`Shows.tsx`).

- [ ] **Step 1: Add the query hook**

In `ui/src/api/hooks.ts`, right after `useShows()` (ends at line 14), add:

```ts
// Shows already published elsewhere, for the "attach a recording" picker.
// Filtered client-side in Attach.tsx to ones with no cs-archive-video link —
// this returns every published record.
export function useListPublishedShows() {
  const trpc = useTRPC();
  return useQuery(trpc.shows.listPublished.queryOptions(undefined, { staleTime: 30_000 }));
}
```

- [ ] **Step 2: Create the picker page**

Create `ui/src/pages/Attach.tsx`:

```tsx
import { Link } from '@tanstack/react-router';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useListPublishedShows } from '../api/hooks';
import PlatformIcon from '../components/PlatformIcon';
import { c } from '../theme';

const LABEL_TO_PLATFORM: Record<string, string> = { YouTube: 'youtube', MixCloud: 'mixcloud' };

export default function Attach() {
  const { data: shows = [], isPending, isError } = useListPublishedShows();

  // Eligible = published somewhere already, but nothing archived here yet.
  // cs-archive-video and cs-archive-audio are always written together (same
  // publishArchiveLinks call), so checking one is a reliable proxy for both.
  const eligible = shows
    .filter((s) => !s.mediaLinks.some((l) => l.label === 'cs-archive-video'))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <Stack spacing={3}>
      <Box component="header">
        <Typography variant="h1">attach a recording</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          shows already published elsewhere, with no archived recording here yet.
        </Typography>
      </Box>

      {isPending ? (
        <Typography color="text.secondary">loading…</Typography>
      ) : isError ? (
        <Typography color="error.main">couldn't load published shows.</Typography>
      ) : eligible.length === 0 ? (
        <Typography color="text.secondary">every published show already has a recording archived here.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {eligible.map((s) => (
            <ButtonBase
              key={s.id}
              component={Link}
              to="/upload/$showId"
              params={{ showId: s.id }}
              sx={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: `1px solid ${c.line}`,
                backgroundColor: c.surface,
                p: 2,
                '&:hover': { borderColor: c.ink },
              }}
            >
              <Typography sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{s.title}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block' }}>
                {s.date}
              </Typography>
              {s.mediaLinks.length > 0 && (
                <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
                  {s.mediaLinks.map((l) => (
                    <Stack key={l.label} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                      <PlatformIcon platform={LABEL_TO_PLATFORM[l.label] ?? ''} />
                      <Typography variant="caption" color="text.secondary">
                        {l.label}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </ButtonBase>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
```

- [ ] **Step 3: Register the route and nav tab**

In `ui/src/router.tsx`, add the import after line 29 (`import Storage from './pages/Storage';`):

```ts
import Attach from './pages/Attach';
```

Add a nav button after the storage button (after line 151, inside the `<Stack component="nav">` block):

```tsx
            <Button component={Link} to="/attach" variant="text" sx={pathname.startsWith('/attach') ? navActiveSx : navSx}>
              attach recording
            </Button>
```

Add the route definition after `storageRoute` (after line 234):

```ts
const attachRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/attach',
  component: Attach,
});
```

Add it to the route tree (line 247), changing:

```ts
  authedRoute.addChildren([indexRoute, uploadRoute, historyRoute, archiveRoute, storageRoute]),
```

to:

```ts
  authedRoute.addChildren([indexRoute, uploadRoute, historyRoute, archiveRoute, storageRoute, attachRoute]),
```

- [ ] **Step 4: Add the mock-mode fixture**

In `ui/src/dev/mock-backend.ts`, add a case in the `resolve()` switch, next to `case 'shows.listStates':`:

```ts
    case 'shows.listPublished':
      // Ids match entries already in the `shows` (drafts) fixture, so
      // shows.get — which NewUpload.tsx now calls via useShow — resolves
      // them too, without a second fixture to keep in sync.
      return [
        {
          id: 'show_zonderdak', title: 'Radio (z)onderdak', description: '', date: '2026-07-31',
          startTime: '20:00', endTime: '22:00', imageUrl: null, tags: null,
          mediaLinks: [{ label: 'YouTube', type: 'video', url: 'https://youtube.com/watch?v=demo1' }],
          showDescription: null,
        },
        {
          id: 'show_dubplate', title: 'Dubplate Hour', description: '', date: '2026-07-20',
          startTime: '21:00', endTime: '23:00', imageUrl: null, tags: null,
          mediaLinks: [
            { label: 'YouTube', type: 'video', url: 'https://youtube.com/watch?v=demo3' },
            { label: 'MixCloud', type: 'audio', url: 'https://mixcloud.com/demo3' },
          ],
          showDescription: null,
        },
        {
          id: 'show_breakfast', title: 'Breakfast Club', description: '', date: '2026-07-25',
          startTime: '08:00', endTime: '10:00', imageUrl: null, tags: null,
          mediaLinks: [
            { label: 'YouTube', type: 'video', url: 'https://youtube.com/watch?v=demo2' },
            { label: 'cs-archive-video', type: 'download', url: 'https://uploader.test/api/public/recordings/x/video' },
          ],
          showDescription: null,
        },
      ];
```

- [ ] **Step 5: Typecheck and build**

Run: `cd ui && npx tsc --noEmit && npx vite build`
Expected: no errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add ui/src/api/hooks.ts ui/src/pages/Attach.tsx ui/src/router.tsx ui/src/dev/mock-backend.ts
git commit -m "feat(ui): add the /attach picker tab"
```

---

### Task 6: Manual verification in the browser (mock mode)

No jsdom/testing-library exists in `ui`, so this is the actual test for Tasks 4–5's UI behavior — don't skip it.

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server in mock mode**

Run: `cd ui && npx vite --port 5183` (background), then open `http://localhost:5183/attach?mock=1` with the Playwright MCP tools (`localhost` in claude-in-chrome resolves on the user's machine, not this sandbox — use `mcp__plugin_playwright_playwright__*` instead, per this session's established practice).

- [ ] **Step 2: Verify the picker list**

Expected: exactly 2 rows — "Radio (z)onderdak" and "Dubplate Hour". "Breakfast Club" must NOT appear (it already has `cs-archive-video`).

- [ ] **Step 3: Verify the single-missing-platform case**

Click into "Radio (z)onderdak" (only YouTube published). Expected: `PlatformSelector` shows YouTube as an "already published" card, and MixCloud as a selectable (unchecked) button. Confirm the submit button stays disabled until either MixCloud is picked or a video is attached AND MixCloud is picked (platforms.length must be > 0 here — there IS something selectable).

- [ ] **Step 4: Verify the archive-only case**

Go back, click into "Dubplate Hour" (both YouTube and MixCloud already published). Expected: both render as "already published" cards, no selectable checkboxes, zero platforms pre-selected — and (once a video is attached in the form) the submit button is enabled despite zero platforms selected.

- [ ] **Step 5: Stop the dev server**

Run: `pkill -f "vite --port 5183"`
