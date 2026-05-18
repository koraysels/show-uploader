import { z } from 'zod';

const schema = z.object({
  DATABASE_URI: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  SHOWS_API_URL: z.string().url(),
  SHOWS_API_KEY: z.string(),
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_REFRESH_TOKEN: z.string().optional(),
  MIXCLOUD_ACCESS_TOKEN: z.string().optional(),
  ARCHIVE_VIDEO_BITRATE: z.string().default('4000k'),
  ARCHIVE_AUDIO_BITRATE: z.string().default('256k'),
  JINGLE_S3_KEY: z.string().optional(),
});

export const env = schema.parse(process.env);
