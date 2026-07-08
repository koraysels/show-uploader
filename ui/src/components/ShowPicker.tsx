import { useNavigate } from '@tanstack/react-router';
import { useShows } from '../api/hooks';

type Props = {
  selectedId: string | undefined;
};

export default function ShowPicker({ selectedId }: Props) {
  const navigate = useNavigate();
  const { data: shows = [], isLoading, isError } = useShows();

  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">Select show</label>
      <select
        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:opacity-50"
        disabled={isLoading || isError}
        value={selectedId ?? ''}
        onChange={(e) => {
          const id = e.target.value;
          if (id) void navigate({ to: '/upload/$showId', params: { showId: id } });
        }}
      >
        <option value="" disabled>
          {isLoading ? 'Loading shows...' : isError ? 'Failed to load shows' : 'Pick a show'}
        </option>
        {shows.map((s) => (
          <option key={s.id} value={s.id}>
            {s.date} {s.startTime} — {s.title}
          </option>
        ))}
      </select>
    </div>
  );
}
