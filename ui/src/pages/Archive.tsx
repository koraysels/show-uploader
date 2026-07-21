import { useState } from 'react';
import {
  useUploads,
  useCovers,
  usePublishRecord,
  useGenerateAudio,
  useYoutubeStatus,
  usePlatformSetPublic,
  useShow,
  useSyncPlatforms,
} from '../api/hooks';
import { usePaged, Pager } from '../components/Pager';
import type { UploadWithJobs } from '../api/client';

const PLATFORM_LABELS: Record<string, string> = { youtube: 'YouTube', mixcloud: 'MixCloud' };

// The agenda admin hosts each archive record at `<base>/#/archive/<recordId>`,
// where the record id is the show_id.
const AGENDA_BASE = import.meta.env.VITE_POCKETBASE_URL ?? 'https://agenda.coming-soon.space';

const LABEL_TO_ID: Record<string, string> = { YouTube: 'youtube', MixCloud: 'mixcloud' };

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

  const present = links.map((l) => LABEL_TO_ID[l.label]).filter(Boolean);
  const [selected, setSelected] = useState<string[]>(present);
  const toggle = (p: string) => setSelected((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
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
function ArchiveCard({ upload, coverUrl }: { upload: UploadWithJobs; coverUrl: string | null }) {
  const [syncOpen, setSyncOpen] = useState(false);
  const publish = usePublishRecord();
  const pub = publishedJobs(upload);
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

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {pub.map((j) => (
              <PublishedLink key={j.platform} platform={j.platform} url={j.result_url!} />
            ))}
            <span className="text-line" aria-hidden>|</span>
            <DownloadLink url={upload.video_url} label="Video" />
            <AudioCell upload={upload} />
            <span className="ml-auto flex items-center gap-3">
              {publish.isSuccess ? (
                <span className="rounded-full border border-ok/40 bg-ok-soft px-3 py-1 text-xs font-medium lowercase text-ok">
                  ✓ on main website
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => publish.mutate(upload.id)}
                  disabled={publish.isPending}
                  className="rounded-full bg-ink px-3.5 py-1 text-xs font-medium lowercase text-paper hover:opacity-90 disabled:opacity-50"
                  title="set the agenda record to published — makes it live on the main website"
                >
                  {publish.isPending ? 'publishing…' : publish.isError ? 'retry publish' : 'publish to main website'}
                </button>
              )}
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

          {syncOpen && <SyncPanel showId={upload.show_id} links={links} />}
        </div>
      </div>
    </div>
  );
}

export default function Archive() {
  const { data: uploads = [], isPending } = useUploads();
  // Cover per show from PocketBase (all statuses), keyed by show_id — polled live.
  const { data: covers = {} } = useCovers();
  const archived = uploads
    .filter((u) => publishedJobs(u).length > 0)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  const paged = usePaged(archived, (u) => u.title);

  if (isPending) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold lowercase tracking-tight text-ink">archive</h1>
        <input
          value={paged.query}
          onChange={(e) => paged.setQuery(e.target.value)}
          placeholder="Filter archive…"
          className="field w-full sm:w-64"
        />
      </header>
      {archived.length === 0 ? (
        <p className="text-sm text-muted">no published shows yet.</p>
      ) : (
        <>
          <div className="space-y-3">
            {paged.slice.map((u) => (
              <ArchiveCard key={u.id} upload={u} coverUrl={covers[u.show_id] ?? null} />
            ))}
          </div>
          <Pager page={paged.page} pageCount={paged.pageCount} total={paged.total} setPage={paged.setPage} unit="shows" />
        </>
      )}
    </div>
  );
}
