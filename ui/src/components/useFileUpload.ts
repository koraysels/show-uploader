import { useCallback, useState } from 'react';
import { api } from '../api/client';

export type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

export type FileUpload = {
  status: UploadStatus;
  progress: number;
  filename: string;
  error: string;
  key: string | null;
  upload: (file: File) => Promise<void>;
  reset: () => void;
};

export function useFileUpload(onUploaded: (key: string) => void): FileUpload {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [key, setKey] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setFilename(file.name);
      setStatus('uploading');
      setProgress(0);
      setError('');
      try {
        const contentType = file.type || 'video/x-matroska';
        const { url, key: uploadedKey } = await api.getPresignedUrl(file.name, contentType);
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
        setKey(uploadedKey);
        onUploaded(uploadedKey);
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    },
    [onUploaded]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress(0);
    setFilename('');
    setError('');
    setKey(null);
  }, []);

  return { status, progress, filename, error, key, upload, reset };
}
