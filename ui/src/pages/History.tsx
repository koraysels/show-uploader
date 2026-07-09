import { useEffect, useRef } from 'react';
import { useSearch } from '@tanstack/react-router';
import { useUploads } from '../api/hooks';
import JobProgress from '../components/JobProgress';

export default function History() {
  const { data: uploads = [], isPending } = useUploads();
  const { highlight } = useSearch({ strict: false }) as { highlight?: string };
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlight && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlight, uploads]);

  if (isPending) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">History</h1>

      {uploads.length === 0 ? (
        <p className="text-sm text-muted">No uploads yet. Pick a show to get started.</p>
      ) : (
        <div className="space-y-3">
          {uploads.map((upload) => (
            <div
              key={upload.id}
              ref={upload.id === highlight ? highlightRef : null}
              className={`rounded-xl border bg-surface p-5 transition-colors ${
                upload.id === highlight ? 'border-accent shadow-card' : 'border-line'
              }`}
            >
              <div className="mb-4 flex items-baseline justify-between gap-4">
                <p className="font-medium text-ink">{upload.title}</p>
                <p className="shrink-0 text-xs text-faint">
                  {new Date(upload.created_at).toLocaleString()}
                  {upload.archive_s3_key && <span className="ml-2 text-ok">· archived</span>}
                </p>
              </div>
              {upload.jobs.length > 0 ? (
                <JobProgress uploadId={upload.id} jobs={upload.jobs} />
              ) : (
                <p className="text-xs text-faint">No jobs</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
