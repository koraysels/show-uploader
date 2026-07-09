import { useMemo, useState } from 'react';
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
  col.accessor('title', { header: 'Title', cell: (c) => c.getValue() }),
  col.accessor((u) => u.jobs.length, { id: 'platforms', header: 'Jobs', cell: (c) => c.getValue() }),
  col.accessor('created_at', {
    header: 'Archived',
    cell: (c) => new Date(c.getValue()).toLocaleString(),
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
          className="text-white underline hover:no-underline"
        >
          Download ↓
        </a>
      ) : (
        <span className="text-gray-600">—</span>
      ),
  }),
];

export default function Archive() {
  const { data: uploads = [], isPending } = useUploads();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }]);

  const archived = useMemo(() => uploads.filter((u) => u.archive_s3_key), [uploads]);

  const table = useReactTable({
    data: archived,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (isPending) return <p className="text-gray-400 text-sm">Loading...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Archive</h1>
      {archived.length === 0 ? (
        <p className="text-gray-500 text-sm">No archived files yet.</p>
      ) : (
        <div className="overflow-x-auto border border-gray-800 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-gray-800 text-left">
                  {hg.headers.map((h) => (
                    <th key={h.id} className="px-4 py-3 font-medium text-gray-400">
                      {h.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-white"
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <span className="text-gray-600">
                            {{ asc: '↑', desc: '↓' }[h.column.getIsSorted() as string] ?? ''}
                          </span>
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-900 last:border-0 hover:bg-gray-900/50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-gray-200">
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
