import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Combobox,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
  ComboboxButton,
} from '@headlessui/react';
import { useShows } from '../api/hooks';
import type { AgendaShow } from '../api/client';

type Props = {
  selectedId: string | undefined;
};

export default function ShowPicker({ selectedId }: Props) {
  const navigate = useNavigate();
  const { data: shows = [], isLoading, isError } = useShows();
  const [query, setQuery] = useState('');

  const selected = shows.find((s) => s.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shows;
    return shows.filter((s) =>
      `${s.title} ${s.date} ${s.startTime}`.toLowerCase().includes(q)
    );
  }, [shows, query]);

  const label = (s: AgendaShow | null) => (s ? `${s.date} ${s.startTime} — ${s.title}` : '');

  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">Select show</label>
      <Combobox
        value={selected}
        onChange={(s: AgendaShow | null) => {
          if (s) void navigate({ to: '/upload/$showId', params: { showId: s.id } });
        }}
        disabled={isLoading || isError}
      >
        <div className="relative">
          <ComboboxInput
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 pr-10 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:opacity-50"
            placeholder={isLoading ? 'Loading shows…' : isError ? 'Failed to load shows' : 'Search a show…'}
            displayValue={(s: AgendaShow | null) => label(s)}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </ComboboxButton>

          <ComboboxOptions
            className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-gray-700 bg-gray-900 py-1 text-sm shadow-xl focus:outline-none"
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-gray-500">No shows match “{query}”.</div>
            ) : (
              filtered.map((s) => (
                <ComboboxOption
                  key={s.id}
                  value={s}
                  className="group flex cursor-pointer items-baseline gap-3 px-3 py-2 text-gray-300 data-[focus]:bg-gray-800 data-[focus]:text-white data-[selected]:text-white"
                >
                  <span className="shrink-0 font-mono text-xs text-gray-500 group-data-[focus]:text-gray-400">
                    {s.date} {s.startTime}
                  </span>
                  <span className="truncate">{s.title}</span>
                </ComboboxOption>
              ))
            )}
          </ComboboxOptions>
        </div>
      </Combobox>
    </div>
  );
}
