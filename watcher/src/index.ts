import chokidar from 'chokidar';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const env = z.object({
  WATCH_FOLDER: z.string(),
  S3_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_BUCKET: z.string(),
  S3_REGION: z.string().default('us-east-1'),
  API_URL: z.string().url(),
  API_KEY: z.string(),
}).parse(process.env);

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  forcePathStyle: true,
});

const VIDEO_EXTENSIONS = new Set(['.mkv', '.mp4', '.mov', '.avi']);
const STABLE_WAIT_MS = 20_000; // 20s of no size change = recording finished
const POLL_INTERVAL_MS = 5_000;

const pending = new Map<string, { size: number; timer: ReturnType<typeof setTimeout> }>();

async function uploadAndNotify(filePath: string) {
  const filename = path.basename(filePath);
  const key = `incoming/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const stat = fs.statSync(filePath);

  console.log(`Uploading ${filename} (${(stat.size / 1e9).toFixed(2)} GB) → S3...`);

  await s3.send(new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    Body: fs.createReadStream(filePath),
    ContentLength: stat.size,
    ContentType: 'video/x-matroska',
  }));

  console.log(`Uploaded → ${key}`);

  // Notify the cloud API so the file appears pre-staged in the UI
  await fetch(`${env.API_URL}/api/watcher/notify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.API_KEY}`,
    },
    body: JSON.stringify({ key, filename, sizeBytes: stat.size }),
  }).catch((err: Error) => console.error('API notify failed:', err.message));

  console.log(`Done: ${filename}`);
}

function scheduleUpload(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(ext)) return;

  const check = () => {
    let size: number;
    try {
      size = fs.statSync(filePath).size;
    } catch {
      pending.delete(filePath);
      return;
    }

    const prev = pending.get(filePath);
    if (prev && prev.size === size) {
      // File has been stable — upload it
      pending.delete(filePath);
      uploadAndNotify(filePath).catch((err: Error) =>
        console.error(`Upload failed for ${filePath}:`, err.message)
      );
    } else {
      // Still changing — keep polling
      pending.set(filePath, {
        size,
        timer: setTimeout(check, POLL_INTERVAL_MS),
      });
    }
  };

  // Initial entry
  const size = (() => { try { return fs.statSync(filePath).size; } catch { return 0; } })();
  const existing = pending.get(filePath);
  if (existing) clearTimeout(existing.timer);
  pending.set(filePath, { size, timer: setTimeout(check, STABLE_WAIT_MS) });
  console.log(`Watching: ${path.basename(filePath)}`);
}

const watcher = chokidar.watch(env.WATCH_FOLDER, {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: false,
  depth: 0,
});

watcher
  .on('add', scheduleUpload)
  .on('change', scheduleUpload)
  .on('error', (err) => console.error('Watcher error:', err));

console.log(`Watching ${env.WATCH_FOLDER} for new video files...`);
