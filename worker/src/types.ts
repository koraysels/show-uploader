export type JobPayload = {
  jobId: string;
  uploadId: string;
  platform: 'youtube' | 'mixcloud' | 'archive';
  videoS3Key: string;
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
