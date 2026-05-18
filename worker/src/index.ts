import { Worker } from 'bullmq';
import { redis, QUEUE_NAME } from './queue';
import { processYoutube } from './jobs/youtube';
import { processMixcloud } from './jobs/mixcloud';
import { processArchive } from './jobs/archive';
import type { JobPayload } from './types';

const worker = new Worker<JobPayload>(
  QUEUE_NAME,
  async (job) => {
    console.log(`Processing job ${job.id}: ${job.data.platform} for upload ${job.data.uploadId}`);
    switch (job.data.platform) {
      case 'youtube':
        return processYoutube(job);
      case 'mixcloud':
        return processMixcloud(job);
      case 'archive':
        return processArchive(job);
      default:
        throw new Error(`Unknown platform: ${String(job.data.platform)}`);
    }
  },
  {
    connection: redis,
    concurrency: 2,
  }
);

worker.on('completed', (job) => {
  console.log(`Job completed: ${job.id} (${job.data.platform})`);
});

worker.on('failed', (job, err) => {
  console.error(`Job failed: ${job?.id} (${job?.data.platform})`, err.message);
});

console.log('Worker started');
