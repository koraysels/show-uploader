import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from '@tanstack/react-router';
import { useShows, useGeneratedMeta, usePendingVideos, useClaimPending, useCreateUpload } from '../api/hooks';
import MetadataForm from '../components/MetadataForm';
import { FullPageDropzone, UploadControl } from '../components/Dropzone';
import PlatformSelector from '../components/PlatformSelector';
import TrimFields from '../components/TrimFields';
import { useUpload } from '../upload/UploadProvider';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-6">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.09em] text-faint">{title}</h2>
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
  const [trimStart, setTrimStart] = useState('');
  const [trimEnd, setTrimEnd] = useState('');
  const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null);

  const meta = useGeneratedMeta(selectedShow?.title, selectedShow?.description);
  const pending = usePendingVideos();
  const claim = useClaimPending();
  const createUpload = useCreateUpload();
  const upload = useUpload();

  useEffect(() => {
    if (upload.state.status === 'done' && upload.state.key) {
      setVideoS3Key(upload.state.key);
      setSelectedPendingId(null);
    }
  }, [upload.state.status, upload.state.key]);

  useEffect(() => {
    if (!selectedShow) return;
    setTitle(selectedShow.title);
    setDescription(selectedShow.description ?? '');
    setTags(selectedShow.tags ?? []);
    setImageUrl(selectedShow.imageUrl ?? '');
    setVideoS3Key('');
    setSelectedPendingId(null);
  }, [selectedShow?.id]);

  useEffect(() => {
    if (meta.data) {
      setDescription(meta.data.youtubeDescription);
      setTags(meta.data.tags);
    }
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

  return (
    <FullPageDropzone>
      <div className="mx-auto max-w-xl space-y-8">
        <div>
          <Link to="/" className="text-sm text-muted hover:text-ink">← Shows</Link>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">{selectedShow.title}</h1>
          <p className="mt-1 font-mono text-[13px] text-muted">
            {selectedShow.date} · {selectedShow.startTime}–{selectedShow.endTime}
          </p>
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
            trimStart={trimStart}
            trimEnd={trimEnd}
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
            onChange={setPlatforms}
            onJingleChange={setIncludeJingle}
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
