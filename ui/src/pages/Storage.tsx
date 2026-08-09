import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import { useStorageOverview, useMigrationPlan, useRunMigration } from '../api/hooks';
import { humanSize, humanAge } from '../format';
import { c } from '../theme';
import { PageLoading } from '../components/Skeleton';
import ConfirmAction from '../components/ConfirmAction';

// Past this much of a disk consumed, the number stops being informational.
const WARN_AT = 0.8;
const DANGER_AT = 0.92;

// Scratch this old means a job died without cleaning up and the startup sweeper
// has not run since — the condition that used to fill the disk unnoticed.
const STALE_TEMP_MS = 6 * 60 * 60 * 1000;

export default function Storage() {
  const q = useStorageOverview();

  if (q.isPending) return <PageLoading label="reading disks…" />;
  if (q.isError) {
    return (
      <Typography variant="body2" sx={{ color: c.danger }}>
        could not read storage: {q.error.message}
      </Typography>
    );
  }

  const { disk, root, temp, bucket } = q.data;

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h1">storage</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          recordings are multi-gigabyte, so this is the page that tells you whether the next
          publish has room to run.
        </Typography>
      </Box>

      <Section title="disks">
        <Stack spacing={2}>
          <DiskBar label="object store" hint="where minio keeps recordings and archives" usage={disk} />
          <DiskBar label="system" hint="the container's own filesystem, including scratch" usage={root} />
        </Stack>
      </Section>

      <Section title="scratch space">
        <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap', rowGap: 1.5 }}>
          <Stat label="in use" value={humanSize(temp.bytes)} />
          <Stat label="job folders" value={String(temp.jobs)} />
          <Stat
            label="oldest"
            value={temp.oldestAgeMs === null ? '—' : humanAge(temp.oldestAgeMs)}
            danger={temp.oldestAgeMs !== null && temp.oldestAgeMs > STALE_TEMP_MS}
          />
        </Stack>
        {temp.oldestAgeMs !== null && temp.oldestAgeMs > STALE_TEMP_MS && (
          <Typography variant="caption" sx={{ color: c.danger, mt: 1.5, display: 'block' }}>
            a job folder has been sitting for {humanAge(temp.oldestAgeMs)} — a job was killed before it
            could clean up. restarting the worker sweeps anything older than 6h.
          </Typography>
        )}
        {temp.jobs === 0 && (
          <Typography variant="caption" color="text.disabled" sx={{ mt: 1.5, display: 'block' }}>
            nothing in flight, nothing left behind.
          </Typography>
        )}
      </Section>

      <LayoutMigration />

      <Section title={`bucket${bucket.name ? ` · ${bucket.name}` : ''}`}>
        <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap', rowGap: 1.5, mb: 2 }}>
          <Stat label="total" value={humanSize(bucket.bytes)} />
          <Stat label="objects" value={bucket.objects.toLocaleString()} />
        </Stack>

        {bucket.prefixes.length === 0 ? (
          <Typography variant="caption" color="text.disabled">
            bucket is empty.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {bucket.prefixes.map((p) => (
              <PrefixRow key={p.prefix} {...p} total={bucket.bytes} />
            ))}
          </Stack>
        )}

        {bucket.truncated && (
          <Typography variant="caption" sx={{ color: c.danger, mt: 1.5, display: 'block' }}>
            stopped counting at the scan limit — the totals above are a floor, not the whole bucket.
          </Typography>
        )}
      </Section>
    </Stack>
  );
}

/**
 * Move existing objects into the incoming/ + shows/ layout.
 *
 * Always shows the exact list before doing anything: this rewrites live object
 * keys, and seeing the plan is the difference between a reversible decision and
 * an irreversible one.
 */
