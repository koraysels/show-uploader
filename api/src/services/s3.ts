import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env';

const credentials = {
  accessKeyId: env.S3_ACCESS_KEY ?? '',
  secretAccessKey: env.S3_SECRET_KEY ?? '',
};

export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: env.S3_REGION,
  credentials,
  forcePathStyle: true,
});

// Separate client whose endpoint is the browser-reachable host, so presigned
// URLs handed to the UI resolve (the internal S3_ENDPOINT is a docker hostname).
const presignS3 = new S3Client({
  endpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: env.S3_REGION,
  credentials,
  forcePathStyle: true,
});

export async function createUploadPresignedUrl(key: string, contentType: string) {
  if (!env.S3_ENDPOINT || !env.S3_BUCKET) {
    throw new Error('S3 not configured (S3_ENDPOINT, S3_BUCKET required)');
  }
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(presignS3, command, { expiresIn: 3600 * 6 }); // 6 hours
}
