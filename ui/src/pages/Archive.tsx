import { useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useUploads } from '../api/hooks';
import type { UploadWithJobs } from '../api/client';

const col = createColumnHelper<UploadWithJobs>();

const columns = [
  col.accessor('title', { header: 'Title', cell: (c) => <span className="font-medium text-ink">{c.getValue()}</span> }),
  col.accessor((u) => u.jobs.length, { id: 'jobs', header: 'Jobs', cell: (c) => <span className="tabular-nums text-muted">{c.getValue()}</span> }),
  col.accessor('created_at', {
    header: 'Archived',
    cell: (c) => <span className="font-mono text-[13px] text-muted">{new Date(c.getValue()).toLocaleString()}</span>,
    sortingFn: 'datetime',
  }),
  col.display({
    id: 'download',
    header: 'File',
    cell: (c) =>
      c.row.original.archive_url ? (
        <a
          href={c.row.original.archive_url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-accent hover:underline"
        >
          Download ↓
        </a>
      ) : (
        <span className="text-faint">—</span>
      ),
  }),
];

export default function Archive() {
  const { data: uploads = [], isPending } = useUploads();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }]);

  const archived = uploads.filter((u) => u.archive_s3_key);

  const table = useReactTable({
    data: archived,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (isPending) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Archive</h1>
      {archived.length === 0 ? (
        <p className="text-sm text-muted">No archived files yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-line text-left">
                  {hg.headers.map((h) => (
                    <th key={h.id} className="px-5 py-3">
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-faint hover:text-ink"
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <span className="text-accent">{{ asc: '↑', desc: '↓' }[h.column.getIsSorted() as string] ?? ''}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-line/70 last:border-0 hover:bg-paper/60">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="whitespace-nowrap px-5 py-3.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
