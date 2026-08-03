import { useState } from 'react';
import { Link } from '@tanstack/react-router';
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
import type { UploadWithJobs } from '../api/client';

const PLATFORM_LABELS: Record<string, string> = { youtube: 'YouTube', mixcloud: 'MixCloud' };

// The agenda admin hosts each archive record at `<base>/#/archive/<recordId>`,
// where the record id is the show_id.
const AGENDA_BASE = import.meta.env.VITE_POCKETBASE_URL ?? 'https://agenda.coming-soon.space';

type Platform = 'youtube' | 'mixcloud';
const LABEL_TO_ID: Record<string, Platform> = { YouTube: 'youtube', MixCloud: 'mixcloud' };

// A published platform link + the real YouTube privacy status (read-only). Sync
// actions live in the SyncPanel below, metadata editing in PocketBase ("edit ↗").
function PublishedLink({ platform, url }: { platform: string; url: string }) {
  const isYt = platform === 'youtube';
  const status = useYoutubeStatus(url, isYt);
  const priv = status.data?.privacyStatus;
  return (
    <span className="inline-flex items-center gap-1.5">
      <a href={url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
        {PLATFORM_LABELS[platform] ?? platform} ↗
      </a>
      {isYt && priv && (
        <span className={`text-[10px] lowercase ${priv === 'public' ? 'text-ok' : 'text-faint'}`}>{priv}</span>
      )}
    </span>
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
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <p className="text-[11px] lowercase tracking-wide text-faint">sync from agenda · pocketbase is the master</p>
      {show.isPending ? (
        <p className="text-xs text-muted">loading agenda data…</p>
      ) : !show.data ? (
        <p className="text-xs text-danger">couldn't load agenda data.</p>
      ) : (
        <>
          <div className="flex gap-3">
            {show.data.imageUrl && (
              <img src={show.data.imageUrl} alt="" className="h-20 w-20 shrink-0 border border-line object-cover" />
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <p className="whitespace-pre-wrap text-sm text-ink">
                {show.data.description || <span className="text-faint">no description in agenda</span>}
              </p>
              <div className="flex flex-wrap gap-1">
                {(show.data.tags ?? []).length > 0 ? (
                  show.data.tags!.map((t) => (
                    <span key={t} className="border border-line px-1.5 py-0.5 text-[11px] lowercase text-muted">
                      {t}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-faint">no tags</span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            {links.map((l) => {
              const p = LABEL_TO_ID[l.label];
              if (!p) return null;
              const r = results?.[p];
              return (
                <div key={p} className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.includes(p)}
                      onChange={() => toggle(p)}
                      className="h-4 w-4 rounded border-line-strong text-accent focus:ring-accent"
                    />
                    {l.label}
                  </label>
                  {p === 'youtube' && ytStatus.data?.privacyStatus && (
                    <span
                      className={`text-[10px] lowercase ${
                        ytStatus.data.privacyStatus === 'public' ? 'text-ok' : 'text-faint'
                      }`}
                    >
                      {ytStatus.data.privacyStatus}
                    </span>
                  )}
                  {p === 'youtube' && ytLink && ytStatus.data?.privacyStatus && ytStatus.data.privacyStatus !== 'public' && (
                    <button
                      type="button"
                      disabled={setPublic.isPending}
                      onClick={() => setPublic.mutate(ytLink.url, { onSuccess: () => ytStatus.refetch() })}
                      className="rounded border border-line px-1.5 py-0.5 text-[10px] lowercase text-muted hover:border-ink hover:text-ink disabled:opacity-50"
                      title="make this video public on YouTube"
                    >
                      {setPublic.isPending ? 'setting…' : 'set public'}
                    </button>
                  )}
                  {r && (
                    <span className={`text-[10px] ${r === 'ok' ? 'text-ok' : 'text-danger'}`} title={r === 'ok' ? undefined : r}>
                      {r === 'ok' ? '✓ synced' : `✕ ${r}`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={sync.isPending || selected.length === 0}
              onClick={() => sync.mutate({ id: showId, platforms: selected })}
              className="bg-ink px-4 py-2 text-sm font-medium lowercase text-paper hover:opacity-90 disabled:opacity-40"
            >
              {sync.isPending ? 'syncing…' : 'sync selected'}
            </button>
            <span className="text-[11px] text-faint">
              pushes agenda title / description / tags{selected.includes('mixcloud') ? ' + cover (mixcloud)' : ''} to the
              checked platforms.
            </span>
          </div>
          {sync.isError && <p className="text-xs text-danger">sync failed — try again.</p>}
        </>
      )}
    </div>
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
  if (!url) return <span className="text-faint">{label} —</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
      {label} ↓
    </a>
  );
}

// Inline playback of the archived recording. Native controls give scrubbing for
// free: the presigned S3 GET honours range requests and the remuxed MP4 carries
// its moov atom up front (+faststart), so seeking doesn't pull the whole file.
function VideoPlayer({ url }: { url: string }) {
  return (
    <div className="mt-4 border border-line bg-paper p-2">
      <video
        src={url}
        controls
        preload="metadata"
        playsInline
        className="max-h-[70vh] w-full bg-black"
      />
      <p className="mt-2 text-[11px] lowercase text-faint">
        recordings are HEVC — Safari and Chrome play them, Firefox may not. the download always works.
      </p>
    </div>
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

  if (info.isPending) return <span className="text-xs lowercase text-faint">checking file…</span>;
  if (info.isError) return <span className="text-xs lowercase text-faint">file state unknown</span>;

  const { exists, size, filename } = info.data;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs lowercase">
      {exists ? (
        <span className="inline-flex items-center gap-1.5 text-muted" title={filename}>
          <span className="h-1.5 w-1.5 rounded-full bg-muted" aria-hidden />
          source file{size ? ` · ${humanSize(size)}` : ''}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-danger" title={`${filename} is not in the bucket`}>
          <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden />
          source file missing
        </span>
      )}
      <Link
        to="/upload/$showId"
        params={{ showId: upload.show_id }}
        className="text-faint underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink"
        title="upload a different recording for this show. re-publishing to a platform that already has this show creates a second entry there — the old link stays until you un-link it"
      >
        {exists ? 'replace' : 'upload'}
      </Link>
    </span>
  );
}

function Spinner() {
  return <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden />;
}

// The audio archive is produced by the 'archive' job — reflect its live state
// so the operator sees it being extracted, not just a dash.
function AudioCell({ upload }: { upload: UploadWithJobs }) {
  const gen = useGenerateAudio();
  if (upload.audio_url) return <DownloadLink url={upload.audio_url} label="Audio" />;
  const job = upload.jobs.find((j) => j.platform === 'archive');
  if (gen.isPending || job?.status === 'processing' || job?.status === 'queued')
    return (
      <span className="inline-flex items-center gap-1.5 text-muted">
        <Spinner /> Audio {job?.progress_pct ?? 0}%
      </span>
    );
  // No audio yet — offer to (re)generate it.
  return (
    <button
      type="button"
      onClick={() => gen.mutate(upload.id)}
      className="font-medium text-accent hover:underline"
      title={job?.status === 'failed' ? job.error ?? 'retry' : 'extract the downloadable audio'}
    >
      {job?.status === 'failed' ? 'retry audio' : 'generate audio'}
    </button>
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
    <div className="border border-line bg-surface p-5">
      <div className="flex gap-4">
        {coverUrl && (
          <img
            src={coverUrl}
            alt=""
            className="h-16 w-16 shrink-0 border border-line object-cover"
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-medium text-ink">{upload.title}</p>
            <p className="shrink-0 font-mono text-[13px] text-muted">{new Date(upload.created_at).toLocaleString()}</p>
          </div>

          {/* Tier one: the media itself — where it's published, how to play it,
              how to get it. What the operator came here for. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {pub.map((j) => (
              <PublishedLink key={j.platform} platform={j.platform} url={j.result_url!} />
            ))}
            {pub.length > 0 && (
              <span className="text-line" aria-hidden>
                |
              </span>
            )}
            {playable && (
              <button
                type="button"
                onClick={() => setPlayerOpen((v) => !v)}
                className="font-medium lowercase text-accent hover:underline"
              >
                {playerOpen ? 'close player' : 'watch ▸'}
              </button>
            )}
            <DownloadLink url={upload.video_url} label="video" />
            <AudioCell upload={upload} />
          </div>

          {/* Tier two: managing the record. Quieter, and separated by a rule so
              the destructive half never sits inline with the download links. */}
          <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
            {live ? (
              <span className="inline-flex items-center gap-1.5 text-xs lowercase text-ok" title="this show is live on the main website">
                <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />
                on main website
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs lowercase text-faint" title="draft — not visible on the main website">
                <span className="h-1.5 w-1.5 rounded-full bg-line" aria-hidden />
                draft
              </span>
            )}

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
              <button
                type="button"
                onClick={() => publish.mutate(upload.id)}
                disabled={publish.isPending}
                className="border border-ink px-2.5 py-1 text-xs lowercase text-ink hover:bg-ink hover:text-paper disabled:opacity-50"
                title="set the agenda record to published — makes it live on the main website"
              >
                {publish.isPending ? 'publishing…' : publish.isError ? 'retry publish' : 'publish to main website'}
              </button>
            )}

            <SourceVideo upload={upload} />

            <span className="ml-auto flex items-center gap-4">
              <button
                type="button"
                onClick={() => setSyncOpen((v) => !v)}
                className="text-xs lowercase text-faint underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink"
              >
                {syncOpen ? 'close' : 'sync platforms'}
              </button>
              <a
                href={agendaUrl}
                target="_blank"
                rel="noreferrer"
                title="edit this record in the agenda (PocketBase is the master)"
                className="text-xs lowercase text-faint underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink"
              >
                edit ↗
              </a>
            </span>
          </div>

          {/* A failed unpublish used to be silent — the button just reappeared,
              and the operator assumed the show came off the website. */}
          {unpublish.isError && (
            <p className="mt-2 text-xs lowercase text-danger">
              unpublish failed — the show is still live. try again.
            </p>
          )}

          {playerOpen && playable && <VideoPlayer url={upload.video_url} />}
          {syncOpen && <SyncPanel showId={upload.show_id} links={links} />}
        </div>
      </div>
    </div>
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
      <span className="text-xs lowercase text-ok">
        ✓ converting {backfill.data.enqueued} recording{backfill.data.enqueued === 1 ? '' : 's'} — watch the progress bars
      </span>
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold lowercase tracking-tight text-ink">archive</h1>
        <div className="flex flex-wrap items-center gap-4">
          <RemuxBackfill pending={needsRemux} />
          <input
            value={paged.query}
            onChange={(e) => paged.setQuery(e.target.value)}
            placeholder="Filter archive…"
            className="field w-full sm:w-64"
          />
        </div>
      </header>
      {isPending ? (
        <ListSkeleton />
      ) : archived.length === 0 ? (
        <p className="text-sm text-muted">no published shows yet.</p>
      ) : (
        <>
          <div className="space-y-3">
            {paged.slice.map((u) => (
              <ArchiveCard
                key={u.id}
                upload={u}
                coverUrl={states[u.show_id]?.cover ?? null}
                live={states[u.show_id]?.status === 'published'}
              />
            ))}
          </div>
          <Pager page={paged.page} pageCount={paged.pageCount} total={paged.total} setPage={paged.setPage} unit="shows" />
        </>
      )}
    </div>
  );
}
