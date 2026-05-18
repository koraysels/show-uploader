import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env';

export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY ?? '',
    secretAccessKey: env.S3_SECRET_KEY ?? '',
  },
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
  return getSignedUrl(s3, command, { expiresIn: 3600 * 6 }); // 6 hours
}
