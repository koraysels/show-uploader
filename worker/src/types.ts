/**
 * A preview remux. Deliberately NOT part of JobPayload: it runs before an upload
 * exists, so it has no uploadId, no platform_jobs row, and no metadata — folding
 * it into the platform union would make every one of those fields optional for
 * jobs that genuinely require them.
 */
export type PreviewJobPayload = {
  videoS3Key: string;
};

export type JobPayload = {
  jobId: string;
  uploadId: string;
  // 'compress' only ever uses jobId/uploadId/videoS3Key below — every other
  // field is a placeholder for it. Kept in the same flat type (rather than a
  // PreviewJobPayload-style split) because it still runs through the shared
  // platform_jobs row + SSE progress plumbing that the other three rely on.
  platform: 'youtube' | 'mixcloud' | 'archive' | 'compress';
  videoS3Key: string;
  // The archived audio (shows/<slug>/audio.m4a). Set on platform jobs by the
  // archive job that enqueues them — platforms upload archive artefacts, they
  // never process the source recording themselves.
  audioS3Key?: string | null;
  title: string;
  description: string;
  tags: string[];
  // The PocketBase archive-record cover image (a public file URL). When set, it
  // overrides the auto-captured video frame as the MixCloud cover art.
  imageUrl: string | null;
  jingleS3Key: string | null;
  includeJingle: boolean;
  autoTrimSilence?: boolean;
  trimStart: string | null;
  trimEnd: string | null;
};
