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
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import MuiLink from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useShows, useListPublishedShows } from '../api/hooks';
import ShowStatusView, { useShowStatuses, showStatusRank } from '../components/ShowStatus';
import type { AgendaShow, ClaimView } from '../api/client';
import { usePresence } from '../presence/PresenceProvider';
import { shortName } from '../components/PresenceRoster';
import PlatformIcon from '../components/PlatformIcon';
import { c, c as c2, ROLE, LABEL_SX } from '../theme';

const col = createColumnHelper<AgendaShow>();

const SHORT: Record<string, string> = { YouTube: 'YT', MixCloud: 'MC' };
const LABEL_TO_PLATFORM: Record<string, string> = { YouTube: 'youtube', MixCloud: 'mixcloud' };

function LinksCell({ show }: { show: AgendaShow }) {
  const links = show.mediaLinks ?? [];
  if (!links.length)
    return (
      <Typography component="span" color="text.disabled">
        —
      </Typography>
    );
  return (
    // 12px, not 4: "YT ↗" and "MC ↗" ran together into one word at the
    // tighter gap, since the arrow eats the visual space between them.
    <Stack direction="row" spacing={1.5}>
      {links.map((l) => (
        <Tooltip key={l.label + l.url} title={l.url}>
          {/* A link, not a button — it opens the platform. Boxing these made
              every row look like it had two pending actions in it. */}
          <MuiLink
            href={l.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            color={ROLE.navigate}
            variant="body2"
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minHeight: 32, fontWeight: 500 }}
          >
            <PlatformIcon platform={LABEL_TO_PLATFORM[l.label] ?? ''} />
            {SHORT[l.label] ?? l.label} ↗
          </MuiLink>
        </Tooltip>
      ))}
    </Stack>
  );
}

function ClaimBadge({ claim, mine }: { claim: ClaimView | undefined; mine: boolean }) {
  if (!claim)
    return (
      <Typography component="span" color="text.disabled">
        —
      </Typography>
    );
  if (mine)
    return (
      <Typography component="span" color="success.main">
        you
      </Typography>
    );
  return (
    <Tooltip title={`claimed by ${claim.userName}`}>
      <Typography component="span" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        <span aria-hidden>⚠</span> {shortName(claim.userName)}
      </Typography>
    </Tooltip>
  );
}

