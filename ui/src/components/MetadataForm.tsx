import { useRef } from 'react';
import { useGenres, useUploadCover, useClearCover } from '../api/hooks';
import TagInput from './TagInput';

type Props = {
  showId: string;
  title: string;
  description: string;
  tags: string[];
  imageUrl: string;
  generating: boolean;
  suggestedTags: string[];
  onChange: (field: string, value: string | string[]) => void;
};

export default function MetadataForm({ showId, title, description, tags, imageUrl, generating, suggestedTags, onChange }: Props) {
  const { data: genres = [] } = useGenres();
  const unusedSuggestions = suggestedTags.filter((t) => !tags.includes(t));

  // Cover → PocketBase (the master), not S3. Upload writes the file into the
  // archive record's image field; the returned URL becomes the form's cover.
  const fileRef = useRef<HTMLInputElement | null>(null);
  const uploadCover = useUploadCover(showId);
  const clearCover = useClearCover(showId);
  const busy = uploadCover.isPending || clearCover.isPending;

  const pickCover = (file: File | undefined) => {
    if (!file) return;
    uploadCover.mutate(file, { onSuccess: ({ imageUrl: url }) => onChange('imageUrl', url ?? '') });
  };
  const removeCover = () => clearCover.mutate(undefined, { onSuccess: () => onChange('imageUrl', '') });

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
          Cover image <span className="lowercase tracking-normal text-faint">· optional</span>
        </label>
        <div className="flex items-center gap-3">
          {imageUrl && (
            <img
              src={imageUrl}
              alt="cover"
              className="h-16 w-16 shrink-0 border border-line object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              pickCover(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="border border-line px-3 py-1.5 text-sm lowercase text-muted hover:border-ink hover:text-ink disabled:opacity-50"
          >
            {uploadCover.isPending ? 'uploading…' : imageUrl ? 'replace cover' : 'upload cover'}
          </button>
          {imageUrl && !busy && (
            <button
              type="button"
              onClick={removeCover}
              className="text-xs lowercase text-faint hover:text-danger"
            >
              remove
            </button>
          )}
        </div>
        {uploadCover.isError && <p className="mt-1 text-[11px] text-danger">cover upload failed — try again.</p>}
        <p className="mt-1 text-[11px] lowercase text-faint">
          saved to the agenda record in pocketbase (the master). default: empty — mixcloud then uses a square
          frame from ~20s into the video, and youtube keeps its own auto-chosen frame.
        </p>
      </div>
    </div>
  );
}
