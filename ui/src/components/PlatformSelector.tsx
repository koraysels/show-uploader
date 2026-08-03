import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { trpcClient } from '../api/trpc';
import { usePlatformUpdate, usePlatformSetPublic, usePlatformRemove, useYoutubeStatus } from '../api/hooks';
import ConfirmAction from './ConfirmAction';
import { c } from '../theme';

// Play button to preview the configured jingle (lazy-fetches a presigned URL).
function JinglePreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a || err) return;
    if (playing) {
      a.pause();
      return;
    }
    if (!a.src) {
      setLoading(true);
      try {
        const { url } = await trpcClient.uploads.getJinglePreview.query();
        a.src = url;
      } catch {
        setErr(true);
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    await a.play().catch(() => setErr(true));
  };

  return (
    <>
      <Tooltip title={err ? 'no jingle configured' : 'preview jingle'}>
        {/* span wrapper: a disabled button fires no events, so the tooltip would
            never show on exactly the state that needs explaining. */}
        <Box component="span">
          <Button
            onClick={toggle}
            disabled={err}
            aria-label={err ? 'no jingle configured' : 'preview jingle'}
            sx={{ minWidth: 36, height: 36, px: 0, fontSize: '0.6875rem', lineHeight: 1 }}
          >
            {err ? '—' : loading ? '…' : playing ? '⏸' : '▶'}
          </Button>
        </Box>
      </Tooltip>
      <audio
        ref={audioRef}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </>
  );
}

export type PlatformLink = { label: string; url: string };
export type PlatformMeta = { title: string; description: string; tags: string[]; imageUrl: string | null };

type Props = {
  platforms: string[];
  includeJingle: boolean;
  showId: string;
  // Links already published on the archive record (from PocketBase mediaLinks).
  existingLinks: PlatformLink[];
  // The current form metadata, pushed to a platform by its "update" button.
  meta: PlatformMeta;
  onChange: (platforms: string[]) => void;
  onJingleChange: (v: boolean) => void;
};

const PLATFORMS = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'mixcloud', label: 'MixCloud' },
];

