import { Worker } from 'bullmq';
import { redis, QUEUE_NAME, PREVIEW_QUEUE_NAME } from './queue';
import { processYoutube } from './jobs/youtube';
import { processMixcloud } from './jobs/mixcloud';
import { processArchive } from './jobs/archive';
import { processPreview } from './jobs/preview';
import { reconcileStalledJobs, setJobStatus } from './db';
import { sweepWorkspaces } from './services/workspace';
import type { JobPayload, PreviewJobPayload } from './types';

// Reclaim scratch space a previous worker lost. A process killed mid-job never
// reaches its cleanup, orphaning multi-GB files with nothing to remove them —
// left alone that fills the disk. The age cutoff is what makes this safe to run
// at startup: a job running right now has a young directory and is never swept.
const TEMP_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const swept = sweepWorkspaces(TEMP_MAX_AGE_MS);
if (swept.removed) {
  console.log(`Swept ${swept.removed} orphaned workspace(s), reclaimed ${(swept.bytes / 1024 ** 3).toFixed(2)} GB`);
}

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

// Separate worker so a long preview remux never occupies a slot that a publish
// is waiting on. Concurrency 1: these are I/O-bound on the same disk, and two at
// once only makes both slower.
const previewWorker = new Worker<PreviewJobPayload>(
  PREVIEW_QUEUE_NAME,
  async (job) => {
    console.log(`Processing preview remux: ${job.data.videoS3Key}`);
    return processPreview(job);
  },
  { connection: redis, concurrency: 1 }
);

previewWorker.on('completed', (job) => {
  console.log(`Preview remux completed: ${job.data.videoS3Key}`);
});

// No DB row to mark failed — the API reports the failure straight from the
// queue, and the source recording is untouched, so retrying is just re-pressing
// preview.
previewWorker.on('failed', (job, err) => {
  console.error(`Preview remux failed: ${job?.data?.videoS3Key}`, err.message);
});

console.log('Worker started');
