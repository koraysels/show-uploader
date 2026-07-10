export type JobPayload = {
  jobId: string;
  uploadId: string;
  platform: 'youtube' | 'mixcloud' | 'archive';
  videoS3Key: string;
  title: string;
  description: string;
  tags: string[];
  imageUrl: string | null;
  jingleS3Key: string | null;
  includeJingle: boolean;
  includeArchive?: boolean;
  trimStart: string | null;
  trimEnd: string | null;
};
