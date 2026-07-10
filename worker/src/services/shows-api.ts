import { env } from '../env';

export type MediaLink = { label: string; type: string; url: string };

/**
 * Write the published result back onto the PocketBase archive record, via our
 * own api (which holds the PB superuser). Called once all platform uploads
 * succeed. Never sets `status` — a human publishes in the agenda admin.
 * Failures are logged, not thrown: the upload already succeeded, so a write-back
 * hiccup must not fail the job (the operator can still publish manually).
 */
export async function finalizeArchiveRecord(
  showId: string,
  patch: { title?: string; notes?: string; mediaLinks?: MediaLink[] }
): Promise<void> {
  try {
    const res = await fetch(`${env.INTERNAL_API_URL}/watcher/shows/${showId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${env.WATCHER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      console.error(`Archive write-back failed for ${showId}: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error(`Archive write-back error for ${showId}:`, err);
  }
}
