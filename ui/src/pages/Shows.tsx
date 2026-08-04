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
import { useShows, useStagedShowIds, useUploads, useUploadingProgress } from '../api/hooks';
import type { AgendaShow, ClaimView } from '../api/client';
import { usePresence } from '../presence/PresenceProvider';
import { useUpload, type UploadItem } from '../upload/UploadProvider';
import { shortName } from '../components/PresenceRoster';
import PlatformIcon from '../components/PlatformIcon';
import { c, ROLE, LABEL_SX } from '../theme';

const col = createColumnHelper<AgendaShow>();

const SHORT: Record<string, string> = { YouTube: 'YT', MixCloud: 'MC' };
const LABEL_TO_PLATFORM: Record<string, string> = { YouTube: 'youtube', MixCloud: 'mixcloud' };

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
  // show_id → server-computed % (null when it couldn't be read); presence in the
  // map means an upload is in progress on some machine.
  uploadingElsewhere: Map<string, number | null>;
}) {
  const item = uploads[showId];

  if (item?.status === 'uploading') {
    const pct = Math.round(item.fraction * 100);
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <LinearProgress variant="determinate" value={pct} sx={{ width: 64, height: 6, flexShrink: 0 }} />
        <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {pct}%
        </Typography>
      </Stack>
    );
  }
  if (item?.status === 'error') {
    return (
      <Tooltip title={item.error ?? 'upload failed'}>
        <Chip label="✕ failed" sx={{ borderColor: c.danger, color: c.danger, bgcolor: c.dangerSoft }} />
      </Tooltip>
    );
  }
  if (item?.status === 'done' || staged.has(showId)) {
    return (
      <Tooltip title="recording ready to publish">
        <Chip
          label="● ready"
          sx={{ borderColor: c.ok, color: c.ok, bgcolor: c.okSoft, fontWeight: 600 }}
        />
      </Tooltip>
    );
  }
  if (uploaded.has(showId)) {
    return (
      <Tooltip title="already uploaded — the archived video is available on the archive page">
        <Chip label="● uploaded" sx={{ color: c.muted }} />
      </Tooltip>
    );
  }
  // A browser elsewhere is mid-upload — show the server-computed %.
  if (uploadingElsewhere.has(showId)) {
    const pct = uploadingElsewhere.get(showId);
    return (
      <Tooltip title="a recording is being uploaded on another machine">
        <Chip
          label={`● uploading elsewhere${typeof pct === 'number' ? ` · ${pct}%` : ''}`}
          sx={{ borderColor: c.ink, color: c.ink }}
        />
      </Tooltip>
    );
  }
  return (
    <Typography variant="body2" color="text.disabled">
      — no video
    </Typography>
  );
}

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
  const { data: shows = [], isLoading, isError } = useShows();
  const { claims, myUserId } = usePresence();
  const { uploads } = useUpload();
  const { data: stagedIds = [] } = useStagedShowIds();
  const staged = useMemo(() => new Set(stagedIds), [stagedIds]);
  // Shows that already have a completed upload (published → staged row cleared, but
  // the recording was uploaded + archived). Keeps the Video column honest.
  const { data: uploadList = [] } = useUploads();
  const uploaded = useMemo(() => new Set(uploadList.map((u) => u.show_id)), [uploadList]);
  // In-progress multipart uploads on any machine (show_id → %) → "uploading
  // elsewhere · N%" here.
  const { data: uploadingList = [] } = useUploadingProgress();
  const uploadingElsewhere = useMemo(
    () => new Map(uploadingList.map((u) => [u.show_id, u.pct])),
    [uploadingList]
  );
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
        cell: (c) => <Typography sx={{ fontWeight: 500 }}>{c.getValue()}</Typography>,
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
          header: 'video',
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
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block' }}>
                    {s.date} · {s.startTime}
                    {s.tags?.length ? ` · ${s.tags.length} tags` : ''}
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ mt: 1.25, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
                  >
                    <VideoCell
                      showId={s.id}
                      uploads={uploads}
                      staged={staged}
                      uploaded={uploaded}
                      uploadingElsewhere={uploadingElsewhere}
                    />
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
