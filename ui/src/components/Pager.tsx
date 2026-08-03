import { useState } from 'react';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

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
  // Bigger tap targets than the old text links — these sit at the bottom of a
  // long list, which is exactly where a thumb lands.
  const nav = {
    fontSize: '0.75rem',
    color: 'text.disabled',
    px: 1,
    py: 0.5,
    minHeight: 32,
    '&:hover': { color: 'text.primary' },
  };
  return (
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
      <Typography variant="caption" color="text.disabled">
        {total} {unit}
      </Typography>
      {pageCount > 1 && (
        <Stack direction="row" spacing={{ xs: 1, sm: 2 }} sx={{ alignItems: 'center' }}>
          <Button variant="text" onClick={() => setPage(page - 1)} disabled={page === 0} sx={nav}>
            ← prev
          </Button>
          <Typography variant="caption" color="text.disabled" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {page + 1} / {pageCount}
          </Typography>
          <Button variant="text" onClick={() => setPage(page + 1)} disabled={page >= pageCount - 1} sx={nav}>
            next →
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
