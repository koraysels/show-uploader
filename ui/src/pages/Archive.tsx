import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import MuiLink from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  useUploads,
  useArchiveStates,
  usePublishRecord,
  useGenerateAudio,
  useYoutubeStatus,
  usePlatformSetPublic,
  useShow,
  useSyncPlatforms,
  useRemuxBackfill,
  useUnpublishRecord,
  useVideoInfo,
} from '../api/hooks';
import { usePaged, Pager } from '../components/Pager';
import { ListSkeleton } from '../components/Skeleton';
import ConfirmAction from '../components/ConfirmAction';
import PlatformIcon from '../components/PlatformIcon';
import type { UploadWithJobs } from '../api/client';
import { c, ROLE } from '../theme';

const PLATFORM_LABELS: Record<string, string> = { youtube: 'YouTube', mixcloud: 'MixCloud' };

// The agenda admin hosts each archive record at `<base>/#/archive/<recordId>`,
// where the record id is the show_id.
const AGENDA_BASE = import.meta.env.VITE_POCKETBASE_URL ?? 'https://agenda.coming-soon.space';

type Platform = 'youtube' | 'mixcloud';
const LABEL_TO_ID: Record<string, Platform> = { YouTube: 'youtube', MixCloud: 'mixcloud' };

// Agenda descriptions are HTML (the record is edited with a rich-text field).
// The sync preview was printing the tags literally — "<p>Monthly show…</p>" —
// so read the text out instead. DOMParser builds an inert document: nothing in
// the string is fetched or executed.
function htmlToText(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? '';
}

// Every tappable thing in a card action row. 40px is the floor a thumb can hit
// reliably; the old 20px-tall text links were the main reason this page was
// painful on a phone.
const actionSx = { minHeight: 40, px: 1.25, fontSize: '0.75rem' } as const;

// Shared by every text link in a card: normal link affordance, with a 32px hit
// area so it's still thumb-sized on a phone.
const linkSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
  minHeight: 32,
  fontWeight: 500,
} as const;

// A published platform link + the real YouTube privacy status (read-only). Sync
// actions live in the SyncPanel below, metadata editing in PocketBase ("edit ↗").
//
// A link, not a button: it leaves the app. Boxing these put five identical
// rectangles in a row and buried the one control that actually does something.
function PublishedLink({ platform, url }: { platform: string; url: string }) {
  const isYt = platform === 'youtube';
  const status = useYoutubeStatus(url, isYt);
  const priv = status.data?.privacyStatus;
  return (
    <MuiLink href={url} target="_blank" rel="noreferrer" color={ROLE.navigate} sx={linkSx}>
      <PlatformIcon platform={platform} />
      {PLATFORM_LABELS[platform] ?? platform} ↗
      {isYt && priv && (
        <Box component="span" sx={{ fontSize: '0.625rem', color: priv === 'public' ? c.ok : c.faint }}>
          {priv}
        </Box>
      )}
    </MuiLink>
  );
}

