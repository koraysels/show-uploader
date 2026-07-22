import { z } from 'zod';

const schema = z.object({
  DATABASE_URI: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  // Our own api (same compose network) + its shared internal key, used to write
  // the published result back onto the PocketBase archive record via the api's
  // superuser. Defaults to the in-network service address.
  INTERNAL_API_URL: z.string().url().default('http://api:3000/api'),
  WATCHER_API_KEY: z.string().default('change-me'),
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_REFRESH_TOKEN: z.string().optional(),
  YOUTUBE_PRIVACY_STATUS: z.enum(['public', 'unlisted', 'private']).default('unlisted'),
  // 'auto' = dry-run only when platform creds are missing/placeholder; 'true'/'false' force it.
  PUBLISH_DRY_RUN: z.enum(['auto', 'true', 'false']).default('auto'),
  MIXCLOUD_ACCESS_TOKEN: z.string().optional(),
  // PocketBase file URLs are built with the PUBLIC host (agenda.coming-soon.space),
  // unreachable from inside the box (NAT hairpin). To fetch a record's cover image
  // for the MixCloud upload we rewrite that base to the INTERNAL host. Both come
  // from the compose env; when unset the cover fetch just uses the URL as-is.
  POCKETBASE_URL: z.string().url().optional(),
  POCKETBASE_INTERNAL_URL: z.string().url().optional(),
  ARCHIVE_VIDEO_BITRATE: z.string().default('4000k'),
  ARCHIVE_AUDIO_BITRATE: z.string().default('256k'),
  JINGLE_S3_KEY: z.string().optional(),
});

export const env = schema.parse(process.env);
