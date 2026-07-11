type Props = {
  autoTrimSilence: boolean;
  trimStart: string;
  trimEnd: string;
  onAutoTrimChange: (v: boolean) => void;
  onChange: (field: 'trimStart' | 'trimEnd', value: string) => void;
};

function isValidTime(v: string) {
  return v === '' || /^(\d{1,2}:)?\d{2}:\d{2}$/.test(v);
}

export default function TrimFields({ autoTrimSilence, trimStart, trimEnd, onAutoTrimChange, onChange }: Props) {
  const hasManual = !!trimStart || !!trimEnd;
  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-muted">
        <input
          type="checkbox"
          checked={autoTrimSilence}
          onChange={(e) => onAutoTrimChange(e.target.checked)}
          className="h-4 w-4 rounded border-line-strong text-accent focus:ring-accent"
        />
        Automatically trim silence at the start &amp; end
        <span className="text-xs text-faint">— cuts dead air / intro for you</span>
      </label>

      <details open={hasManual} className="text-sm">
        <summary className="cursor-pointer select-none text-xs lowercase text-faint hover:text-ink">
          manual trim (optional) — set exact in/out points
        </summary>
        <div className="mt-3">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="label">Start · blank = beginning</label>
              <input
                className={`field font-mono ${!isValidTime(trimStart) ? 'field-invalid' : ''}`}
                placeholder="hh:mm:ss"
                value={trimStart}
                onChange={(e) => onChange('trimStart', e.target.value)}
              />
            </div>
            <span className="pb-2.5 text-faint">→</span>
            <div className="flex-1">
              <label className="label">End · blank = end</label>
              <input
                className={`field font-mono ${!isValidTime(trimEnd) ? 'field-invalid' : ''}`}
                placeholder="hh:mm:ss"
                value={trimEnd}
                onChange={(e) => onChange('trimEnd', e.target.value)}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-faint">
            Format HH:MM:SS (e.g. 00:04:30). Overrides auto-trim. Applied to MixCloud and the archive.
          </p>
        </div>
      </details>
    </div>
  );
}
