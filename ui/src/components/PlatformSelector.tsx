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
    onChange(
      platforms.includes(id)
        ? platforms.filter((p) => p !== id)
        : [...platforms, id]
    );
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm text-gray-400">Platforms</label>
      <div className="flex gap-3">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => toggle(p.id)}
            className={`px-4 py-2 rounded text-sm border transition-colors ${
              platforms.includes(p.id)
                ? 'bg-white text-black border-white'
                : 'bg-transparent text-gray-400 border-gray-700 hover:border-gray-500'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {platforms.includes('mixcloud') && (
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeJingle}
            onChange={(e) => onJingleChange(e.target.checked)}
            className="rounded border-gray-600 bg-gray-800"
          />
          Prepend jingle to MixCloud audio
        </label>
      )}
    </div>
  );
}
