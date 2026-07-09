import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useDropzone } from 'react-dropzone';
import { useUpload } from '../upload/UploadProvider';

// Only the browse trigger is local to the dropzone; upload state is global.
const OpenContext = createContext<() => void>(() => {});

// Wraps the page so a video dropped ANYWHERE over it starts uploading. noClick
// keeps the form's own controls clickable; a full-screen overlay shows on drag.
export function FullPageDropzone({ children }: { children: ReactNode }) {
  const { start } = useUpload();
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) start(accepted[0]);
    },
    [start]
  );
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    multiple: false,
    accept: { 'video/*': ['.mkv', '.mp4', '.mov', '.webm'] },
  });

  return (
    <div {...getRootProps({ className: 'relative min-h-screen' })}>
      <input {...getInputProps()} />
      <OpenContext.Provider value={open}>{children}</OpenContext.Provider>
      {isDragActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm pointer-events-none">
          <div className="border-2 border-dashed border-white/60 rounded-2xl px-16 py-12 text-center">
            <p className="text-lg font-medium text-white">Drop video to upload</p>
            <p className="text-sm text-gray-400 mt-1">MKV, MP4, MOV or WebM · resumable</p>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n > 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n > 1e6) return `${(n / 1e6).toFixed(0)} MB`;
  return `${(n / 1e3).toFixed(0)} KB`;
}

// Inline control in the form: browse button + upload status/progress.
export function UploadControl() {
  const open = useContext(OpenContext);
  const { state, cancel } = useUpload();
  const pct = Math.round(state.fraction * 100);

  return (
    <div className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center">
      {state.status === 'idle' && (
        <button type="button" onClick={open} className="text-gray-400 text-sm hover:text-white">
          Drop video anywhere, or click to browse
        </button>
      )}
      {state.status === 'uploading' && (
        <div className="space-y-2">
          <p className="text-gray-300 text-sm truncate">{state.filename}</p>
          <div className="w-full bg-gray-800 rounded-full h-1.5">
            <div className="bg-white h-1.5 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-gray-400 text-xs">
            {pct}% · {fmtBytes(state.uploadedBytes)} / {fmtBytes(state.totalBytes)} · resumable
          </p>
          <button type="button" onClick={cancel} className="text-gray-500 text-xs underline hover:text-gray-300">
            Cancel
          </button>
        </div>
      )}
      {state.status === 'done' && <p className="text-green-400 text-sm">✓ {state.filename}</p>}
      {state.status === 'error' && (
        <div className="space-y-1">
          <p className="text-red-400 text-sm">Upload failed</p>
          <p className="text-gray-500 text-xs">{state.error}</p>
          <button type="button" onClick={open} className="text-gray-400 text-xs underline mt-2">
            Choose file to retry
          </button>
        </div>
      )}
    </div>
  );
}

// Global indicator for the nav — visible on every route while uploading.
export function UploadIndicator() {
  const { state } = useUpload();
  if (state.status !== 'uploading') return null;
  const pct = Math.round(state.fraction * 100);
  return (
    <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
      <span className="truncate max-w-[160px]">{state.filename}</span>
      <span className="w-24 bg-gray-800 rounded-full h-1">
        <span className="block bg-white h-1 rounded-full" style={{ width: `${pct}%` }} />
      </span>
      <span>{pct}%</span>
    </div>
  );
}
