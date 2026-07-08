import { env } from '../env';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A value is a placeholder if it's empty or still the .env.example stub (your-...).
function isRealCred(value: string | undefined): boolean {
  return !!value && !value.startsWith('your-');
}

/**
 * Decide whether a platform upload should be simulated instead of really
 * published. 'auto' (default) simulates only when creds look like placeholders,
 * so the full pipeline runs end-to-end for testing; adding real creds flips it
 * to real uploads with no config change. 'true'/'false' force the behaviour.
 */
export function shouldDryRun(creds: (string | undefined)[]): boolean {
  if (env.PUBLISH_DRY_RUN === 'true') return true;
  if (env.PUBLISH_DRY_RUN === 'false') return false;
  return !creds.every(isRealCred);
}

// Fake a plausible upload, reporting progress so the UI's live bar advances.
export async function simulateUpload(
  platform: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  console.log(`[dry-run] simulating ${platform} upload (no real publish)`);
  for (const pct of [15, 40, 70, 90, 100]) {
    onProgress?.(pct);
    await sleep(400);
  }
}
