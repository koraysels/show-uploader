import { useState } from 'react';
import { useUploads, useShows, useUpdateMetadata, useGenres, usePublishRecord, useGenerateAudio, useYoutubeStatus } from '../api/hooks';
import TagInput from '../components/TagInput';
import { usePaged, Pager } from '../components/Pager';
import type { UploadWithJobs } from '../api/client';

const PLATFORM_LABELS: Record<string, string> = { youtube: 'YouTube', mixcloud: 'MixCloud' };

// The agenda admin hosts each archive record at `<base>/#/archive/<recordId>`,
// where the record id is the show_id.
const AGENDA_BASE = import.meta.env.VITE_POCKETBASE_URL ?? 'https://agenda.coming-soon.space';

// A published platform link, with the real YouTube privacy status appended
// (public/unlisted/private) so the operator sees the actual state.
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

// A show belongs in the archive once it's been published somewhere.
function publishedJobs(u: UploadWithJobs) {
  return u.jobs.filter(
    (j) => (j.platform === 'youtube' || j.platform === 'mixcloud') && j.status === 'done' && j.result_url
  );
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

// Edit title/description/tags and push the change to every platform + PocketBase.
function EditPanel({ upload }: { upload: UploadWithJobs }) {
  const update = useUpdateMetadata(upload.id);
  const { data: genres = [] } = useGenres();
  const [title, setTitle] = useState(upload.title);
  const [description, setDescription] = useState(upload.description ?? '');
  const [tags, setTags] = useState<string[]>(upload.tags ?? []);

  const dirty =
    title !== upload.title ||
    description !== (upload.description ?? '') ||
    tags.join('\0') !== (upload.tags ?? []).join('\0');
  const sync = update.data?.sync;

  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4">
      <div>
        <label className="label">Title</label>
        <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea className="field min-h-24" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label className="label">Tags</label>
        <TagInput tags={tags} suggestions={genres} onChange={setTags} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!title.trim() || update.isPending}
          onClick={() => update.mutate({ title: title.trim(), description, tags })}
          className="bg-ink px-4 py-2 text-sm font-medium lowercase text-paper hover:opacity-90 disabled:opacity-40"
        >
          {update.isPending ? 'syncing…' : dirty ? 'save & sync' : 're-sync'}
        </button>
        {update.isError && <span className="text-xs text-danger">save failed — try again</span>}
        {sync && (
          <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {Object.entries(sync).map(([target, result]) => (
              <span
                key={target}
                className={result === 'ok' ? 'text-ok' : 'text-danger'}
                title={result === 'ok' ? undefined : result}
              >
                {result === 'ok' ? '✓' : '✕'} {PLATFORM_LABELS[target] ?? target}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

// coverUrl comes from the PocketBase record (the master), not the stored
// upload.image_url snapshot — so the thumbnail is always the current agenda image.
function ArchiveCard({ upload, coverUrl }: { upload: UploadWithJobs; coverUrl: string | null }) {
  const [editing, setEditing] = useState(false);
  const publish = usePublishRecord();
  const pub = publishedJobs(upload);

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
            <div className="flex shrink-0 items-baseline gap-3">
              <a
                href={`${AGENDA_BASE}/#/archive/${upload.show_id}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[13px] lowercase text-muted underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink"
              >
                ↗ agenda
              </a>
              <p className="font-mono text-[13px] text-muted">{new Date(upload.created_at).toLocaleString()}</p>
            </div>
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
                onClick={() => setEditing((v) => !v)}
                className="text-xs lowercase text-faint underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink"
              >
                {editing ? 'close' : 'edit'}
              </button>
            </span>
          </div>
        </div>
      </div>

      {editing && <EditPanel upload={upload} />}
    </div>
  );
}

export default function Archive() {
  const { data: uploads = [], isPending } = useUploads();
  const { data: shows = [] } = useShows();
  // Cover per show from the PocketBase record (master), keyed by show_id.
  const coverByShow = new Map(shows.map((s) => [s.id, s.imageUrl]));
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
              <ArchiveCard key={u.id} upload={u} coverUrl={coverByShow.get(u.show_id) ?? null} />
            ))}
          </div>
          <Pager page={paged.page} pageCount={paged.pageCount} total={paged.total} setPage={paged.setPage} unit="shows" />
        </>
      )}
    </div>
  );
}
