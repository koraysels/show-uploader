import { useState } from 'react';

// Client-side search + pagination over a card list — shared by the archive and
// jobs-queue pages so both behave identically.
export function usePaged<T>(items: T[], searchText: (t: T) => string, pageSize = 20) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((t) => searchText(t).toLowerCase().includes(q)) : items;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clamped = Math.min(page, pageCount - 1);
  const slice = filtered.slice(clamped * pageSize, clamped * pageSize + pageSize);
  return {
    query,
    setQuery: (v: string) => {
      setQuery(v);
      setPage(0);
    },
    slice,
    page: clamped,
    pageCount,
    total: filtered.length,
    setPage,
  };
}

export function Pager({
  page,
  pageCount,
  total,
  setPage,
  unit,
}: {
  page: number;
  pageCount: number;
  total: number;
  setPage: (p: number) => void;
  unit: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs text-faint">
      <span>
        {total} {unit}
      </span>
      {pageCount > 1 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPage(page - 1)}
            disabled={page === 0}
            className="lowercase hover:text-ink disabled:opacity-40"
          >
            ← prev
          </button>
          <span className="tabular-nums">
            {page + 1} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage(page + 1)}
            disabled={page >= pageCount - 1}
            className="lowercase hover:text-ink disabled:opacity-40"
          >
            next →
          </button>
        </div>
      )}
    </div>
  );
}
