import { useEffect, useRef } from 'react';
import { useSearch } from '@tanstack/react-router';
import { useUploads } from '../api/hooks';
import type { UploadWithJobs } from '../api/client';
import JobProgress from '../components/JobProgress';
import { usePaged, Pager } from '../components/Pager';
import { ListSkeleton } from '../components/Skeleton';

const isSettled = (u: UploadWithJobs) =>
  u.jobs.length > 0 && u.jobs.every((j) => j.status === 'done' || j.status === 'failed');

function UploadCard({
  upload,
  highlight,
  highlightRef,
}: {
  upload: UploadWithJobs;
  highlight?: string;
  highlightRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div
      ref={upload.id === highlight ? highlightRef : null}
      className={`border bg-surface p-5 transition-colors ${
        upload.id === highlight ? 'border-ink' : 'border-line'
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
  );
}

export default function History() {
  const { data: uploads = [], isPending } = useUploads();
  const { highlight } = useSearch({ strict: false }) as { highlight?: string };
  const highlightRef = useRef<HTMLDivElement>(null);

  const active = uploads.filter((u) => !isSettled(u));
  const done = uploads.filter(isSettled);
  const paged = usePaged(done, (u) => u.title);

  useEffect(() => {
    if (highlight && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlight, uploads]);

  if (isPending) return <ListSkeleton />;

  return (
    <div className="space-y-8">
      {active.length > 0 && (
        <section className="space-y-3">
          <h1 className="flex items-center gap-2 text-2xl font-semibold lowercase tracking-tight text-ink">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
            processing
          </h1>
          {active.map((upload) => (
            <UploadCard key={upload.id} upload={upload} highlight={highlight} highlightRef={highlightRef} />
          ))}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-2xl font-semibold lowercase tracking-tight text-ink">done</h1>
          {done.length > 0 && (
            <input
              value={paged.query}
              onChange={(e) => paged.setQuery(e.target.value)}
              placeholder="Filter done…"
              className="field w-full sm:w-64"
            />
          )}
        </div>
        {done.length === 0 ? (
          <p className="text-sm text-muted">
            {active.length > 0 ? 'nothing finished yet.' : 'no uploads yet. pick a show to get started.'}
          </p>
        ) : (
          <>
            {paged.slice.map((upload) => (
              <UploadCard key={upload.id} upload={upload} highlight={highlight} highlightRef={highlightRef} />
            ))}
            <Pager page={paged.page} pageCount={paged.pageCount} total={paged.total} setPage={paged.setPage} unit="done" />
          </>
        )}
      </section>
    </div>
  );
}
