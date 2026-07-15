import { useGenres } from '../api/hooks';
import TagInput from './TagInput';

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
  const { data: genres = [] } = useGenres();
  const unusedSuggestions = suggestedTags.filter((t) => !tags.includes(t));

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
        {/* Chip editor with autocomplete from the PocketBase genre list (the
            master tag vocabulary); new tags are allowed and become new genres. */}
        <TagInput tags={tags} suggestions={genres} onChange={(next) => onChange('tags', next)} />
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
