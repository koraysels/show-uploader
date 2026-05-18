import { Router } from 'express';
import { QueueEvents } from 'bullmq';
import { redis, QUEUE_NAME } from '../queue';

export const eventsRouter = Router();

eventsRouter.get('/:id/events', (req, res) => {
  const uploadId = req.params.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const queueEvents = new QueueEvents(QUEUE_NAME, { connection: redis });

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const onProgress = ({ data }: { jobId: string; data: unknown }) => {
    const progress = data as { uploadId?: string; platform?: string; pct?: number };
    if (progress.uploadId === uploadId) {
      send({ type: 'progress', platform: progress.platform, pct: progress.pct });
    }
  };

  const onCompleted = ({ returnvalue }: { jobId: string; returnvalue: string }) => {
    try {
      const result = JSON.parse(returnvalue || '{}') as {
        uploadId?: string;
        platform?: string;
        url?: string;
      };
      if (result.uploadId === uploadId) {
        send({ type: 'completed', platform: result.platform, url: result.url });
      }
    } catch { /* ignore malformed returnvalue */ }
  };

  const onFailed = ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
    send({ type: 'failed', jobId, error: failedReason });
  };

  queueEvents.on('progress', onProgress);
  queueEvents.on('completed', onCompleted);
  queueEvents.on('failed', onFailed);

  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    void queueEvents.close();
  });
});