export default function Shows() {
  const navigate = useNavigate();
  const { data: drafts = [], isLoading, isError } = useShows();
  // Published shows with no archived recording yet join the same list: the
  // work to do on them is the same (upload a recording), it just publishes to
  // nothing — the platforms it's already on stay untouched and the result is
  // archive links on the record. The badge is what tells them apart.
  const { data: published = [] } = useListPublishedShows();
  const attachable = useMemo(
    () => published.filter((s) => !s.mediaLinks.some((l) => l.label.startsWith('cs-archive'))),
    [published]
  );
  const attachableIds = useMemo(() => new Set(attachable.map((s) => s.id)), [attachable]);
  const shows = useMemo(() => {
    // A record flips draft→published between the two queries' refetches, so
    // both can briefly hold it — the draft entry wins, one row per record.
    const draftIds = new Set(drafts.map((s) => s.id));
    return [...drafts, ...attachable.filter((s) => !draftIds.has(s.id))];
  }, [drafts, attachable]);
  const { claims, myUserId } = usePresence();
  // One place decides what a show's recording is doing; this screen and the
  // attach list render the same component over it.
  const statusFor = useShowStatuses();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const [filter, setFilter] = useState('');

  const columns = useMemo(
    () => [
      col.accessor('date', {
        header: 'date',
        cell: (c) => (
          <Typography variant="body2" color="text.secondary">
            {c.getValue()}
          </Typography>
        ),
      }),
      col.accessor('startTime', {
        header: 'time',
        cell: (c) => (
          <Typography variant="body2" color="text.secondary">
            {c.getValue()}
          </Typography>
        ),
      }),
      col.accessor('title', {
        header: 'show',
        cell: (c) => (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography sx={{ fontWeight: 500 }}>{c.getValue()}</Typography>
            {attachableIds.has(c.row.original.id) && (
              <Tooltip title="already live on its platforms — uploading a recording here only archives it (mp4 + audio on s3, links on the agenda record); the existing platform links stay untouched">
                <Chip label="published · archive only" sx={{ color: c2.muted, borderColor: c2.line }} />
              </Tooltip>
            )}
          </Stack>
        ),
      }),
      col.accessor((s) => showStatusRank(statusFor(s.id)), {
        id: 'video',
        header: 'video',
        cell: (c) => <ShowStatusView status={statusFor(c.row.original.id)} />,
      }),
      col.accessor((s) => s.mediaLinks?.length ?? 0, {
        id: 'links',
        header: 'links',
        cell: (c) => <LinksCell show={c.row.original} />,
      }),
      col.accessor((s) => s.tags?.length ?? 0, {
        id: 'tags',
        header: 'tags',
        cell: (c) => (
          <Typography component="span" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {c.getValue() || '—'}
          </Typography>
        ),
      }),
      col.accessor((s) => (claims[s.id] ? (claims[s.id].userSub === myUserId ? 0 : 1) : 2), {
        id: 'status',
        header: 'who',
        cell: (c) => {
          const claim = claims[c.row.original.id];
          return <ClaimBadge claim={claim} mine={!!claim && claim.userSub === myUserId} />;
        },
      }),
    ],
    [claims, myUserId, statusFor, attachableIds]
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
  const sortId = sorting[0]?.id ?? 'date';
  const sortDesc = sorting[0]?.desc ?? true;

  return (
    <Stack spacing={3}>
      <Stack
        component="header"
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ alignItems: { sm: 'flex-end' }, justifyContent: 'space-between' }}
      >
        <Box>
          <Typography variant="h1">to process</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            draft archive records. pick one to publish its recording.
          </Typography>
        </Box>
        <TextField
          size="small"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter shows…"
          sx={{ width: { xs: '100%', sm: 256 } }}
        />
      </Stack>

      {isLoading ? (
        <Typography color="text.secondary">loading shows…</Typography>
      ) : isError ? (
        <Typography color="error.main">couldn't load shows. check the schedule connection.</Typography>
      ) : (
        <>
          {/* Phones get cards. The table needed 640px of width, so on a phone it
              was a horizontal-scroll puzzle — the thing that made this page
              unusable on mobile. Both views read the same sorted/filtered rows. */}
          <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }}>
            <TextField
              select
              size="small"
              label="sort by"
              value={`${sortId}:${sortDesc ? 'desc' : 'asc'}`}
              onChange={(e) => {
                const [id, dir] = e.target.value.split(':');
                setSorting([{ id, desc: dir === 'desc' }]);
              }}
              slotProps={{ inputLabel: { shrink: true } }}
            >
              <MenuItem value="date:desc">date · newest</MenuItem>
              <MenuItem value="date:asc">date · oldest</MenuItem>
              <MenuItem value="title:asc">show · a–z</MenuItem>
              <MenuItem value="video:desc">video · ready first</MenuItem>
              <MenuItem value="status:asc">who · claimed first</MenuItem>
            </TextField>

            {rows.map((row) => {
              const s = row.original;
              const claim = claims[s.id];
              return (
                <ButtonBase
                  key={row.id}
                  onClick={() => navigate({ to: '/upload/$showId', params: { showId: s.id } })}
                  sx={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    border: `1px solid ${c.line}`,
                    backgroundColor: c.surface,
                    p: 2,
                    '&:hover': { borderColor: c.ink },
                  }}
                >
                  <Typography sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{s.title}</Typography>
                  {attachableIds.has(s.id) && (
                    <Chip label="published · archive only" sx={{ mt: 0.5, color: c.muted, borderColor: c.line }} />
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block' }}>
                    {s.date} · {s.startTime}
                    {s.tags?.length ? ` · ${s.tags.length} tags` : ''}
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ mt: 1.25, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
                  >
                    <ShowStatusView status={statusFor(s.id)} />
                    <Box sx={{ flex: 1 }} />
                    {claim && <ClaimBadge claim={claim} mine={claim.userSub === myUserId} />}
                  </Stack>
                  {!!s.mediaLinks?.length && (
                    <Box sx={{ mt: 1.25 }}>
                      <LinksCell show={s} />
                    </Box>
                  )}
                </ButtonBase>
              );
            })}
            {rows.length === 0 && (
              <Typography color="text.secondary" sx={{ py: 5, textAlign: 'center' }}>
                no shows match “{filter}”.
              </Typography>
            )}
          </Stack>

          <Paper
            variant="outlined"
            sx={{ display: { xs: 'none', md: 'block' }, borderColor: c.ink, overflowX: 'auto' }}
          >
            <Table size="small" sx={{ minWidth: 640, tableLayout: 'auto' }}>
              <TableHead>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} sx={{ '& th': { borderBottom: `1px solid ${c.ink}` } }}>
                    {hg.headers.map((h) => (
                      <TableCell key={h.id} sx={{ px: { xs: 2, sm: 2.5 }, py: 1.5 }}>
                        <Button
                          variant="text"
                          onClick={h.column.getToggleSortingHandler()}
                          sx={{
                            ...LABEL_SX,
                            gap: 0.5,
                            minHeight: 32,
                            '&:hover': { color: c.ink, textDecoration: 'none' },
                          }}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <Box component="span" sx={{ color: c.ink }}>
                            {{ asc: '↑', desc: '↓' }[h.column.getIsSorted() as string] ?? ''}
                          </Box>
                        </Button>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    hover
                    onClick={() => navigate({ to: '/upload/$showId', params: { showId: row.original.id } })}
                    sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                  >
                    {row.getVisibleCells().map((cell) => {
                      // Only the show title may wrap. Everything else is short
                      // and reads better on one line — but leaving the title
                      // nowrap too let one long name push `tags` and `who` off
                      // the right edge into a scroll nobody looks for.
                      const isTitle = cell.column.id === 'title';
                      return (
                        <TableCell
                          key={cell.id}
                          sx={{
                            px: { xs: 2, sm: 2.5 },
                            py: 1.75,
                            whiteSpace: isTitle ? 'normal' : 'nowrap',
                            ...(isTitle ? { minWidth: 200, maxWidth: 380 } : null),
                          }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={columns.length} sx={{ px: 2.5, py: 5, textAlign: 'center' }}>
                      <Typography color="text.secondary">no shows match “{filter}”.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}

      {!isLoading && !isError && (
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="caption" color="text.disabled">
            {table.getFilteredRowModel().rows.length} of {shows.length} shows
          </Typography>
          {pageCount > 1 && (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Button
                variant="text"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                sx={{ fontSize: '0.6875rem', color: c.faint, minHeight: 36 }}
              >
                ← prev
              </Button>
              <Typography variant="caption" color="text.disabled" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {pageIndex + 1} / {pageCount}
              </Typography>
              <Button
                variant="text"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                sx={{ fontSize: '0.6875rem', color: c.faint, minHeight: 36 }}
              >
                next →
              </Button>
            </Stack>
          )}
        </Stack>
      )}
    </Stack>
  );
}