// Re-sync the current PocketBase metadata (title/description/tags/cover) to the
// platforms. Shows exactly what will be pushed (the agenda values) and lets the
// operator pick which platforms — published shows are gone from the draft list,
// so this is the only place to re-sync them. PocketBase stays the master.
function SyncPanel({ showId, links }: { showId: string; links: { label: string; url: string }[] }) {
  const show = useShow(showId, true);
  const sync = useSyncPlatforms();
  const setPublic = usePlatformSetPublic();
  const ytLink = links.find((l) => l.label === 'YouTube');
  const ytStatus = useYoutubeStatus(ytLink?.url ?? '', !!ytLink);

  const present = links.map((l) => LABEL_TO_ID[l.label]).filter(Boolean) as Platform[];
  const [selected, setSelected] = useState<Platform[]>(present);
  const toggle = (p: Platform) => setSelected((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  const results = sync.data?.results;

  return (
    <Stack spacing={1.5} sx={{ mt: 2, pt: 2, borderTop: `1px solid ${c.line}` }}>
      <Typography variant="caption" color="text.disabled">
        sync from agenda · pocketbase is the master
      </Typography>
      {show.isPending ? (
        <Typography variant="caption" color="text.secondary">
          loading agenda data…
        </Typography>
      ) : !show.data ? (
        <Typography variant="caption" color="error.main">
          couldn't load agenda data.
        </Typography>
      ) : (
        <>
          <Stack direction="row" spacing={1.5}>
            {show.data.imageUrl && (
              <Box
                component="img"
                src={show.data.imageUrl}
                alt=""
                sx={{ width: 80, height: 80, flexShrink: 0, border: `1px solid ${c.line}`, objectFit: 'cover' }}
              />
            )}
            <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {htmlToText(show.data.description ?? '') || (
                  <Box component="span" sx={{ color: c.faint }}>
                    no description in agenda
                  </Box>
                )}
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                {(show.data.tags ?? []).length > 0 ? (
                  show.data.tags!.map((t) => <Chip key={t} label={t} />)
                ) : (
                  <Typography variant="caption" color="text.disabled">
                    no tags
                  </Typography>
                )}
              </Stack>
            </Stack>
          </Stack>

          <Stack spacing={0.75}>
            {links.map((l) => {
              const p = LABEL_TO_ID[l.label];
              if (!p) return null;
              const r = results?.[p];
              return (
                <Stack key={p} direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                  <FormControlLabel
                    control={<Checkbox checked={selected.includes(p)} onChange={() => toggle(p)} />}
                    label={l.label}
                    sx={{ ml: 0, mr: 0 }}
                  />
                  {p === 'youtube' && ytStatus.data?.privacyStatus && (
                    <Typography
                      variant="caption"
                      sx={{ color: ytStatus.data.privacyStatus === 'public' ? c.ok : c.faint }}
                    >
                      {ytStatus.data.privacyStatus}
                    </Typography>
                  )}
                  {p === 'youtube' && ytLink && ytStatus.data?.privacyStatus && ytStatus.data.privacyStatus !== 'public' && (
                    <Tooltip title="make this video public on YouTube">
                      <Button
                        disabled={setPublic.isPending}
                        color={ROLE.write}
                        onClick={() => setPublic.mutate(ytLink.url, { onSuccess: () => ytStatus.refetch() })}
                        sx={actionSx}
                      >
                        {setPublic.isPending ? 'setting…' : 'set public'}
                      </Button>
                    </Tooltip>
                  )}
                  {r && (
                    <Tooltip title={r === 'ok' ? 'synced' : r}>
                      <Typography variant="caption" sx={{ color: r === 'ok' ? c.ok : c.danger }}>
                        {r === 'ok' ? '✓ synced' : `✕ ${r}`}
                      </Typography>
                    </Tooltip>
                  )}
                </Stack>
              );
            })}
          </Stack>

          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
            <Button
              variant="contained"
              color={ROLE.write}
              disabled={sync.isPending || selected.length === 0}
              onClick={() => sync.mutate({ id: showId, platforms: selected })}
              sx={{ minHeight: 44 }}
            >
              {sync.isPending ? 'syncing…' : 'sync selected'}
            </Button>
            <Typography variant="caption" color="text.disabled" sx={{ flex: 1, minWidth: 180 }}>
              pushes agenda title / description / tags{selected.includes('mixcloud') ? ' + cover (mixcloud)' : ''} to
              the checked platforms.
            </Typography>
          </Stack>
          {sync.isError && (
            <Typography variant="caption" color="error.main">
              sync failed — try again.
            </Typography>
          )}
        </>
      )}
    </Stack>
  );
}

// A show belongs in the archive once it's been published somewhere. Sorted by
// platform name so the links render in a stable, alphabetical order everywhere.
function publishedJobs(u: UploadWithJobs) {
  return u.jobs
    .filter((j) => (j.platform === 'youtube' || j.platform === 'mixcloud') && j.status === 'done' && j.result_url)
    .sort((a, b) => a.platform.localeCompare(b.platform));
}

function DownloadLink({ url, label }: { url: string | null; label: string }) {
  if (!url)
    return (
      <Typography variant="body2" color="text.disabled">
        {label} —
      </Typography>
    );
  return (
    <MuiLink href={url} target="_blank" rel="noreferrer" color={ROLE.navigate} sx={linkSx}>
      {label} ↓
    </MuiLink>
  );
}

// Inline playback of the archived recording. Native controls give scrubbing for
// free: the presigned S3 GET honours range requests and the remuxed MP4 carries
// its moov atom up front (+faststart), so seeking doesn't pull the whole file.
function VideoPlayer({ url }: { url: string }) {
  return (
    <Box sx={{ mt: 2, p: 1, border: `1px solid ${c.line}`, backgroundColor: c.paper }}>
      <Box
        component="video"
        src={url}
        controls
        preload="metadata"
        playsInline
        sx={{ width: '100%', maxHeight: '70vh', display: 'block', backgroundColor: '#000' }}
      />
      <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: 'block' }}>
        recordings are hevc — safari and chrome play them, firefox may not. the download always works.
      </Typography>
    </Box>
  );
}

function humanSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

// The source recording's real state on S3, plus the way back to the upload page
// when it's wrong. The row's key alone would claim a file exists even when the
// object is gone, which is exactly the case worth catching.
function SourceVideo({ upload }: { upload: UploadWithJobs }) {
  const info = useVideoInfo(upload.id);

  if (info.isPending)
    return (
      <Typography variant="caption" color="text.disabled">
        checking file…
      </Typography>
    );
  if (info.isError)
    return (
      <Typography variant="caption" color="text.disabled">
        file state unknown
      </Typography>
    );

  const { exists, size, filename } = info.data;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
      {/* The row's label already says "source file" — repeating it in the value
          just made the line longer. */}
      <Tooltip title={exists ? filename : `${filename} is not in the bucket`}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Box
            aria-hidden
            sx={{ width: 6, height: 6, borderRadius: '999px', bgcolor: exists ? c.muted : c.danger, flexShrink: 0 }}
          />
          <Typography variant="body2" sx={{ color: exists ? c.muted : c.danger }}>
            {exists ? (size ? humanSize(size) : 'on s3') : 'missing from s3'}
          </Typography>
        </Stack>
      </Tooltip>
      {/* TanStack Link (typed params) inside a styled wrapper — MUI's `component`
          generic drops those types. */}
      <Tooltip title="upload a different recording for this show. re-publishing to a platform that already has this show creates a second entry there — the old link stays until you un-link it">
        <Box
          sx={{
            fontSize: '0.6875rem',
            '& a': {
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 32,
              color: c.link,
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
            },
            '& a:hover': { color: c.ink },
          }}
        >
          <Link to="/upload/$showId" params={{ showId: upload.show_id }}>
            {exists ? 'replace' : 'upload'}
          </Link>
        </Box>
      </Tooltip>
    </Stack>
  );
}

// The audio archive is produced by the 'archive' job. Three shapes for three
// meanings: a link once it exists, live progress while it's being made, and a
// button only when there's something to press.
function AudioState({ upload, as }: { upload: UploadWithJobs; as: 'link' | 'action' }) {
  const gen = useGenerateAudio();
  const job = upload.jobs.find((j) => j.platform === 'archive');
  const busy = gen.isPending || job?.status === 'processing' || job?.status === 'queued';

  if (upload.audio_url) return as === 'link' ? <DownloadLink url={upload.audio_url} label="audio" /> : null;

  if (busy)
    return as === 'link' ? (
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
        <CircularProgress size={12} thickness={6} />
        <Typography variant="body2" color="text.secondary">
          audio {job?.progress_pct ?? 0}%
        </Typography>
      </Stack>
    ) : null;

  if (as === 'link') return null;
  // No audio yet — offer to (re)generate it.
  return (
    <Tooltip title={job?.status === 'failed' ? job.error ?? 'retry' : 'extract the downloadable audio'}>
      <Button color={ROLE.write} onClick={() => gen.mutate(upload.id)} sx={actionSx}>
        {job?.status === 'failed' ? 'retry audio' : 'generate audio'}
      </Button>
    </Tooltip>
  );
}