function LayoutMigration() {
  const plan = useMigrationPlan();
  const run = useRunMigration();

  if (plan.isPending || plan.isError) return null;

  const moves = plan.data.moves;

  return (
    <Section title="layout">
      {moves.length === 0 ? (
        <Typography variant="caption" color="text.disabled">
          everything is already filed under incoming/ and shows/. nothing to move.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          <Typography variant="body2">
            {moves.length} object{moves.length === 1 ? '' : 's'} still in the old flat layout, where
            unpublished drops and finished masters share one prefix.
          </Typography>

          <Box sx={{ maxHeight: 220, overflowY: 'auto', border: `1px solid ${c.line}`, p: 1.5 }}>
            <Stack spacing={0.75}>
              {moves.map((m) => (
                <Box key={m.from} sx={{ fontFamily: 'monospace', fontSize: '0.6875rem' }}>
                  <Box sx={{ color: c.faint }}>{m.from}</Box>
                  <Box sx={{ color: c.ink }}>→ {m.to}</Box>
                </Box>
              ))}
            </Stack>
          </Box>

          {run.isSuccess && (
            <Typography variant="caption" sx={{ color: run.data.failed.length ? c.danger : c.ok }}>
              moved {run.data.moved} of {run.data.attempted}
              {run.data.failed.length ? ` · ${run.data.failed.length} failed, see the api log` : ''}
            </Typography>
          )}
          {run.isError && (
            <Typography variant="caption" sx={{ color: c.danger }}>
              {run.error.message}
            </Typography>
          )}

          <Box>
            <ConfirmAction
              label="reorganize"
              question="move these objects?"
              onConfirm={() => run.mutate()}
              pending={run.isPending}
              pendingLabel="moving…"
              title="copies each object to its new key, verifies it landed, updates the database, then deletes the original"
            />
          </Box>
        </Stack>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography
        variant="body2"
        sx={{ color: c.muted, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1.5 }}
      >
        {title}
      </Typography>
      <Box sx={{ border: `1px solid ${c.border}`, backgroundColor: c.surface, p: 2.5 }}>{children}</Box>
    </Box>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <Box sx={{ minWidth: 96 }}>
      <Typography variant="caption" sx={{ color: c.faint, display: 'block' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '1.25rem', color: danger ? c.danger : c.ink, lineHeight: 1.2 }}>
        {value}
      </Typography>
    </Box>
  );
}

function DiskBar({
  label,
  hint,
  usage,
}: {
  label: string;
  hint: string;
  usage: { totalBytes: number; freeBytes: number; usedBytes: number; path: string } | null;
}) {
  // Null is expected, not broken: the disk is bind-mounted into the api purely
  // for this readout, so say so rather than showing a misleading zero.
  if (!usage) {
    return (
      <Box>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="caption" color="text.disabled">
          not mounted in the api — nothing to report
        </Typography>
      </Box>
    );
  }

  const fraction = usage.totalBytes ? usage.usedBytes / usage.totalBytes : 0;
  const colour = fraction >= DANGER_AT ? c.danger : fraction >= WARN_AT ? '#a15c00' : c.ok;

  return (
    <Box>
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', rowGap: 0.25 }}
      >
        <Tooltip title={usage.path}>
          <Typography variant="body2">{label}</Typography>
        </Tooltip>
        <Typography variant="caption" sx={{ color: fraction >= WARN_AT ? colour : c.faint }}>
          {humanSize(usage.freeBytes)} free of {humanSize(usage.totalBytes)} · {Math.round(fraction * 100)}% used
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, fraction * 100)}
        sx={{
          mt: 0.75,
          height: 6,
          backgroundColor: c.accentSoft,
          '& .MuiLinearProgress-bar': { backgroundColor: colour },
        }}
      />
      <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
        {hint}
      </Typography>
    </Box>
  );
}

function PrefixRow({
  prefix,
  bytes,
  objects,
  total,
}: {
  prefix: string;
  bytes: number;
  objects: number;
  total: number;
}) {
  const share = total ? bytes / total : 0;
  return (
    <Box>
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', rowGap: 0.25 }}
      >
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
          {prefix}/
        </Typography>
        <Typography variant="caption" sx={{ color: c.faint }}>
          {humanSize(bytes)} · {objects.toLocaleString()} object{objects === 1 ? '' : 's'}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={share * 100}
        sx={{
          mt: 0.5,
          height: 4,
          backgroundColor: c.accentSoft,
          '& .MuiLinearProgress-bar': { backgroundColor: c.muted },
        }}
      />
    </Box>
  );
}