// A platform that's already published on this record: link + manage (update
// metadata / set public / remove the link). Replaces the re-publish toggle so
// we never create a duplicate video/cloudcast.
function PublishedPlatform({
  id,
  label,
  url,
  showId,
  meta,
}: {
  id: string;
  label: string;
  url: string;
  showId: string;
  meta: PlatformMeta;
}) {
  const update = usePlatformUpdate();
  const setPublic = usePlatformSetPublic();
  const remove = usePlatformRemove();
  const ytStatus = useYoutubeStatus(url, id === 'youtube');

  const privacy = ytStatus.data?.privacyStatus ?? null; // public | unlisted | private | null
  const isPublic = privacy === 'public';

  return (
    <Paper variant="outlined" sx={{ p: 1.75, backgroundColor: c.accentSoft, borderColor: c.line }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href={url} target="_blank" rel="noreferrer" sx={{ fontWeight: 500 }}>
          {label} ↗
        </Link>
        <Typography variant="caption" color="success.main" sx={{ flexShrink: 0 }}>
          ✓ published{id === 'youtube' && privacy ? ` · ${privacy}` : ''}
        </Typography>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 1.25, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <Tooltip
          title={
            id === 'mixcloud'
              ? 'push the current title / description / tags + cover to MixCloud'
              : 'push the current title / description / tags to this platform'
          }
        >
          <Button
            disabled={update.isPending}
            onClick={() => update.mutate({ platform: id as 'youtube' | 'mixcloud', url, ...meta })}
            sx={{ px: 1.25, py: 0.5, fontSize: '0.75rem', minHeight: 32 }}
          >
            {update.isPending ? 'updating…' : 'update'}
          </Button>
        </Tooltip>

        {id === 'youtube' &&
          (isPublic ? (
            <Typography variant="caption" color="success.main">
              ✓ public
            </Typography>
          ) : (
            <Tooltip title="make the video public on YouTube (needs the re-authorised token)">
              <Button
                disabled={setPublic.isPending}
                onClick={() => setPublic.mutate(url, { onSuccess: () => ytStatus.refetch() })}
                sx={{ px: 1.25, py: 0.5, fontSize: '0.75rem', minHeight: 32 }}
              >
                {setPublic.isPending ? 'setting…' : 'set public'}
              </Button>
            </Tooltip>
          ))}

        <ConfirmAction
          label="remove"
          question="un-link?"
          pending={remove.isPending}
          pendingLabel="removing…"
          title={`remove the ${label} link from this record — the ${label} upload itself stays`}
          onConfirm={() => remove.mutate({ showId, label })}
        />
      </Stack>

      {update.data?.error && (
        <Typography variant="caption" color="error.main" sx={{ mt: 1, display: 'block' }}>
          update: {update.data.error}
        </Typography>
      )}
      {update.data && !update.data.error && (
        <Typography variant="caption" color="success.main" sx={{ mt: 1, display: 'block' }}>
          ✓ metadata updated
        </Typography>
      )}
      {setPublic.data?.error && (
        <Typography variant="caption" color="error.main" sx={{ mt: 1, display: 'block' }}>
          set public: {setPublic.data.error}
        </Typography>
      )}
      {setPublic.data && !setPublic.data.error && (
        <Typography variant="caption" color="success.main" sx={{ mt: 1, display: 'block' }}>
          ✓ now public
        </Typography>
      )}
      {remove.isError && (
        <Typography variant="caption" color="error.main" sx={{ mt: 1, display: 'block' }}>
          remove failed — try again.
        </Typography>
      )}
    </Paper>
  );
}

export default function PlatformSelector({
  platforms,
  includeJingle,
  showId,
  existingLinks,
  meta,
  onChange,
  onJingleChange,
}: Props) {
  const linkFor = (label: string) => existingLinks.find((l) => l.label === label);
  const toggle = (id: string) => {
    onChange(platforms.includes(id) ? platforms.filter((p) => p !== id) : [...platforms, id]);
  };

  // Platforms with no existing link yet → re-publishable via the toggle.
  const selectable = PLATFORMS.filter((p) => !linkFor(p.label));

  return (
    <Stack spacing={2}>
      {existingLinks.length > 0 && (
        <Stack spacing={1}>
          {PLATFORMS.map((p) => {
            const link = linkFor(p.label);
            if (!link) return null;
            return <PublishedPlatform key={p.id} id={p.id} label={p.label} url={link.url} showId={showId} meta={meta} />;
          })}
        </Stack>
      )}

      {selectable.length > 0 && (
        // Wraps on narrow screens rather than shrinking the targets below 44px.
        <Stack direction="row" spacing={1.25} sx={{ flexWrap: 'wrap', rowGap: 1.25 }}>
          {selectable.map((p) => {
            const on = platforms.includes(p.id);
            return (
              <Button
                key={p.id}
                variant={on ? 'contained' : 'outlined'}
                onClick={() => toggle(p.id)}
                aria-pressed={on}
                sx={{ gap: 1.25, px: 2, minHeight: 44, borderColor: on ? c.ink : c.line, color: on ? c.paper : c.muted }}
              >
                <Box
                  aria-hidden
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 16,
                    height: 16,
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    lineHeight: 1,
                    border: `1px solid ${on ? c.paper : c.line}`,
                    backgroundColor: on ? c.paper : 'transparent',
                    color: on ? c.ink : 'transparent',
                  }}
                >
                  ✓
                </Box>
                {p.label}
              </Button>
            );
          })}
        </Stack>
      )}

      {platforms.includes('mixcloud') && (
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          <FormControlLabel
            control={<Checkbox checked={includeJingle} onChange={(e) => onJingleChange(e.target.checked)} />}
            label="prepend jingle to the mixcloud audio"
            sx={{ ml: 0, mr: 0 }}
          />
          <JinglePreview />
        </Stack>
      )}
    </Stack>
  );
}