/**
 * One labelled row of a card: a fixed label column and whatever controls belong
 * to it. Two columns from `sm` up; on a phone the label sits on its own line
 * above, because a 116px column would leave the values squeezed into nothing.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '116px 1fr' },
        columnGap: 2,
        rowGap: 0.25,
        alignItems: 'baseline',
        py: 0.25,
      }}
    >
      <Typography variant="caption" color="text.disabled">
        {label}
      </Typography>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, minWidth: 0 }}>
        {children}
      </Stack>
    </Box>
  );
}

// coverUrl comes from the PocketBase record (the master), not the stored
// upload.image_url snapshot — so the thumbnail is always the current agenda image.
function ArchiveCard({
  upload,
  coverUrl,
  live,
}: {
  upload: UploadWithJobs;
  coverUrl: string | null;
  // PocketBase's own status, not this session's click history.
  live: boolean;
}) {
  const [syncOpen, setSyncOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const publish = usePublishRecord();
  const unpublish = useUnpublishRecord();
  const pub = publishedJobs(upload);
  // Only the remuxed MP4 plays in a browser; an upload still stored as MKV stays
  // download-only until its archive job has run.
  const playable = !!upload.video_url && /\.mp4$/i.test(upload.video_s3_key);
  // Editing happens in the PocketBase agenda admin — the master record. There's
  // no duplicate record here, so the "edit" action just opens it there.
  const agendaUrl = `${AGENDA_BASE}/#/archive/${upload.show_id}`;
  const links = pub.map((j) => ({ label: PLATFORM_LABELS[j.platform] ?? j.platform, url: j.result_url! }));

  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.75, sm: 2.5 } }}>
      {/* Cover + title share a row at every width — a 56px thumbnail is small
          enough to leave the title readable on a 360px screen — but the meta
          below it stacks instead of fighting for the same line. */}
      <Stack direction="row" spacing={{ xs: 1.5, sm: 2 }}>
        {coverUrl && (
          <Box
            component="img"
            src={coverUrl}
            alt=""
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              e.currentTarget.style.display = 'none';
            }}
            sx={{
              width: { xs: 56, sm: 64 },
              height: { xs: 56, sm: 64 },
              flexShrink: 0,
              border: `1px solid ${c.line}`,
              objectFit: 'cover',
            }}
          />
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{upload.title}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {new Date(upload.created_at).toLocaleString()}
          </Typography>
        </Box>
      </Stack>

      {/* One labelled row per kind of thing. The card used to be two runs of
          mixed controls where you had to read every label to find the one you
          wanted; now the left column tells you which row to look at, and the
          rows are always in the same order whatever state the show is in. */}
      <Stack spacing={0.5} sx={{ mt: 2 }}>
        {playable && (
          <Field label="preview">
            <Button color={ROLE.commit} onClick={() => setPlayerOpen((v) => !v)} sx={actionSx}>
              {playerOpen ? '× close player' : '▸ watch'}
            </Button>
          </Field>
        )}

        {pub.length > 0 && (
          <Field label="platform links">
            {pub.map((j) => (
              <PublishedLink key={j.platform} platform={j.platform} url={j.result_url!} />
            ))}
          </Field>
        )}

        <Field label="downloads">
          <DownloadLink url={upload.video_url} label="video" />
          <AudioState upload={upload} as="link" />
          <AudioState upload={upload} as="action" />
        </Field>

        <Field label="source file">
          <SourceVideo upload={upload} />
        </Field>
      </Stack>

      {/* Managing the record, kept behind a rule so the destructive half never
          sits inline with the links you click all day. */}
      <Stack spacing={0.5} sx={{ mt: 1.75, pt: 1.5, borderTop: `1px solid ${c.line}` }}>
        <Field label="website">
          <Tooltip title={live ? 'this show is live on the main website' : 'draft — not visible on the main website'}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              <Box
                aria-hidden
                sx={{ width: 6, height: 6, borderRadius: '999px', flexShrink: 0, bgcolor: live ? c.ok : c.line }}
              />
              <Typography variant="body2" sx={{ color: live ? c.ok : c.faint }}>
                {live ? 'on main website' : 'draft'}
              </Typography>
            </Stack>
          </Tooltip>

          {live ? (
            <ConfirmAction
              label="unpublish"
              question="back to draft?"
              pending={unpublish.isPending}
              pendingLabel="unpublishing…"
              onConfirm={() => unpublish.mutate(upload.id)}
              title="set the agenda record back to draft — removes it from the main website. platform uploads are untouched"
            />
          ) : (
            <Tooltip title="set the agenda record to published — makes it live on the main website">
              <Button
                onClick={() => publish.mutate(upload.id)}
                disabled={publish.isPending}
                color={ROLE.write}
                sx={actionSx}
              >
                {publish.isPending ? 'publishing…' : publish.isError ? 'retry publish' : 'publish to main website'}
              </Button>
            </Tooltip>
          )}
        </Field>

        <Field label="manage">
          <Button
            variant="text"
            onClick={() => setSyncOpen((v) => !v)}
            sx={{ fontSize: '0.8125rem', minHeight: 32, color: c.muted, textDecoration: 'underline', textUnderlineOffset: '2px' }}
          >
            {syncOpen ? 'close sync panel' : 'sync platforms'}
          </Button>
          <Tooltip title="edit this record in the agenda (PocketBase is the master)">
            <MuiLink
              href={agendaUrl}
              target="_blank"
              rel="noreferrer"
              variant="body2"
              color={ROLE.navigate}
              sx={{ display: 'inline-flex', alignItems: 'center', minHeight: 32 }}
            >
              edit in agenda ↗
            </MuiLink>
          </Tooltip>
        </Field>
      </Stack>

      {/* A failed unpublish used to be silent — the button just reappeared,
          and the operator assumed the show came off the website. */}
      {unpublish.isError && (
        <Typography variant="caption" color="error.main" sx={{ mt: 1, display: 'block' }}>
          unpublish failed — the show is still live. try again.
        </Typography>
      )}

      {playerOpen && playable && <VideoPlayer url={upload.video_url} />}
      {syncOpen && <SyncPanel showId={upload.show_id} links={links} />}
    </Paper>
  );
}

