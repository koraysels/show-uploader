import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from '@tanstack/react-router';
import { useShows, useGeneratedMeta, usePendingVideos, useClaimPending, useCreateUpload } from '../api/hooks';
import MetadataForm from '../components/MetadataForm';
import { FullPageDropzone, UploadControl } from '../components/Dropzone';
import PlatformSelector from '../components/PlatformSelector';
import TrimFields from '../components/TrimFields';
import { useUpload } from '../upload/UploadProvider';
import { usePresence } from '../presence/PresenceProvider';
import { shortName } from '../components/PresenceRoster';

// The agenda site hosts the archive record's admin detail page at
// `<base>/#/archive/<recordId>`, and the record id is the same id we use as showId.
const AGENDA_BASE = import.meta.env.VITE_POCKETBASE_URL ?? 'https://agenda.coming-soon.space';

const ALL_PLATFORMS = ['youtube', 'mixcloud'];
const LABEL_TO_PLATFORM: Record<string, string> = { YouTube: 'youtube', MixCloud: 'mixcloud' };

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

// Published title convention: "<name> <DD.MM.YYYY> @ coming soon".
function publishTitle(name: string, date: string): string {
  const [y, m, d] = (date ?? '').split('-');
  const dmy = d && m && y ? `${d}.${m}.${y}` : date;
  return `${name} ${dmy} @ coming soon`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-6">
      <h2 className="mb-4 text-[11px] lowercase tracking-wide text-faint">{title}</h2>
      {children}
    </section>
  );
}

