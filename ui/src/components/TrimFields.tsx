type Props = {
  trimStart: string;
  trimEnd: string;
  onChange: (field: 'trimStart' | 'trimEnd', value: string) => void;
};

function isValidTime(v: string) {
  return v === '' || /^(\d{1,2}:)?\d{2}:\d{2}$/.test(v);
}

export default function TrimFields({ trimStart, trimEnd, onChange }: Props) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-2">Trim (optional)</label>
      <div className="flex gap-3 items-center">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Start</label>
          <input
            className={`w-full bg-gray-900 border rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-gray-500 ${
              !isValidTime(trimStart) ? 'border-red-500' : 'border-gray-700'
            }`}
            placeholder="00:04:30"
            value={trimStart}
            onChange={(e) => onChange('trimStart', e.target.value)}
          />
        </div>
        <span className="text-gray-600 mt-4">→</span>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">End</label>
          <input
            className={`w-full bg-gray-900 border rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-gray-500 ${
              !isValidTime(trimEnd) ? 'border-red-500' : 'border-gray-700'
            }`}
            placeholder="01:58:00"
            value={trimEnd}
            onChange={(e) => onChange('trimEnd', e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-gray-600 mt-1">Format: HH:MM:SS — applied to all outputs (YouTube, MixCloud, archive)</p>
    </div>
  );
}
