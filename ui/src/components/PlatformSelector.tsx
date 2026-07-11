import { useRef, useState } from 'react';
import { api } from '../api/client';

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

type Props = {
  platforms: string[];
  includeJingle: boolean;
  includeArchive: boolean;
  existingPlatforms: string[];
  onChange: (platforms: string[]) => void;
  onJingleChange: (v: boolean) => void;
  onArchiveChange: (v: boolean) => void;
};

const PLATFORMS = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'mixcloud', label: 'MixCloud' },
];

export default function PlatformSelector({
  platforms,
  includeJingle,
  includeArchive,
  existingPlatforms,
  onChange,
  onJingleChange,
  onArchiveChange,
}: Props) {
  const toggle = (id: string) => {
    onChange(platforms.includes(id) ? platforms.filter((p) => p !== id) : [...platforms, id]);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2.5">
        {PLATFORMS.map((p) => {
          const on = platforms.includes(p.id);
          const already = existingPlatforms.includes(p.id);
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
              {already && (
                <span className={`text-[10px] lowercase ${on ? 'text-white/70' : 'text-faint'}`}>· already up</span>
              )}
            </button>
          );
        })}
      </div>
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
      <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-muted">
        <input
          type="checkbox"
          checked={includeArchive}
          onChange={(e) => onArchiveChange(e.target.checked)}
          className="h-4 w-4 rounded border-line-strong text-accent focus:ring-accent"
        />
        Archive an MP4 copy to storage
        <span className="text-xs text-faint">— off when the show is already archived</span>
      </label>
    </div>
  );
}
