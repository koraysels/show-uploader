import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { uploadFileResumable, type UploadProgress } from './multipartUpload';

export type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

type UploadState = {
  status: UploadStatus;
  filename: string;
  fraction: number;
  uploadedBytes: number;
  totalBytes: number;
  key: string | null;
  error: string | null;
};

type UploadContextValue = {
  state: UploadState;
  start: (file: File) => void;
  cancel: () => void;
  reset: () => void;
};

const initial: UploadState = {
  status: 'idle',
  filename: '',
  fraction: 0,
  uploadedBytes: 0,
  totalBytes: 0,
  key: null,
  error: null,
};

const UploadContext = createContext<UploadContextValue | null>(null);

export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error('useUpload must be used inside UploadProvider');
  return ctx;
}

// Lives above the router so an in-progress upload survives route navigation
// (YouTube-Studio style). A hard reload stops JS; the engine resumes from the
// server's recorded parts when the same file is re-selected.
export function UploadProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UploadState>(initial);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback((file: File) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ ...initial, status: 'uploading', filename: file.name, totalBytes: file.size });

    uploadFileResumable(file, {
      signal: controller.signal,
      onProgress: (p: UploadProgress) =>
        setState((s) =>
          s.status === 'uploading'
            ? { ...s, fraction: p.fraction, uploadedBytes: p.uploadedBytes, totalBytes: p.totalBytes }
            : s
        ),
    })
      .then(({ key }) => setState((s) => ({ ...s, status: 'done', key, fraction: 1 })))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return; // cancelled — leave as idle-ish
        setState((s) => ({ ...s, status: 'error', error: err instanceof Error ? err.message : 'Upload failed' }));
      });
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState(initial);
  }, []);

  const reset = useCallback(() => setState(initial), []);

  return <UploadContext.Provider value={{ state, start, cancel, reset }}>{children}</UploadContext.Provider>;
}
