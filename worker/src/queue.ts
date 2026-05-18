import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env';
import type { JobPayload } from './types';

export const QUEUE_NAME = 'platform-uploads';

export const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const uploadQueue = new Queue<JobPayload>(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
  },
});
