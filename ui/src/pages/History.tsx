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
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [highlight, uploads]);

  if (isPending) return <p className="text-gray-400 text-sm">Loading...</p>;

  if (uploads.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">History</h1>
        <p className="text-gray-500 text-sm">No uploads yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">History</h1>
      {uploads.map((upload) => (
        <div
          key={upload.id}
          ref={upload.id === highlight ? highlightRef : null}
          className={`border rounded-lg p-5 space-y-4 transition-colors ${
            upload.id === highlight ? 'border-gray-500' : 'border-gray-800'
          }`}
        >
          <div>
            <p className="font-medium text-white">{upload.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {new Date(upload.created_at).toLocaleString()}
              {upload.archive_s3_key && <span className="ml-2 text-gray-600">· archived</span>}
            </p>
          </div>
          {upload.jobs.length > 0 ? (
            <JobProgress uploadId={upload.id} jobs={upload.jobs} />
          ) : (
            <p className="text-gray-600 text-xs">No jobs</p>
          )}
        </div>
      ))}
    </div>
  );
}
