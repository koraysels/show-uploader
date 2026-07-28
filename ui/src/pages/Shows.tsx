import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useShows, useStagedShowIds, useUploads, useUploadingShowIds } from '../api/hooks';
import type { AgendaShow, ClaimView } from '../api/client';
import { usePresence } from '../presence/PresenceProvider';
import { useUpload, type UploadItem } from '../upload/UploadProvider';
import { shortName } from '../components/PresenceRoster';

const col = createColumnHelper<AgendaShow>();

const SHORT: Record<string, string> = { YouTube: 'YT', MixCloud: 'MC' };

// Per-show video state in the table: live upload progress, "ready" when a
// recording is staged (uploaded, not yet published), "uploaded" when it's already
// been published (the staged row is cleared on publish, but the archived video
// still exists), else nothing.
function VideoCell({
  showId,
  uploads,
  staged,
  uploaded,
  uploadingElsewhere,
}: {
  showId: string;
  uploads: Record<string, UploadItem>;
  staged: Set<string>;
  uploaded: Set<string>;
  uploadingElsewhere: Set<string>;
}) {
  const item = uploads[showId];
  if (item?.status === 'uploading') {
    const pct = Math.round(item.fraction * 100);
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent-soft/50 px-2.5 py-1 text-accent">
        <span className="h-2 w-16 overflow-hidden rounded-full bg-line">
          <span className="block h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </span>
        <span className="text-sm font-semibold tabular-nums">{pct}%</span>
      </span>
    );
  }
  if (item?.status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger-soft px-2.5 py-1 text-sm font-medium lowercase text-danger" title={item.error ?? undefined}>
        ✕ failed
      </span>
    );
  }
  if (item?.status === 'done' || staged.has(showId)) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-ok/40 bg-ok-soft px-3 py-1 text-sm font-semibold lowercase text-ok" title="recording ready to publish">
        <span className="h-2 w-2 rounded-full bg-ok" aria-hidden />
        ready
      </span>
    );
  }
  if (uploaded.has(showId)) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-sm lowercase text-muted"
        title="already uploaded — the archived video is available on the archive page"
      >
        <span className="h-2 w-2 rounded-full bg-muted" aria-hidden />
        uploaded
      </span>
    );
  }
  // A browser elsewhere is mid-upload — its live % is local to that machine, so
  // here we can only show that it's happening.
  if (uploadingElsewhere.has(showId)) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent-soft/40 px-3 py-1 text-sm lowercase text-accent"
        title="a recording is being uploaded on another machine"
      >
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
        uploading elsewhere
      </span>
    );
  }
  return <span className="text-sm text-faint">— no video</span>;
}

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
          className="border border-line px-2 py-0.5 text-xs font-medium lowercase text-muted hover:border-ink hover:text-ink"
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
  const { uploads } = useUpload();
  const { data: stagedIds = [] } = useStagedShowIds();
  const staged = useMemo(() => new Set(stagedIds), [stagedIds]);
  // Shows that already have a completed upload (published → staged row cleared, but
  // the recording was uploaded + archived). Keeps the Video column honest.
  const { data: uploadList = [] } = useUploads();
  const uploaded = useMemo(() => new Set(uploadList.map((u) => u.show_id)), [uploadList]);
  // In-progress multipart uploads on any machine → "uploading elsewhere" here.
  const { data: uploadingIds = [] } = useUploadingShowIds();
  const uploadingElsewhere = useMemo(() => new Set(uploadingIds), [uploadingIds]);
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
      col.accessor(
        (s) =>
          uploads[s.id]?.status === 'uploading'
            ? 4
            : uploads[s.id]?.status === 'done' || staged.has(s.id)
            ? 3
            : uploaded.has(s.id)
            ? 2
            : uploadingElsewhere.has(s.id)
            ? 1
            : 0,
        {
          id: 'video',
          header: 'Video',
          cell: (c) => (
            <VideoCell
              showId={c.row.original.id}
              uploads={uploads}
              staged={staged}
              uploaded={uploaded}
              uploadingElsewhere={uploadingElsewhere}
            />
          ),
        }
      ),
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
    [claims, myUserId, uploads, staged, uploaded, uploadingElsewhere]
  );

  const table = useReactTable({
    data: shows,
    columns,
    state: { sorting, globalFilter: filter },
    initialState: { pagination: { pageSize: 25 } },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const rows = table.getRowModel().rows;
  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();

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
        <div className="flex items-center justify-between text-xs text-faint">
          <span>
            {table.getFilteredRowModel().rows.length} of {shows.length} shows
          </span>
          {pageCount > 1 && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="lowercase hover:text-ink disabled:opacity-40"
              >
                ← prev
              </button>
              <span className="tabular-nums">
                {pageIndex + 1} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="lowercase hover:text-ink disabled:opacity-40"
              >
                next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
