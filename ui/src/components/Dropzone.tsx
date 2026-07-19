import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useDropzone } from 'react-dropzone';
import { Link } from '@tanstack/react-router';
import prettyBytes from 'pretty-bytes';
import prettyMs from 'pretty-ms';
import { useUpload, type UploadItem } from '../upload/UploadProvider';

const OpenContext = createContext<() => void>(() => {});

export function FullPageDropzone({ children, showId }: { children: ReactNode; showId: string }) {
  const { start } = useUpload();
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) start(accepted[0], showId);
    },
    [start, showId]
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

// Human-readable transfer stats via pretty-bytes / pretty-ms.
function stats(uploadedBytes: number, totalBytes: number, bytesPerSec: number): string {
  const parts = [`${prettyBytes(uploadedBytes)} / ${prettyBytes(totalBytes)}`];
  if (bytesPerSec > 0) {
    parts.push(`${prettyBytes(bytesPerSec)}/s`);
    const remainingMs = ((totalBytes - uploadedBytes) / bytesPerSec) * 1000;
    if (remainingMs > 0) parts.push(`${prettyMs(remainingMs, { compact: true })} left`);
  }
  return parts.join(' · ');
}

export function UploadControl({ showId }: { showId: string }) {
  const open = useContext(OpenContext);
  const { get, cancel } = useUpload();
  const item = get(showId);
  const pct = Math.round((item?.fraction ?? 0) * 100);

  if (item?.status === 'uploading') {
    return (
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-sm text-ink">{item.filename}</span>
          <button type="button" onClick={() => cancel(showId)} className="shrink-0 text-xs text-faint hover:text-danger">
            Cancel
          </button>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">
          {pct}% · {stats(item.uploadedBytes, item.totalBytes, item.bytesPerSec)} · resumable
        </p>
      </div>
    );
  }

  if (item?.status === 'done') {
    return (
      <div className="flex items-center justify-between rounded-xl border border-ok/40 bg-ok-soft px-5 py-4">
        <span className="truncate text-sm text-ink">{item.filename}</span>
        <span className="shrink-0 text-sm font-medium text-ok">✓ ready</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      className={`w-full rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
        item?.status === 'error' ? 'border-danger/50 bg-danger-soft' : 'border-line hover:border-accent hover:bg-accent-soft/40'
      }`}
    >
      {item?.status === 'error' ? (
        <>
          <p className="text-sm font-medium text-danger">Upload failed</p>
          <p className="mt-1 text-xs text-muted">{item.error}</p>
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

// One row in the header queue: clickable, jumps to that show's upload page.
function IndicatorRow({ item, compact }: { item: UploadItem; compact?: boolean }) {
  const pct = Math.round(item.fraction * 100);
  return (
    <Link
      to="/upload/$showId"
      params={{ showId: item.showId }}
      className={`flex items-center gap-2 text-xs text-muted hover:text-ink ${compact ? '' : 'w-full px-1 py-1'}`}
    >
      <span className="max-w-[140px] truncate">{item.filename}</span>
      <span className="h-1 w-20 shrink-0 overflow-hidden rounded-full bg-line">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </span>
      <span className="shrink-0 tabular-nums">{pct}%</span>
    </Link>
  );
}

export function UploadIndicator() {
  const { uploads } = useUpload();
  const [open, setOpen] = useState(false);
  const active = Object.values(uploads).filter((u) => u.status === 'uploading');

  if (active.length === 0) return null;
  if (active.length === 1) return <IndicatorRow item={active[0]} compact />;

  const avg = Math.round((active.reduce((s, u) => s + u.fraction, 0) / active.length) * 100);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-ink"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
        {active.length} uploading · {avg}%
        <span className="text-[9px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 space-y-0.5 border border-line bg-surface p-2 shadow-md">
          {active.map((u) => (
            <IndicatorRow key={u.showId} item={u} />
          ))}
        </div>
      )}
    </div>
  );
}
