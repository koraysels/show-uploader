import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from '@tanstack/react-router';
import {
  useShows,
  useGeneratedMeta,
  usePendingVideos,
  useClaimPending,
  useCreateUpload,
  useStaged,
  useSaveShowMetadata,
} from '../api/hooks';
import { trpcClient } from '../api/trpc';
import MetadataForm from '../components/MetadataForm';
import { FullPageDropzone, UploadControl } from '../components/Dropzone';
import PlatformSelector from '../components/PlatformSelector';
import TrimFields from '../components/TrimFields';
import { useUpload } from '../upload/UploadProvider';
import { resolveVideo, type StagedVideo } from '../upload/resolveVideo';
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

// The scheduled show length from the agenda start/end (both "HH:MM"), as HH:MM:SS
// — the expected recording duration, suggested as a trim end point. Handles an
// overnight window (end past midnight). Null when the times don't parse.
function scheduledDuration(startTime: string, endTime: string): string | null {
  const toMin = (t: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? '');
    return m ? +m[1] * 60 + +m[2] : null;
  };
  const s = toMin(startTime);
  const e = toMin(endTime);
  if (s === null || e === null) return null;
  let mins = e - s;
  if (mins <= 0) mins += 24 * 60; // crosses midnight
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return `${hh}:${mm}:00`;
}

