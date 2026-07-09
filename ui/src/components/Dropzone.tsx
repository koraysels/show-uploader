import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useDropzone } from 'react-dropzone';
import { useUpload } from '../upload/UploadProvider';

const OpenContext = createContext<() => void>(() => {});

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
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-paper/80 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-accent px-16 py-12 text-center">
            <p className="font-display text-xl font-semibold text-ink">Drop to upload</p>
            <p className="mt-1 text-sm text-muted">MKV · MP4 · MOV · WebM — resumable</p>
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

export function UploadControl() {
  const open = useContext(OpenContext);
  const { state, cancel } = useUpload();
  const pct = Math.round(state.fraction * 100);

  if (state.status === 'uploading') {
    return (
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-sm text-ink">{state.filename}</span>
          <button type="button" onClick={cancel} className="shrink-0 text-xs text-faint hover:text-danger">
            Cancel
          </button>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">
          {pct}% · {fmtBytes(state.uploadedBytes)} / {fmtBytes(state.totalBytes)} · resumable
        </p>
      </div>
    );
  }

  if (state.status === 'done') {
    return (
      <div className="flex items-center justify-between rounded-xl border border-ok/40 bg-ok-soft px-5 py-4">
        <span className="truncate text-sm text-ink">{state.filename}</span>
        <span className="shrink-0 text-sm font-medium text-ok">✓ ready</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      className={`w-full rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
        state.status === 'error' ? 'border-danger/50 bg-danger-soft' : 'border-line hover:border-accent hover:bg-accent-soft/40'
      }`}
    >
      {state.status === 'error' ? (
        <>
          <p className="text-sm font-medium text-danger">Upload failed</p>
          <p className="mt-1 text-xs text-muted">{state.error}</p>
          <p className="mt-2 text-xs text-faint">Click to choose a file and retry</p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-ink">Drop a video anywhere</p>
          <p className="mt-1 text-xs text-muted">or click to browse · resumable, keeps going as you navigate</p>
        </>
      )}
    </button>
  );
}

export function UploadIndicator() {
  const { state } = useUpload();
  if (state.status !== 'uploading') return null;
  const pct = Math.round(state.fraction * 100);
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span className="max-w-[140px] truncate">{state.filename}</span>
      <span className="h-1 w-20 overflow-hidden rounded-full bg-line">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums">{pct}%</span>
    </div>
  );
}
