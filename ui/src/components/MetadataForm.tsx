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
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1">Title</label>
        <input
          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gray-500"
          value={title}
          onChange={(e) => onChange('title', e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">
          Description
          {generating && <span className="ml-2 text-xs text-gray-500">generating...</span>}
        </label>
        <textarea
          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gray-500 min-h-[80px] resize-y"
          value={description}
          onChange={(e) => onChange('description', e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Tags (comma-separated)</label>
        <input
          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gray-500"
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
        <label className="block text-sm text-gray-400 mb-1">Cover image URL (optional)</label>
        <input
          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gray-500"
          placeholder="https://..."
          value={imageUrl}
          onChange={(e) => onChange('imageUrl', e.target.value)}
        />
      </div>
    </div>
  );
}
