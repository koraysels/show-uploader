type Props = {
  title: string;
  description: string;
  tags: string[];
  imageUrl: string;
  generating: boolean;
  onChange: (field: string, value: string | string[]) => void;
};

export default function MetadataForm({ title, description, tags, imageUrl, generating, onChange }: Props) {
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
        <input
          className="field"
          placeholder="comma, separated"
          value={tags.join(', ')}
          onChange={(e) =>
            onChange(
              'tags',
              e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
            )
          }
        />
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