export default function NewUpload() {
  const { showId } = useParams({ strict: false }) as { showId?: string };
  const navigate = useNavigate();

  const { data: shows = [] } = useShows();
  const selectedShow = shows.find((s) => s.id === showId) ?? null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [videoS3Key, setVideoS3Key] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['youtube', 'mixcloud']);
  const [includeJingle, setIncludeJingle] = useState(true);
  const [includeArchive, setIncludeArchive] = useState(true);
  const [trimStart, setTrimStart] = useState('');
  const [trimEnd, setTrimEnd] = useState('');
  const [autoTrimSilence, setAutoTrimSilence] = useState(true);
  const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null);

  const meta = useGeneratedMeta(selectedShow?.title, selectedShow?.description);
  const pending = usePendingVideos();
  const claim = useClaimPending();
  const createUpload = useCreateUpload();
  const upload = useUpload();
  const presence = usePresence();

  // Soft claim: opening auto-claims the show, unless someone else holds it — then
  // we show an interstitial and only claim (steal) once the user opts to open anyway.
  const existingClaim = showId ? presence.claims[showId] : undefined;
  const heldByOther = !!existingClaim && existingClaim.userSub !== presence.myUserId;
  const [ackSteal, setAckSteal] = useState(false);
  const proceeding = !heldByOther || ackSteal;

  useEffect(() => {
    setAckSteal(false);
  }, [showId]);

  useEffect(() => {
    if (!showId || !proceeding) return;
    presence.hold(showId);
    return () => presence.unhold(showId);
  }, [showId, proceeding]);

  useEffect(() => {
    if (upload.state.status === 'done' && upload.state.key) {
      setVideoS3Key(upload.state.key);
      setSelectedPendingId(null);
    }
  }, [upload.state.status, upload.state.key]);

  // Platforms already published on this record (YouTube/MixCloud), from mediaLinks.
  const existingLinks = selectedShow?.mediaLinks ?? [];
  const existingPlatforms = existingLinks.map((l) => LABEL_TO_PLATFORM[l.label]).filter(Boolean);

  useEffect(() => {
    if (!selectedShow) return;
    setTitle(publishTitle(selectedShow.title, selectedShow.date));
    setDescription(selectedShow.description ?? '');
    setTags(selectedShow.tags ?? []);
    setImageUrl(selectedShow.imageUrl ?? '');
    setVideoS3Key('');
    setSelectedPendingId(null);

    // Re-publish smarts: pre-select only the platform(s) not yet up, and default
    // archiving OFF when the show already has links (likely already archived).
    const already = (selectedShow.mediaLinks ?? []).map((l) => LABEL_TO_PLATFORM[l.label]).filter(Boolean);
    const missing = ALL_PLATFORMS.filter((p) => !already.includes(p));
    setPlatforms(missing.length ? missing : ALL_PLATFORMS);
    setIncludeArchive(already.length === 0);
  }, [selectedShow?.id]);

  // Seed the description from AI, but NOT tags — good tags need the audio
  // analysed first, so they're offered as suggestions instead (below the field).
  useEffect(() => {
    if (meta.data) setDescription(meta.data.youtubeDescription);
  }, [meta.data]);

  const handleField = (field: string, value: string | string[]) => {
    if (field === 'title') setTitle(value as string);
    if (field === 'description') setDescription(value as string);
    if (field === 'tags') setTags(value as string[]);
    if (field === 'imageUrl') setImageUrl(value as string);
  };

  const handleSubmit = () => {
    if (!selectedShow || !videoS3Key || platforms.length === 0) return;
    createUpload.mutate(
      {
        showId: selectedShow.id,
        title,
        description,
        tags,
        imageUrl: imageUrl || null,
        videoS3Key,
        platforms,
        includeJingle,
        includeArchive,
        autoTrimSilence,
        trimStart: trimStart || null,
        trimEnd: trimEnd || null,
      },
      {
        onSuccess: async ({ uploadId }) => {
          if (selectedPendingId) await claim.mutateAsync(selectedPendingId).catch(() => {});
          void navigate({ to: '/history', search: { highlight: uploadId } });
        },
      }
    );
  };

  const canSubmit = !!selectedShow && !!videoS3Key && platforms.length > 0 && !createUpload.isPending;
  const pendingVideos = pending.data ?? [];

  if (!selectedShow) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">That show isn't in the schedule (it may have loaded already).</p>
        <Link to="/" className="btn-ghost w-fit">← Back to shows</Link>
      </div>
    );
  }

  if (heldByOther && !ackSteal) {
    return (
      <div className="mx-auto max-w-md space-y-5 border border-ink bg-surface p-6">
        <div>
          <p className="text-[11px] lowercase tracking-wide text-faint">already being processed</p>
          <h1 className="mt-2 text-xl font-semibold lowercase text-ink">{selectedShow.title}</h1>
        </div>
        <p className="text-sm text-muted">
          <span className="text-ink">{shortName(existingClaim!.userName)}</span> is already working on this
          {' '}({timeAgo(existingClaim!.claimedAt)}). Two people on the same show usually means duplicate work.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setAckSteal(true)} className="btn-primary flex-1 py-2.5">
            open anyway
          </button>
          <Link to="/" className="btn-ghost flex-1 py-2.5 text-center">back</Link>
        </div>
      </div>
    );
  }

  return (
    <FullPageDropzone>
      <div className="mx-auto max-w-xl space-y-8">
        {existingClaim && existingClaim.userSub === presence.myUserId && ackSteal && (
          <p className="border border-ink bg-paper px-3 py-2 text-xs lowercase text-muted">
            you took this over — it's now claimed by you
          </p>
        )}
        <div>
          <Link to="/" className="text-sm lowercase text-muted hover:text-ink">← to process</Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{selectedShow.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="font-mono text-[13px] text-muted">
              {selectedShow.date} · {selectedShow.startTime}–{selectedShow.endTime}
            </p>
            <a
              href={`${AGENDA_BASE}/#/archive/${selectedShow.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] lowercase text-muted underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink"
            >
              ↗ open in agenda
            </a>
          </div>
        </div>

        {pendingVideos.length > 0 && (
          <Section title="From drop folder">
            <div className="space-y-1.5">
              {pendingVideos.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setVideoS3Key(v.s3_key);
                    setSelectedPendingId(v.id);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-sm transition-colors ${
                    selectedPendingId === v.id
                      ? 'border-accent bg-accent-soft/60 text-ink'
                      : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink'
                  }`}
                >
                  <span className="truncate font-mono text-[13px]">{v.filename}</span>
                  <span className="ml-3 shrink-0 text-xs text-faint">{(v.size_bytes / 1e9).toFixed(1)} GB</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        <Section title="Details">
          <MetadataForm
            title={title}
            description={description}
            tags={tags}
            imageUrl={imageUrl}
            generating={meta.isFetching}
            suggestedTags={meta.data?.tags ?? []}
            onChange={handleField}
          />
        </Section>

        {!selectedPendingId && (
          <Section title="Video">
            <UploadControl />
          </Section>
        )}

        <Section title="Trim">
          <TrimFields
            autoTrimSilence={autoTrimSilence}
            trimStart={trimStart}
            trimEnd={trimEnd}
            onAutoTrimChange={setAutoTrimSilence}
            onChange={(field, value) => {
              if (field === 'trimStart') setTrimStart(value);
              if (field === 'trimEnd') setTrimEnd(value);
            }}
          />
        </Section>

        <Section title="Publish to">
          {existingLinks.length > 0 && (
            <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs lowercase text-muted">
              <span className="text-faint">already published:</span>
              {existingLinks.map((l) => (
                <a
                  key={l.label + l.url}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink"
                >
                  {l.label} ↗
                </a>
              ))}
              <span className="text-faint">— pre-selected the missing platform, archiving off.</span>
            </p>
          )}
          <PlatformSelector
            platforms={platforms}
            includeJingle={includeJingle}
            includeArchive={includeArchive}
            existingPlatforms={existingPlatforms}
            onChange={setPlatforms}
            onJingleChange={setIncludeJingle}
            onArchiveChange={setIncludeArchive}
          />
        </Section>

        <div className="border-t border-line pt-6">
          <button onClick={handleSubmit} disabled={!canSubmit} className="btn-primary w-full py-3 text-[15px]">
            {createUpload.isPending ? 'Publishing…' : 'Publish'}
          </button>
          {!videoS3Key && (
            <p className="mt-2 text-center text-xs text-faint">Add a video to publish.</p>
          )}
        </div>
      </div>
    </FullPageDropzone>
  );
}
