import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type AgendaShow } from '../api/client';
import ShowPicker from '../components/ShowPicker';
import MetadataForm from '../components/MetadataForm';
import FileDropzone from '../components/FileDropzone';
import PlatformSelector from '../components/PlatformSelector';
import TrimFields from '../components/TrimFields';

type PendingVideo = {
  id: string;
  s3_key: string;
  filename: string;
  size_bytes: number;
  created_at: string;
};

export default function NewUpload() {
  const navigate = useNavigate();
  const [selectedShow, setSelectedShow] = useState<AgendaShow | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [videoS3Key, setVideoS3Key] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['youtube', 'mixcloud']);
  const [includeJingle, setIncludeJingle] = useState(true);
  const [trimStart, setTrimStart] = useState('');
  const [trimEnd, setTrimEnd] = useState('');
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingVideos, setPendingVideos] = useState<PendingVideo[]>([]);
  const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null);

  useEffect(() => {
    api.listPendingVideos().then(setPendingVideos).catch(() => {});
    const interval = setInterval(() => {
      api.listPendingVideos().then(setPendingVideos).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleShowSelect = async (show: AgendaShow) => {
    setSelectedShow(show);
    setTitle(show.title);
    setDescription(show.description ?? '');
    setTags(show.tags ?? []);
    setImageUrl(show.imageUrl ?? '');
    setGenerating(true);
    try {
      const meta = await api.generateMeta(show.title, show.description ?? '');
      setDescription(meta.youtubeDescription);
      setTags(meta.tags);
    } catch {
      // Keep original on AI failure
    } finally {
      setGenerating(false);
    }
  };

  const handleSelectPending = (video: PendingVideo) => {
    setVideoS3Key(video.s3_key);
    setSelectedPendingId(video.id);
  };

  const handleField = (field: string, value: string | string[]) => {
    if (field === 'title') setTitle(value as string);
    if (field === 'description') setDescription(value as string);
    if (field === 'tags') setTags(value as string[]);
    if (field === 'imageUrl') setImageUrl(value as string);
  };

  const handleSubmit = async () => {
    if (!selectedShow || !videoS3Key || platforms.length === 0) return;
    setSubmitting(true);
    try {
      const { uploadId } = await api.createUpload({
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
      });

      if (selectedPendingId) {
        await api.claimPendingVideo(selectedPendingId).catch(() => {});
      }

      navigate(`/history?highlight=${uploadId}`);
    } catch (err) {
      console.error('Failed to start upload:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !!selectedShow && !!videoS3Key && platforms.length > 0 && !submitting;

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">New Upload</h1>

      {pendingVideos.length > 0 && (
        <div>
          <label className="block text-sm text-gray-400 mb-2">
            Videos from drop folder
          </label>
          <div className="space-y-1">
            {pendingVideos.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => handleSelectPending(v)}
                className={`w-full text-left px-3 py-2 rounded border text-sm transition-colors ${
                  selectedPendingId === v.id
                    ? 'border-white text-white bg-gray-800'
                    : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
                }`}
              >
                <span className="font-mono">{v.filename}</span>
                <span className="ml-2 text-gray-600 text-xs">
                  {(v.size_bytes / 1e9).toFixed(1)} GB
                </span>
              </button>
            ))}
          </div>
          {!selectedPendingId && (
            <p className="text-xs text-gray-600 mt-1">
              Or upload a file manually below
            </p>
          )}
        </div>
      )}

      <ShowPicker onSelect={handleShowSelect} />

      {selectedShow && (
        <>
          <MetadataForm
            title={title}
            description={description}
            tags={tags}
            imageUrl={imageUrl}
            generating={generating}
            onChange={handleField}
          />

          {!selectedPendingId && <FileDropzone onUploaded={setVideoS3Key} />}

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
            {submitting ? 'Publishing...' : 'Publish'}
          </button>
        </>
      )}
    </div>
  );
}
