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
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="label">Start</label>
          <input
            className={`field font-mono ${!isValidTime(trimStart) ? 'field-invalid' : ''}`}
            placeholder="00:04:30"
            value={trimStart}
            onChange={(e) => onChange('trimStart', e.target.value)}
          />
        </div>
        <span className="pb-2.5 text-faint">→</span>
        <div className="flex-1">
          <label className="label">End</label>
          <input
            className={`field font-mono ${!isValidTime(trimEnd) ? 'field-invalid' : ''}`}
            placeholder="01:58:00"
            value={trimEnd}
            onChange={(e) => onChange('trimEnd', e.target.value)}
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-faint">HH:MM:SS · applied to YouTube, MixCloud and the archive.</p>
    </div>
  );
}
