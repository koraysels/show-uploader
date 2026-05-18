import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_BUCKET: z.string(),
  S3_REGION: z.string().default('us-east-1'),
  SHOWS_API_URL: z.string().url(),
  SHOWS_API_TOKEN: z.string(),
  GROQ_API_KEY: z.string(),
  JINGLE_S3_KEY: z.string().optional(),
  PORT: z.string().default('3000'),
  NODE_ENV: z.string().default('development'),
});

export const env = schema.parse(process.env);
