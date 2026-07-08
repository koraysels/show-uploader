import { Queue, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../env';

export const QUEUE_NAME = 'platform-uploads';

// Cast to bullmq's ConnectionOptions: bullmq bundles its own nested ioredis copy,
// so the instance's type differs from ours even though it's the same runtime class.
export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
}) as unknown as ConnectionOptions;

export const uploadQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

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
  trimStart: string | null;
  trimEnd: string | null;
};
