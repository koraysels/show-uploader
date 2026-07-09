import { useEffect, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useShows, useGeneratedMeta, usePendingVideos, useClaimPending, useCreateUpload } from '../api/hooks';
import ShowPicker from '../components/ShowPicker';
import MetadataForm from '../components/MetadataForm';
import { FullPageDropzone, UploadControl } from '../components/Dropzone';
import PlatformSelector from '../components/PlatformSelector';
import TrimFields from '../components/TrimFields';
import { useUpload } from '../upload/UploadProvider';

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

  // A completed background upload provides the S3 key to publish.
  useEffect(() => {
    if (upload.state.status === 'done' && upload.state.key) {
      setVideoS3Key(upload.state.key);
      setSelectedPendingId(null);
    }
  }, [upload.state.status, upload.state.key]);

  // Seed the form when the selected show changes.
  useEffect(() => {
    if (!selectedShow) return;
    setTitle(selectedShow.title);
    setDescription(selectedShow.description ?? '');
    setTags(selectedShow.tags ?? []);
    setImageUrl(selectedShow.imageUrl ?? '');
    setVideoS3Key('');
    setSelectedPendingId(null);
  }, [selectedShow?.id]);

  // Overlay the AI-generated copy once it arrives.
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

  return (
    <FullPageDropzone>
      <div className="space-y-8">
        <h1 className="text-xl font-semibold">New Upload</h1>

        {pendingVideos.length > 0 && (
          <div>
            <label className="block text-sm text-gray-400 mb-2">Videos from drop folder</label>
            <div className="space-y-1">
              {pendingVideos.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setVideoS3Key(v.s3_key);
                    setSelectedPendingId(v.id);
                  }}
                  className={`w-full text-left px-3 py-2 rounded border text-sm transition-colors ${
                    selectedPendingId === v.id
                      ? 'border-white text-white bg-gray-800'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
                  }`}
                >
                  <span className="font-mono">{v.filename}</span>
                  <span className="ml-2 text-gray-600 text-xs">{(v.size_bytes / 1e9).toFixed(1)} GB</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <ShowPicker selectedId={showId} />

        {selectedShow && (
          <>
            <MetadataForm
              title={title}
              description={description}
              tags={tags}
              imageUrl={imageUrl}
              generating={meta.isFetching}
              onChange={handleField}
            />

            {!selectedPendingId && <UploadControl />}

            <TrimFields
              trimStart={trimStart}
              trimEnd={trimEnd}
              onChange={(field, value) => {
                if (field === 'trimStart') setTrimStart(value);
                if (field === 'trimEnd') setTrimEnd(value);
              }}
            />

            <PlatformSelector
              platforms={platforms}
              includeJingle={includeJingle}
              onChange={setPlatforms}
              onJingleChange={setIncludeJingle}
            />

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full bg-white text-black rounded py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-gray-100 transition-colors"
            >
              {createUpload.isPending ? 'Publishing...' : 'Publish'}
            </button>
          </>
        )}
      </div>
    </FullPageDropzone>
  );
}
