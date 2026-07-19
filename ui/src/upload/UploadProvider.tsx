import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { uploadFileResumable, type UploadProgress } from './multipartUpload';

export type UploadStatus = 'uploading' | 'done' | 'error';

// One upload, tied to the show it belongs to. Several can run at once (one per
// show), so an upload's progress/result only ever shows on its own show's form.
export type UploadItem = {
  showId: string;
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
  uploads: Record<string, UploadItem>;
  get: (showId: string) => UploadItem | undefined;
  start: (file: File, showId: string) => void;
  cancel: (showId: string) => void;
  reset: (showId: string) => void;
};

const UploadContext = createContext<UploadContextValue | null>(null);

export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error('useUpload must be used inside UploadProvider');
  return ctx;
}

type Sample = { time: number; bytes: number; speed: number };

// Lives above the router so in-progress uploads survive route navigation
// (YouTube-Studio style). A hard reload stops JS; the engine resumes from the
// server's recorded parts when the same file is re-selected.
export function UploadProvider({ children }: { children: ReactNode }) {
  const [uploads, setUploads] = useState<Record<string, UploadItem>>({});
  const abortRefs = useRef<Map<string, AbortController>>(new Map());
  const sampleRefs = useRef<Map<string, Sample>>(new Map());

  const patch = useCallback((showId: string, next: Partial<UploadItem>) => {
    setUploads((prev) => {
      const cur = prev[showId];
      if (!cur) return prev;
      return { ...prev, [showId]: { ...cur, ...next } };
    });
  }, []);

  const start = useCallback(
    (file: File, showId: string) => {
      // Replace any prior upload for THIS show (keep other shows' uploads running).
      abortRefs.current.get(showId)?.abort();
      const controller = new AbortController();
      abortRefs.current.set(showId, controller);
      sampleRefs.current.set(showId, { time: performance.now(), bytes: 0, speed: 0 });

      setUploads((prev) => ({
        ...prev,
        [showId]: {
          showId,
          status: 'uploading',
          filename: file.name,
          fraction: 0,
          uploadedBytes: 0,
          totalBytes: file.size,
          bytesPerSec: 0,
          key: null,
          error: null,
        },
      }));

      uploadFileResumable(file, {
        showId,
        signal: controller.signal,
        onProgress: (p: UploadProgress) =>
          setUploads((prev) => {
            const cur = prev[showId];
            if (!cur || cur.status !== 'uploading') return prev;
            // Sample ~every 0.4s and smooth (EMA) so the speed doesn't jitter.
            const now = performance.now();
            const last = sampleRefs.current.get(showId) ?? { time: now, bytes: 0, speed: 0 };
            const dt = (now - last.time) / 1000;
            let bytesPerSec = last.speed;
            if (dt >= 0.4 && p.uploadedBytes >= last.bytes) {
              const inst = (p.uploadedBytes - last.bytes) / dt;
              bytesPerSec = last.speed ? last.speed * 0.6 + inst * 0.4 : inst;
              sampleRefs.current.set(showId, { time: now, bytes: p.uploadedBytes, speed: bytesPerSec });
            }
            return {
              ...prev,
              [showId]: { ...cur, fraction: p.fraction, uploadedBytes: p.uploadedBytes, totalBytes: p.totalBytes, bytesPerSec },
            };
          }),
      })
        .then(({ key }) => patch(showId, { status: 'done', key, fraction: 1 }))
        .catch((err: unknown) => {
          if (controller.signal.aborted) return; // cancelled
          patch(showId, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed' });
        });
    },
    [patch]
  );

  const remove = useCallback((showId: string) => {
    abortRefs.current.get(showId)?.abort();
    abortRefs.current.delete(showId);
    sampleRefs.current.delete(showId);
    setUploads((prev) => {
      if (!(showId in prev)) return prev;
      const next = { ...prev };
      delete next[showId];
      return next;
    });
  }, []);

  const get = useCallback((showId: string) => uploads[showId], [uploads]);

  return (
    <UploadContext.Provider value={{ uploads, get, start, cancel: remove, reset: remove }}>
      {children}
    </UploadContext.Provider>
  );
}
