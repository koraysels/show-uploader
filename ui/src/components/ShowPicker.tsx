import { useEffect, useState } from 'react';
import { api, type AgendaShow } from '../api/client';

type Props = {
  onSelect: (show: AgendaShow) => void;
};

export default function ShowPicker({ onSelect }: Props) {
  const [shows, setShows] = useState<AgendaShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .listShows()
      .then(setShows)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">Select show</label>
      <select
        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:opacity-50"
        disabled={loading || error}
        defaultValue=""
        onChange={(e) => {
          const show = shows.find((s) => s.id === e.target.value);
          if (show) onSelect(show);
        }}
      >
        <option value="" disabled>
          {loading ? 'Loading shows...' : error ? 'Failed to load shows' : 'Pick a show'}
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
