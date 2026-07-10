import { useMemo, useState } from 'react';
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
import type { AgendaShow, ClaimView } from '../api/client';
import { usePresence } from '../presence/PresenceProvider';
import { shortName } from '../components/PresenceRoster';

const col = createColumnHelper<AgendaShow>();

const SHORT: Record<string, string> = { YouTube: 'YT', MixCloud: 'MC' };

function LinksCell({ show }: { show: AgendaShow }) {
  const links = show.mediaLinks ?? [];
  if (!links.length) return <span className="text-faint">—</span>;
  return (
    <div className="flex gap-1">
      {links.map((l) => (
        <a
          key={l.label + l.url}
          href={l.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={l.url}
          className="border border-line px-1.5 py-0.5 text-[11px] font-medium lowercase text-muted hover:border-ink hover:text-ink"
        >
          {SHORT[l.label] ?? l.label}
        </a>
      ))}
    </div>
  );
}

function ClaimBadge({ claim, mine }: { claim: ClaimView | undefined; mine: boolean }) {
  if (!claim) return <span className="text-faint">—</span>;
  if (mine) return <span className="lowercase text-ok">you</span>;
  return (
    <span className="inline-flex items-center gap-1 lowercase text-muted" title={`claimed by ${claim.userName}`}>
      <span aria-hidden>⚠</span> {shortName(claim.userName)}
    </span>
  );
}

export default function Shows() {
  const navigate = useNavigate();
  const { data: shows = [], isLoading, isError } = useShows();
  const { claims, myUserId } = usePresence();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const [filter, setFilter] = useState('');

  const columns = useMemo(
    () => [
      col.accessor('date', { header: 'Date', cell: (c) => <span className="font-mono text-[13px] text-muted">{c.getValue()}</span> }),
      col.accessor('startTime', { header: 'Time', cell: (c) => <span className="font-mono text-[13px] text-muted">{c.getValue()}</span> }),
      col.accessor('title', {
        header: 'Show',
        cell: (c) => <span className="font-medium text-ink">{c.getValue()}</span>,
      }),
      col.accessor((s) => s.mediaLinks?.length ?? 0, {
        id: 'links',
        header: 'Links',
        cell: (c) => <LinksCell show={c.row.original} />,
      }),
      col.accessor((s) => s.tags?.length ?? 0, {
        id: 'tags',
        header: 'Tags',
        cell: (c) => <span className="text-muted tabular-nums">{c.getValue() || '—'}</span>,
      }),
      col.accessor((s) => (claims[s.id] ? (claims[s.id].userSub === myUserId ? 0 : 1) : 2), {
        id: 'status',
        header: 'Who',
        cell: (c) => {
          const claim = claims[c.row.original.id];
          return <ClaimBadge claim={claim} mine={!!claim && claim.userSub === myUserId} />;
        },
      }),
    ],
    [claims, myUserId]
  );

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
        <div className="overflow-x-auto border border-ink bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-ink text-left">
                  {hg.headers.map((h) => (
                    <th key={h.id} className="px-4 py-3 font-medium sm:px-5">
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
                    <td key={cell.id} className="whitespace-nowrap px-4 py-3.5 sm:px-5">
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
