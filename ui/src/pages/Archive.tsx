import { useState } from 'react';
import { useUploads, useUpdateMetadata } from '../api/hooks';
import type { UploadWithJobs } from '../api/client';

const PLATFORM_LABELS: Record<string, string> = { youtube: 'YouTube', mixcloud: 'MixCloud' };

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

// Edit title/description/tags and push the change to every platform + PocketBase.
function EditPanel({ upload }: { upload: UploadWithJobs }) {
  const update = useUpdateMetadata(upload.id);
  const [title, setTitle] = useState(upload.title);
  const [description, setDescription] = useState(upload.description ?? '');
  const [tags, setTags] = useState<string[]>(upload.tags ?? []);
  const [tagInput, setTagInput] = useState('');

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/,+$/, '');
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };
  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

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
        <div className="flex flex-wrap items-center gap-1.5 border border-line bg-paper px-2 py-2">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 border border-line bg-surface px-2 py-0.5 text-xs text-ink">
              {t}
              <button type="button" onClick={() => removeTag(t)} aria-label={`remove ${t}`} className="text-faint hover:text-danger">
                ×
              </button>
            </span>
          ))}
          <input
            className="min-w-24 flex-1 bg-transparent text-sm outline-none"
            value={tagInput}
            placeholder={tags.length ? 'add another…' : 'type a tag, press enter'}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(tagInput);
              } else if (e.key === 'Backspace' && !tagInput && tags.length) {
                removeTag(tags[tags.length - 1]);
              }
            }}
            onBlur={() => tagInput.trim() && addTag(tagInput)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!dirty || !title.trim() || update.isPending}
          onClick={() => update.mutate({ title: title.trim(), description, tags })}
          className="bg-ink px-4 py-2 text-sm font-medium lowercase text-paper hover:opacity-90 disabled:opacity-40"
        >
          {update.isPending ? 'syncing…' : 'save & sync'}
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

function ArchiveCard({ upload }: { upload: UploadWithJobs }) {
  const [editing, setEditing] = useState(false);
  const pub = publishedJobs(upload);

  return (
    <div className="border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-medium text-ink">{upload.title}</p>
        <p className="shrink-0 font-mono text-[13px] text-muted">{new Date(upload.created_at).toLocaleString()}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {pub.map((j) => (
          <a key={j.platform} href={j.result_url!} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
            {PLATFORM_LABELS[j.platform]} ↗
          </a>
        ))}
        <span className="text-line" aria-hidden>|</span>
        <DownloadLink url={upload.video_url} label="Video" />
        <DownloadLink url={upload.audio_url} label="Audio" />
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="ml-auto text-xs lowercase text-faint underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink"
        >
          {editing ? 'close' : 'edit'}
        </button>
      </div>

      {editing && <EditPanel upload={upload} />}
    </div>
  );
}

export default function Archive() {
  const { data: uploads = [], isPending } = useUploads();

  if (isPending) return <p className="text-sm text-muted">Loading…</p>;

  const archived = uploads
    .filter((u) => publishedJobs(u).length > 0)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold lowercase tracking-tight text-ink">archive</h1>
      {archived.length === 0 ? (
        <p className="text-sm text-muted">no published shows yet.</p>
      ) : (
        <div className="space-y-3">
          {archived.map((u) => (
            <ArchiveCard key={u.id} upload={u} />
          ))}
        </div>
      )}
    </div>
  );
}