// Which uploads the backfill will actually pick up. Mirrors the server rule in
// api/src/services/archive-jobs.ts (readyToArchive) so the button's count never
// promises more than the mutation converts: the archive job replaces the source
// video on S3, so it only runs once every platform job is done with it.
function needsMp4Remux(u: UploadWithJobs): boolean {
  if (/\.mp4$/i.test(u.video_s3_key)) return false;
  const platform = u.jobs.filter((j) => j.platform !== 'archive');
  return platform.length > 0 && platform.every((j) => j.status === 'done');
}

// Older recordings sit on S3 in their original container and can't be played in
// the browser. Offer the one-shot conversion only while some are left.
function RemuxBackfill({ pending }: { pending: number }) {
  const backfill = useRemuxBackfill();
  if (!pending) return null;
  if (backfill.isSuccess)
    return (
      <Typography variant="caption" color="success.main">
        ✓ converting {backfill.data.enqueued} recording{backfill.data.enqueued === 1 ? '' : 's'} — watch the progress
        bars
      </Typography>
    );
  // This replaces the original recordings on S3 and deletes the old files, in
  // bulk. It was the most destructive control on the page and the only one
  // without a confirmation step.
  return (
    <ConfirmAction
      label={
        backfill.isError
          ? 'retry conversion'
          : `convert ${pending} older recording${pending === 1 ? '' : 's'} to mp4`
      }
      question={`replaces ${pending} original recording${pending === 1 ? '' : 's'} on s3. proceed?`}
      pending={backfill.isPending}
      pendingLabel="starting…"
      onConfirm={() => backfill.mutate()}
      title="re-runs the archive job on older recordings: converts each to mp4 and deletes the original file from s3"
    />
  );
}

export default function Archive() {
  const { data: uploads = [], isPending } = useUploads();
  // Cover + real publish status per show from PocketBase, keyed by show_id —
  // polled, so a change made elsewhere shows up here.
  const { data: states = {} } = useArchiveStates();
  const archived = uploads
    .filter((u) => publishedJobs(u).length > 0)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  const paged = usePaged(archived, (u) => u.title);
  const needsRemux = uploads.filter(needsMp4Remux).length;

  return (
    <Stack spacing={3}>
      <Stack
        component="header"
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ alignItems: { sm: 'flex-end' }, justifyContent: 'space-between' }}
      >
        <Typography variant="h1">archive</Typography>
        <Stack
          direction={{ xs: 'column-reverse', sm: 'row' }}
          spacing={2}
          sx={{ alignItems: { sm: 'center' }, width: { xs: '100%', sm: 'auto' } }}
        >
          <RemuxBackfill pending={needsRemux} />
          <TextField
            size="small"
            value={paged.query}
            onChange={(e) => paged.setQuery(e.target.value)}
            placeholder="filter archive…"
            sx={{ width: { xs: '100%', sm: 256 } }}
          />
        </Stack>
      </Stack>

      {isPending ? (
        <ListSkeleton />
      ) : archived.length === 0 ? (
        <Typography color="text.secondary">no published shows yet.</Typography>
      ) : (
        <>
          <Stack spacing={1.5}>
            {paged.slice.map((u) => (
              <ArchiveCard
                key={u.id}
                upload={u}
                coverUrl={states[u.show_id]?.cover ?? null}
                live={states[u.show_id]?.status === 'published'}
              />
            ))}
          </Stack>
          <Pager page={paged.page} pageCount={paged.pageCount} total={paged.total} setPage={paged.setPage} unit="shows" />
        </>
      )}
    </Stack>
  );
}
