import { useRef, useState } from 'react';

type Props = {
  tags: string[];
  // Full vocabulary to autocomplete against (PocketBase genres).
  suggestions: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
};

// Chip editor with autocomplete: type to filter the genre vocabulary, Enter/comma
// or click a suggestion to add, × or Backspace to remove. New (unknown) tags are
// allowed too — they become new genres server-side.
export default function TagInput({ tags, suggestions, onChange, placeholder }: Props) {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const picking = useRef(false);

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/,+$/, '').trim();
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...tags, t]);
    setInput('');
  };
  const removeTag = (t: string) => onChange(tags.filter((x) => x !== t));

  const q = input.trim().toLowerCase();
  const matches = q
    ? suggestions
        .filter((s) => s.toLowerCase().includes(q) && !tags.some((t) => t.toLowerCase() === s.toLowerCase()))
        .slice(0, 8)
    : [];

  return (
    <div className="relative">
      <div className="field flex flex-wrap items-center gap-1.5 py-1.5">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 border border-line bg-paper px-2 py-0.5 text-xs text-ink">
            {t}
            <button type="button" onClick={() => removeTag(t)} aria-label={`remove ${t}`} className="text-faint hover:text-danger">
              ×
            </button>
          </span>
        ))}
        <input
          className="min-w-[120px] flex-1 bg-transparent text-sm text-ink placeholder-faint outline-none"
          placeholder={placeholder ?? (tags.length ? 'add another…' : 'type a tag, press enter')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              addTag(matches.length === 1 ? matches[0] : input);
            } else if (e.key === 'Backspace' && !input && tags.length) {
              removeTag(tags[tags.length - 1]);
            } else if (e.key === 'Escape') {
              setFocused(false);
            }
          }}
          onBlur={() => {
            setTimeout(() => setFocused(false), 120);
            // Skip the auto-commit if a suggestion was just clicked (it already added).
            if (picking.current) {
              picking.current = false;
              return;
            }
            if (input.trim()) addTag(input);
          }}
        />
      </div>
      {focused && matches.length > 0 && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto border border-ink bg-surface shadow-sm">
          {matches.map((m) => (
            <button
              key={m}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                picking.current = true;
                addTag(m);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-accent-soft"
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
