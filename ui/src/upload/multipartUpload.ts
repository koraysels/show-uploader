import { api } from '../api/client';
import {
  planParts,
  partsToUpload,
  progressFraction,
  backoffDelay,
  fileFingerprint,
  type PartPlan,
} from './multipartPlan';

const LS_PREFIX = 'mp:'; // localStorage key per file fingerprint

type SavedSession = { sessionId: string; key: string; partSize: number };

export type UploadProgress = {
  fraction: number;
  uploadedBytes: number;
  totalBytes: number;
};

export type UploadOptions = {
  concurrency?: number;
  maxRetries?: number;
  onProgress?: (p: UploadProgress) => void;
  signal?: AbortSignal;
};

function saveSession(fp: string, s: SavedSession) {
  try {
    localStorage.setItem(LS_PREFIX + fp, JSON.stringify(s));
  } catch { /* storage full / disabled — non-fatal, just no cross-reload resume */ }
}
function loadSession(fp: string): SavedSession | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + fp);
    return raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch {
    return null;
  }
}
function clearSession(fp: string) {
  try {
    localStorage.removeItem(LS_PREFIX + fp);
  } catch { /* ignore */ }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });

// PUT one part, re-presigning each attempt (handles URL expiry) with backoff.
async function putPart(
  sessionId: string,
  part: PartPlan,
  body: Blob,
  maxRetries: number,
  signal: AbortSignal
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const { url } = await api.mpPartUrl(sessionId, part.partNumber);
      const res = await fetch(url, { method: 'PUT', body, signal });
      if (!res.ok) throw new Error(`part ${part.partNumber} PUT ${res.status}`);
      return;
    } catch (err) {
      if (signal.aborted) throw err;
      lastErr = err;
      if (attempt < maxRetries) await sleep(backoffDelay(attempt), signal);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`part ${part.partNumber} failed`);
}

// Bounded-concurrency worker pool over the pending parts.
async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}

/**
 * Upload a file with S3 multipart, resuming a prior session for the same file if
 * one exists. Returns the final object key. Reliability: per-part retry with
 * backoff, bounded concurrency, server-authoritative resume, abort support.
 */
export async function uploadFileResumable(file: File, opts: UploadOptions = {}): Promise<{ key: string }> {
  const concurrency = opts.concurrency ?? 4;
  const maxRetries = opts.maxRetries ?? 5;
  const controller = new AbortController();
  const signal = opts.signal ?? controller.signal;

  const fp = fileFingerprint(file);
  const contentType = file.type || 'video/x-matroska';

  // Resume an existing session for this exact file, or start a new one.
  let session = loadSession(fp);
  let uploaded: { partNumber: number; size: number }[] = [];
  if (session) {
    try {
      const status = await api.mpStatus(session.sessionId);
      if (status.status === 'in_progress' && status.size === file.size) {
        uploaded = status.uploadedParts;
      } else {
        session = null;
      }
    } catch {
      session = null;
    }
  }
  if (!session) {
    const created = await api.mpCreate(file.name, contentType, file.size);
    session = { sessionId: created.sessionId, key: created.key, partSize: created.partSize };
    saveSession(fp, session);
    uploaded = [];
  }

  const plan = planParts(file.size, session.partSize);
  const pending = partsToUpload(plan, uploaded);
  const uploadedSet = new Map(uploaded.map((p) => [p.partNumber, p.size]));

  const report = () =>
    opts.onProgress?.({
      fraction: progressFraction(file.size, [...uploadedSet.entries()].map(([, size]) => ({ size }))),
      uploadedBytes: [...uploadedSet.values()].reduce((s, n) => s + n, 0),
      totalBytes: file.size,
    });
  report();

  try {
    await runPool(pending, concurrency, async (part) => {
      await putPart(session!.sessionId, part, file.slice(part.start, part.end), maxRetries, signal);
      uploadedSet.set(part.partNumber, part.size);
      report();
    });

    const { key } = await api.mpComplete(session.sessionId);
    clearSession(fp);
    return { key };
  } catch (err) {
    // On explicit abort, tell the server to release the multipart upload.
    if (signal.aborted) {
      await api.mpAbort(session.sessionId).catch(() => {});
      clearSession(fp);
    }
    throw err;
  }
}
