import { db } from '../db/client';
import { takeStagedUpload } from '../db/queries';
import { deleteObject } from './s3';

/**
 * Abandon a show's staged pick: delete the row and the S3 object it pointed
 * at. Shared by the tRPC procedure and the REST route, which otherwise
 * duplicated this logic verbatim.
 *
 * Deliberately distinct from the internal cleanup that runs right after a
 * successful publish (`deleteStagedUpload`, called directly from `create` in
 * both routers) — that path's staged key has just become
 * `show_uploads.video_s3_key` and must never be deleted here. This function is
 * only for the operator explicitly abandoning a pick via "replace".
 *
 * Best-effort: a failed S3 delete just leaves an orphan for the storage page
 * to surface later, which is strictly better than blocking the replace.
 */
export async function deleteStagedVideo(showId: string): Promise<void> {
  let key: string | null;
  try {
    key = await takeStagedUpload(db, showId);
  } catch {
    return; // no staged row for this show — nothing to clean up
  }
  if (!key) return;
  await deleteObject(key).catch((err) => console.error(`Failed to delete staged object ${key}:`, err));
}
