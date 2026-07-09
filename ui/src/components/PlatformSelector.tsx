type Props = {
  platforms: string[];
  includeJingle: boolean;
  onChange: (platforms: string[]) => void;
  onJingleChange: (v: boolean) => void;
};

const PLATFORMS = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'mixcloud', label: 'MixCloud' },
];

export default function PlatformSelector({ platforms, includeJingle, onChange, onJingleChange }: Props) {
  const toggle = (id: string) => {
    onChange(platforms.includes(id) ? platforms.filter((p) => p !== id) : [...platforms, id]);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2.5">
        {PLATFORMS.map((p) => {
          const on = platforms.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              aria-pressed={on}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                on
                  ? 'border-accent bg-accent text-white'
                  : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {platforms.includes('mixcloud') && (
        <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-muted">
          <input
            type="checkbox"
            checked={includeJingle}
            onChange={(e) => onJingleChange(e.target.checked)}
            className="h-4 w-4 rounded border-line-strong text-accent focus:ring-accent"
          />
          Prepend jingle to the MixCloud audio
        </label>
      )}
    </div>
  );
}
