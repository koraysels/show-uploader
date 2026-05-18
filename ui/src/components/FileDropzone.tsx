import { useRef, useState } from 'react';
import { api } from '../api/client';

type Props = {
  onUploaded: (key: string) => void;
};

type Status = 'idle' | 'uploading' | 'done' | 'error';

export default function FileDropzone({ onUploaded }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [filename, setFilename] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setFilename(file.name);
    setStatus('uploading');
    setProgress(0);
    setErrorMsg('');

    try {
      const contentType = file.type || 'video/x-matroska';
      const { url, key } = await api.getPresignedUrl(file.name, contentType);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () =>
          xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.send(file);
      });

      setStatus('done');
      onUploaded(key);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  return (
    <div
      className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center cursor-pointer hover:border-gray-500 transition-colors"
      onClick={() => status !== 'uploading' && inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && status !== 'uploading') handleFile(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mkv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      {status === 'idle' && (
        <p className="text-gray-400 text-sm">Drop video file here or click to browse</p>
      )}
      {status === 'uploading' && (
        <div className="space-y-2">
          <p className="text-gray-300 text-sm truncate">{filename}</p>
          <div className="w-full bg-gray-800 rounded-full h-1.5">
            <div
              className="bg-white h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-gray-400 text-xs">{progress}% — uploading to storage</p>
        </div>
      )}
      {status === 'done' && (
        <p className="text-green-400 text-sm">✓ {filename}</p>
      )}
      {status === 'error' && (
        <div className="space-y-1">
          <p className="text-red-400 text-sm">Upload failed</p>
          <p className="text-gray-500 text-xs">{errorMsg}</p>
          <p className="text-gray-400 text-xs mt-2">Click to try again</p>
        </div>
      )}
    </div>
  );
}
