import { Worker } from 'bullmq';
import { redis, QUEUE_NAME } from './queue';
import { processYoutube } from './jobs/youtube';
import { processMixcloud } from './jobs/mixcloud';
import { processArchive } from './jobs/archive';
import { reconcileStalledJobs, setJobStatus } from './db';
import type { JobPayload } from './types';

// Clear orphaned 'processing' rows from a previous worker that died mid-run,
// before this one starts consuming — otherwise they linger as ghosts forever.
reconcileStalledJobs()
  .then((rows) => {
    if (rows.length) {
      console.log(`Reconciled ${rows.length} stalled job(s): ${rows.map((r) => `${r.platform}/${r.upload_id}`).join(', ')}`);
    }
  })
  .catch((err) => console.error('Stalled-job reconciliation failed:', err));

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
  // A job killed mid-run (stall) never reaches its handler's catch, so its DB row
  // would stay 'processing'. Persist the failure here once retries are exhausted
  // (or on a stall) so the UI shows it as failed + retryable.
  const attempts = job?.opts?.attempts ?? 1;
  const exhausted = (job?.attemptsMade ?? 0) >= attempts;
  const stalled = err.message.toLowerCase().includes('stalled');
  if (job?.data?.jobId && (exhausted || stalled)) {
    setJobStatus(job.data.jobId, 'failed', { error: err.message }).catch((e) =>
      console.error('Failed to persist job failure:', e)
    );
  }
});

console.log('Worker started');
