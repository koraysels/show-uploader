import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type AgendaShow } from '../api/client';
import ShowPicker from '../components/ShowPicker';
import MetadataForm from '../components/MetadataForm';
import FileDropzone from '../components/FileDropzone';
import PlatformSelector from '../components/PlatformSelector';

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
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
      // Keep original description on AI failure — no alert needed
    } finally {
      setGenerating(false);
    }
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
      });
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
          <FileDropzone onUploaded={setVideoS3Key} />
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
