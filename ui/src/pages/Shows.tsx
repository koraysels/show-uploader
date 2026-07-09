import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useShows } from '../api/hooks';
import type { AgendaShow } from '../api/client';

const col = createColumnHelper<AgendaShow>();

const columns = [
  col.accessor('date', { header: 'Date', cell: (c) => <span className="font-mono text-[13px] text-muted">{c.getValue()}</span> }),
  col.accessor('startTime', { header: 'Time', cell: (c) => <span className="font-mono text-[13px] text-muted">{c.getValue()}</span> }),
  col.accessor('title', {
    header: 'Show',
    cell: (c) => <span className="font-medium text-ink">{c.getValue()}</span>,
  }),
  col.accessor((s) => s.tags?.length ?? 0, {
    id: 'tags',
    header: 'Tags',
    cell: (c) => <span className="text-muted tabular-nums">{c.getValue() || '—'}</span>,
  }),
];

export default function Shows() {
  const navigate = useNavigate();
  const { data: shows = [], isLoading, isError } = useShows();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const [filter, setFilter] = useState('');

  const table = useReactTable({
    data: shows,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold lowercase tracking-tight text-ink">to process</h1>
          <p className="mt-1 text-sm text-muted">draft archive records. pick one to publish its recording.</p>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter shows…"
          className="field w-full sm:w-64"
        />
      </header>

      {isLoading ? (
        <p className="text-sm text-muted">Loading shows…</p>
      ) : isError ? (
        <p className="text-sm text-danger">Couldn't load shows. Check the schedule connection.</p>
      ) : (
        <div className="overflow-hidden border border-ink bg-surface">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-ink text-left">
                  {hg.headers.map((h) => (
                    <th key={h.id} className="px-5 py-3 font-medium">
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-faint hover:text-ink"
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <span className="text-accent">
                          {{ asc: '↑', desc: '↓' }[h.column.getIsSorted() as string] ?? ''}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => navigate({ to: '/upload/$showId', params: { showId: row.original.id } })}
                  className="group cursor-pointer border-b border-line last:border-0 transition-colors hover:bg-accent-soft"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="whitespace-nowrap px-5 py-3.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-5 py-10 text-center text-sm text-muted">
                    No shows match “{filter}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {!isLoading && !isError && (
        <p className="text-xs text-faint">
          {rows.length} of {shows.length} shows
        </p>
      )}
    </div>
  );
}