// Published title convention: "<name> <DD.MM.YYYY> @ coming soon".
function publishTitle(name: string, date: string): string {
  const [y, m, d] = (date ?? '').split('-');
  const dmy = d && m && y ? `${d}.${m}.${y}` : date;
  // Strip an existing "<date> @ coming soon" suffix (as one unit) first so a
  // show title that already follows the convention doesn't get it appended
  // twice — without touching a bare trailing date that's part of the real name.
  const base = (name ?? '')
    .replace(/\s*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\s*)?@\s*coming soon\s*$/i, '')
    .trim();
  return `${base} ${dmy} @ coming soon`;
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
  // A hand-picked drop-folder file (not a staged upload). Everything else about
  // "does this show have a video" is DERIVED, never stored — see resolveVideo.
  const [pickedVideo, setPickedVideo] = useState<StagedVideo | null>(null);
  const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<string[]>(['youtube', 'mixcloud']);
  const [includeJingle, setIncludeJingle] = useState(true);
  const [trimStart, setTrimStart] = useState('');
  const [trimEnd, setTrimEnd] = useState('');
  const [autoTrimSilence, setAutoTrimSilence] = useState(true);

  const qc = useQueryClient();
  // Feed the AI both the episode notes and the linked show's blurb as context.
  const meta = useGeneratedMeta(
    selectedShow?.title,
    [selectedShow?.description, selectedShow?.showDescription].filter(Boolean).join('\n\n')
  );
  const pending = usePendingVideos();
  const claim = useClaimPending();
  const createUpload = useCreateUpload();
  const saveMeta = useSaveShowMetadata();
  const upload = useUpload();
  const activeUpload = showId ? upload.get(showId) : undefined;
  const stagedQ = useStaged(showId);
  const presence = usePresence();

  // THE single source of truth for the form's video, derived from the live
  // upload + the server-staged video + a hand-picked drop-folder file.
  const video = resolveVideo({
    live: activeUpload ?? null,
    staged: stagedQ.data ? { s3_key: stagedQ.data.s3_key, filename: stagedQ.data.filename } : null,
    pending: pickedVideo,
  });
  const videoS3Key = video.state === 'ready' ? video.key : '';
  const videoFilename = video.state === 'ready' || video.state === 'uploading' || video.state === 'error' ? video.filename : '';

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

  // When a live upload finishes, the server has already recorded the staged
  // video (in the multipart 'complete' step) — just refetch so the ready state
  // is durable across navigation. A fresh upload supersedes a drop-folder pick.
  useEffect(() => {
    if (activeUpload?.status === 'done') {
      setPickedVideo(null);
      setSelectedPendingId(null);
      void qc.invalidateQueries({ queryKey: ['staged', showId] });
      void qc.invalidateQueries({ queryKey: ['staged-shows'] });
    }
  }, [activeUpload?.status, showId, qc]);

  // Platforms already published on this record (YouTube/MixCloud), from mediaLinks.
  const existingLinks = selectedShow?.mediaLinks ?? [];

  // On show change, reset the editable fields + drop-folder pick. The video
  // itself is DERIVED (staged query + live upload, both keyed by showId), so
  // there's nothing to reset or race here.
  useEffect(() => {
    if (!selectedShow) return;
    setTitle(publishTitle(selectedShow.title, selectedShow.date));
    // Description = the episode's own notes (PB is master); fall back to the
    // linked show's blurb when the episode has none of its own.
    setDescription(selectedShow.description || selectedShow.showDescription || '');
    setTags(selectedShow.tags ?? []);
    setImageUrl(selectedShow.imageUrl ?? '');
    setPickedVideo(null);
    setSelectedPendingId(null);

    // Re-publish smarts: pre-select only the platform(s) not yet up. If both are
    // already published, select NONE (never re-publish → duplicate).
    const already = (selectedShow.mediaLinks ?? []).map((l) => LABEL_TO_PLATFORM[l.label]).filter(Boolean);
    setPlatforms(ALL_PLATFORMS.filter((p) => !already.includes(p)));
  }, [selectedShow?.id]);

  // The AI description is a SUGGESTION (a button in the form), not an auto-
  // override — PocketBase is the master, so the field stays the record's notes
  // until the operator chooses to apply the suggestion. (Tags work the same way.)

  const handleField = (field: string, value: string | string[]) => {
    if (field === 'title') setTitle(value as string);
    if (field === 'description') setDescription(value as string);
    if (field === 'tags') setTags(value as string[]);
    if (field === 'imageUrl') setImageUrl(value as string);
  };

  // Discard this show's video: clear the pick, cancel/forget any live upload, and
  // remove the server-staged record. The derived `video` then falls back to none.
  const handleReplace = () => {
    setPickedVideo(null);
    setSelectedPendingId(null);
    if (showId) {
      upload.reset(showId);
      void trpcClient.uploads.deleteStaged.mutate({ showId }).catch(() => {});
      void qc.invalidateQueries({ queryKey: ['staged', showId] });
      void qc.invalidateQueries({ queryKey: ['staged-shows'] });
    }
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
        platforms: platforms as ('youtube' | 'mixcloud')[],
        includeJingle,
        autoTrimSilence,
        trimStart: trimStart || null,
        trimEnd: trimEnd || null,
      },
      {
        onSuccess: async ({ uploadId }) => {
          if (selectedPendingId) await claim.mutateAsync(selectedPendingId).catch(() => {});
          // Publishing clears the staged row server-side — reflect that.
          qc.invalidateQueries({ queryKey: ['staged', showId] });
          qc.invalidateQueries({ queryKey: ['staged-shows'] });
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
    <FullPageDropzone showId={selectedShow.id}>
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
                    setPickedVideo({ s3_key: v.s3_key, filename: v.filename });
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
            showId={selectedShow.id}
            title={title}
            description={description}
            tags={tags}
            imageUrl={imageUrl}
            generating={meta.isFetching}
            suggestedTags={meta.data?.tags ?? []}
            suggestedDescription={meta.data?.youtubeDescription ?? ''}
            onChange={handleField}
          />
          {/* Persist title / description / tags straight to the agenda record now —
              they survive a refresh / navigation, without waiting for the upload to
              finish. PocketBase is the master; the description is the episode's own
              notes (not the AI copy, which is just a suggestion above). */}
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <button
              type="button"
              disabled={saveMeta.isPending || !title.trim()}
              onClick={() => saveMeta.mutate({ id: selectedShow.id, title, description, tags })}
              className="border border-line px-4 py-2 text-sm lowercase text-muted hover:border-ink hover:text-ink disabled:opacity-50"
            >
              {saveMeta.isPending ? 'saving…' : 'save to agenda'}
            </button>
            {saveMeta.isSuccess && !saveMeta.isPending && (
              <span className="text-xs lowercase text-ok">✓ saved to agenda</span>
            )}
            {saveMeta.isError && <span className="text-xs lowercase text-danger">save failed — try again</span>}
            <span className="ml-auto text-[11px] lowercase text-faint">pocketbase is the master · persists now</span>
          </div>
        </Section>

        <Section title="Video">
          {video.state === 'ready' ? (
            <div className="flex items-center justify-between border border-ok/40 bg-ok-soft px-4 py-3">
              <span className="truncate text-sm text-ink">✓ {videoFilename || 'video ready'}</span>
              <button
                type="button"
                onClick={handleReplace}
                className="shrink-0 text-xs text-faint hover:text-danger"
              >
                replace
              </button>
            </div>
          ) : (
            showId && <UploadControl showId={showId} />
          )}
        </Section>

        <Section title="Trim">
          <TrimFields
            autoTrimSilence={autoTrimSilence}
            trimStart={trimStart}
            trimEnd={trimEnd}
            scheduledDuration={scheduledDuration(selectedShow.startTime, selectedShow.endTime)}
            onAutoTrimChange={setAutoTrimSilence}
            onChange={(field, value) => {
              if (field === 'trimStart') setTrimStart(value);
              if (field === 'trimEnd') setTrimEnd(value);
            }}
          />
        </Section>

        <Section title="Publish to">
          <PlatformSelector
            platforms={platforms}
            includeJingle={includeJingle}
            showId={selectedShow.id}
            existingLinks={existingLinks}
            meta={{ title, description, tags, imageUrl: imageUrl || null }}
            onChange={setPlatforms}
            onJingleChange={setIncludeJingle}
          />
        </Section>

        <div className="border-t border-line pt-6">
          <button onClick={handleSubmit} disabled={!canSubmit} className="btn-primary w-full py-3 text-[15px]">
            {createUpload.isPending ? 'starting…' : 'save & start platform uploads'}
          </button>
          <p className="mt-2 text-center text-xs text-faint">
            {!videoS3Key
              ? 'add a video to start.'
              : 'uploads to youtube/mixcloud + syncs the draft. publishing the agenda record is a separate step (archive page).'}
          </p>
        </div>
      </div>
    </FullPageDropzone>
  );
}
