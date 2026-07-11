import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { uploadFileResumable, type UploadProgress } from './multipartUpload';

export type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

type UploadState = {
  status: UploadStatus;
  filename: string;
  fraction: number;
  uploadedBytes: number;
  totalBytes: number;
  bytesPerSec: number;
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
  bytesPerSec: 0,
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
  // Rolling sample to derive a smoothed upload speed from progress deltas.
  const sampleRef = useRef<{ time: number; bytes: number; speed: number }>({ time: 0, bytes: 0, speed: 0 });

  const start = useCallback((file: File) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    sampleRef.current = { time: performance.now(), bytes: 0, speed: 0 };

    setState({ ...initial, status: 'uploading', filename: file.name, totalBytes: file.size });

    uploadFileResumable(file, {
      signal: controller.signal,
      onProgress: (p: UploadProgress) =>
        setState((s) => {
          if (s.status !== 'uploading') return s;
          // Sample ~every 0.4s and smooth (EMA) so the number doesn't jitter.
          const now = performance.now();
          const last = sampleRef.current;
          const dt = (now - last.time) / 1000;
          let bytesPerSec = last.speed;
          if (dt >= 0.4 && p.uploadedBytes >= last.bytes) {
            const inst = (p.uploadedBytes - last.bytes) / dt;
            bytesPerSec = last.speed ? last.speed * 0.6 + inst * 0.4 : inst;
            sampleRef.current = { time: now, bytes: p.uploadedBytes, speed: bytesPerSec };
          }
          return { ...s, fraction: p.fraction, uploadedBytes: p.uploadedBytes, totalBytes: p.totalBytes, bytesPerSec };
        }),
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
