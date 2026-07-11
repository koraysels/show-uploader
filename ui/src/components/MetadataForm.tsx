import { useState } from 'react';

type Props = {
  title: string;
  description: string;
  tags: string[];
  imageUrl: string;
  generating: boolean;
  suggestedTags: string[];
  onChange: (field: string, value: string | string[]) => void;
};

export default function MetadataForm({ title, description, tags, imageUrl, generating, suggestedTags, onChange }: Props) {
  const [tagInput, setTagInput] = useState('');
  const unusedSuggestions = suggestedTags.filter((t) => !tags.includes(t));

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/,+$/, '').trim();
    if (t && !tags.includes(t)) onChange('tags', [...tags, t]);
    setTagInput('');
  };
  const removeTag = (t: string) => onChange('tags', tags.filter((x) => x !== t));

  return (
    <div className="space-y-5">
      <div>
        <label className="label">Title</label>
        <input className="field" value={title} onChange={(e) => onChange('title', e.target.value)} />
      </div>
      <div>
        <label className="label">
          Description
          {generating && <span className="ml-2 lowercase tracking-normal text-accent">· writing…</span>}
        </label>
        <textarea
          className="field min-h-[96px] resize-y leading-relaxed"
          value={description}
          onChange={(e) => onChange('description', e.target.value)}
        />
      </div>
      <div>
        <label className="label">Tags</label>
        {/* Chip editor: seeded from the show's genres, and you can add your own —
            type + Enter/comma to add, × or Backspace to remove. */}
        <div className="field flex flex-wrap items-center gap-1.5 py-1.5">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 border border-line bg-paper px-2 py-0.5 text-xs text-ink">
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                aria-label={`remove ${t}`}
                className="text-faint hover:text-danger"
              >
                ×
              </button>
            </span>
          ))}
          <input
            className="min-w-[120px] flex-1 bg-transparent text-sm text-ink placeholder-faint outline-none"
            placeholder={tags.length ? 'add another…' : 'type a tag, press enter'}
            value={tagInput}
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
        {(generating || unusedSuggestions.length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] lowercase text-faint">
              {generating ? 'suggesting…' : 'suggested (ai, pre-audio):'}
            </span>
            {unusedSuggestions.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange('tags', [...tags, t])}
                className="border border-line px-2 py-0.5 text-xs text-muted hover:border-ink hover:text-ink"
              >
                + {t}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="label">
          Cover image URL <span className="lowercase tracking-normal text-faint">optional</span>
        </label>
        <input
          className="field"
          placeholder="https://…"
          value={imageUrl}
          onChange={(e) => onChange('imageUrl', e.target.value)}
        />
      </div>
    </div>
  );
}
