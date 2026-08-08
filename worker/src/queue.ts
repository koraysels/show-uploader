import { Queue, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env';
import type { JobPayload, PreviewJobPayload } from './types';

export const QUEUE_NAME = 'platform-uploads';
export const PREVIEW_QUEUE_NAME = 'video-previews';

// Cast to bullmq's ConnectionOptions: bullmq bundles its own nested ioredis copy,
// so the instance's type differs from ours even though it's the same runtime class.
export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
}) as unknown as ConnectionOptions;

export const uploadQueue = new Queue<JobPayload>(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
  },
});

// Its own queue so a long remux can't sit behind (or ahead of) a publish, and so
// the two never share retry policy. One attempt only: a failed remux leaves the
// source untouched, and the operator can just press preview again.
export const previewQueue = new Queue<PreviewJobPayload>(PREVIEW_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
});
