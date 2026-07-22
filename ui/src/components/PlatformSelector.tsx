import { useRef, useState } from 'react';
import { api } from '../api/client';
import { usePlatformUpdate, usePlatformSetPublic, usePlatformRemove, useYoutubeStatus } from '../api/hooks';

// Play button to preview the configured jingle (lazy-fetches a presigned URL).
function JinglePreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a || err) return;
    if (playing) {
      a.pause();
      return;
    }
    if (!a.src) {
      setLoading(true);
      try {
        const { url } = await api.getJinglePreview();
        a.src = url;
      } catch {
        setErr(true);
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    await a.play().catch(() => setErr(true));
  };

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={err}
        title={err ? 'no jingle configured' : 'preview jingle'}
        className="inline-flex h-5 w-5 items-center justify-center border border-line text-[11px] leading-none text-muted hover:border-ink hover:text-ink disabled:opacity-40"
      >
        {err ? '—' : loading ? '…' : playing ? '⏸' : '▶'}
      </button>
      <audio
        ref={audioRef}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </>
  );
}

export type PlatformLink = { label: string; url: string };
export type PlatformMeta = { title: string; description: string; tags: string[]; imageUrl: string | null };

type Props = {
  platforms: string[];
  includeJingle: boolean;
  showId: string;
  // Links already published on the archive record (from PocketBase mediaLinks).
  existingLinks: PlatformLink[];
  // The current form metadata, pushed to a platform by its "update" button.
  meta: PlatformMeta;
  onChange: (platforms: string[]) => void;
  onJingleChange: (v: boolean) => void;
};

const PLATFORMS = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'mixcloud', label: 'MixCloud' },
];

// A platform that's already published on this record: link + manage (update
// metadata / set public / remove the link). Replaces the re-publish toggle so
// we never create a duplicate video/cloudcast.
function PublishedPlatform({
  id,
  label,
  url,
  showId,
  meta,
}: {
  id: string;
  label: string;
  url: string;
  showId: string;
  meta: PlatformMeta;
}) {
  const update = usePlatformUpdate();
  const setPublic = usePlatformSetPublic();
  const remove = usePlatformRemove();
  const ytStatus = useYoutubeStatus(url, id === 'youtube');
  const [confirming, setConfirming] = useState(false);

  const privacy = ytStatus.data?.privacyStatus ?? null; // public | unlisted | private | null
  const isPublic = privacy === 'public';
  const btn = 'border border-line px-2.5 py-1 text-xs lowercase text-muted hover:border-ink hover:text-ink disabled:opacity-50';

  return (
    <div className="rounded-lg border border-accent/40 bg-accent-soft/30 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-ink hover:underline">
          {label} ↗
        </a>
        <span className="text-[10px] lowercase text-ok">
          ✓ published{id === 'youtube' && privacy ? ` · ${privacy}` : ''}
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={update.isPending}
          onClick={() => update.mutate({ platform: id as 'youtube' | 'mixcloud', url, ...meta })}
          className={btn}
          title={
            id === 'mixcloud'
              ? 'push the current title / description / tags + cover to MixCloud'
              : 'push the current title / description / tags to this platform'
          }
        >
          {update.isPending ? 'updating…' : 'update'}
        </button>
        {id === 'youtube' &&
          (isPublic ? (
            <span className="text-xs lowercase text-ok">✓ public</span>
          ) : (
            <button
              type="button"
              disabled={setPublic.isPending}
              onClick={() => setPublic.mutate(url, { onSuccess: () => ytStatus.refetch() })}
              className={btn}
              title="make the video public on YouTube (needs the re-authorised token)"
            >
              {setPublic.isPending ? 'setting…' : 'set public'}
            </button>
          ))}
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className={`${btn} hover:!border-danger hover:!text-danger`}>
            remove
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs lowercase text-muted">
            un-link?
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ showId, label })}
              className="text-danger hover:underline disabled:opacity-50"
            >
              yes
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="hover:text-ink">
              no
            </button>
          </span>
        )}
      </div>
      {update.data?.error && <p className="mt-2 text-[11px] text-danger">update: {update.data.error}</p>}
      {update.data && !update.data.error && <p className="mt-2 text-[11px] text-ok">✓ metadata updated</p>}
      {setPublic.data?.error && <p className="mt-2 text-[11px] text-danger">set public: {setPublic.data.error}</p>}
      {setPublic.data && !setPublic.data.error && <p className="mt-2 text-[11px] text-ok">✓ now public</p>}
      {remove.isError && <p className="mt-2 text-[11px] text-danger">remove failed — try again.</p>}
    </div>
  );
}

export default function PlatformSelector({
  platforms,
  includeJingle,
  showId,
  existingLinks,
  meta,
  onChange,
  onJingleChange,
}: Props) {
  const linkFor = (label: string) => existingLinks.find((l) => l.label === label);
  const toggle = (id: string) => {
    onChange(platforms.includes(id) ? platforms.filter((p) => p !== id) : [...platforms, id]);
  };

  // Platforms with no existing link yet → re-publishable via the toggle.
  const selectable = PLATFORMS.filter((p) => !linkFor(p.label));

  return (
    <div className="space-y-4">
      {existingLinks.length > 0 && (
        <div className="space-y-2">
          {PLATFORMS.map((p) => {
            const link = linkFor(p.label);
            if (!link) return null;
            return <PublishedPlatform key={p.id} id={p.id} label={p.label} url={link.url} showId={showId} meta={meta} />;
          })}
        </div>
      )}

      {selectable.length > 0 && (
        <div className="flex gap-2.5">
          {selectable.map((p) => {
            const on = platforms.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                aria-pressed={on}
                className={`inline-flex items-center gap-2.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  on
                    ? 'border-accent bg-accent text-white'
                    : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink'
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-4 w-4 items-center justify-center rounded-[3px] border text-[11px] font-bold leading-none ${
                    on ? 'border-white bg-white text-accent' : 'border-line-strong text-transparent'
                  }`}
                >
                  ✓
                </span>
                {p.label}
              </button>
            );
          })}
        </div>
      )}

      {platforms.includes('mixcloud') && (
        <div className="flex items-center gap-2.5">
          <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-muted">
            <input
              type="checkbox"
              checked={includeJingle}
              onChange={(e) => onJingleChange(e.target.checked)}
              className="h-4 w-4 rounded border-line-strong text-accent focus:ring-accent"
            />
            Prepend jingle to the MixCloud audio
          </label>
          <JinglePreview />
        </div>
      )}
    </div>
  );
}
