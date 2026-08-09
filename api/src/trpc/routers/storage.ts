import { router, protectedProcedure } from '../trpc';
import { bucketUsage, diskUsage, tempUsage } from '../../services/storage-usage';
import { env } from '../../env';

// Where the object store keeps its data on the host, bind-mounted read-only into
// the api purely so this page can report real figures. Unset/unmounted degrades
// to "unavailable" rather than failing.
const STORAGE_DISK = process.env.STORAGE_DISK_PATH ?? '/mnt/storage';
const TEMP_ROOT = process.env.WORKER_TEMP_ROOT ?? '/tmp/show-uploader';

export const storageRouter = router({
  /**
   * Everything the storage page shows, in one call.
   *
   * The bucket scan is the slow part (it lists every object), so this is
   * deliberately a single procedure the page polls slowly rather than several
   * the page would fan out on.
   */
  overview: protectedProcedure.query(async () => {
    const { prefixes, truncated } = await bucketUsage();
    return {
      disk: diskUsage(STORAGE_DISK),
      // The container's own filesystem — separate disk from the object store,
      // and the one that fills up if scratch is not cleaned.
      root: diskUsage('/'),
      temp: tempUsage(TEMP_ROOT),
      bucket: {
        name: env.S3_BUCKET ?? null,
        prefixes,
        truncated,
        bytes: prefixes.reduce((sum, p) => sum + p.bytes, 0),
        objects: prefixes.reduce((sum, p) => sum + p.objects, 0),
      },
    };
  }),
});
