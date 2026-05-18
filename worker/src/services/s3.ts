import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
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

export async function downloadFromS3(key: string, destPath: string): Promise<void> {
  const cmd = new GetObjectCommand({ Bucket: (env.S3_BUCKET ?? ''), Key: key });
  const { Body } = await s3.send(cmd);
  if (!Body) throw new Error(`Empty body for S3 key: ${key}`);

  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const readable = Body as Readable;
    const writer = fs.createWriteStream(destPath);
    readable.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
    readable.on('error', reject);
  });
}

export async function uploadToS3(localPath: string, key: string, contentType: string): Promise<void> {
  const stat = await fs.promises.stat(localPath);
  await s3.send(
    new PutObjectCommand({
      Bucket: (env.S3_BUCKET ?? ''),
      Key: key,
      Body: fs.createReadStream(localPath),
      ContentType: contentType,
      ContentLength: stat.size,
    })
  );
}

export async function deleteFromS3(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: (env.S3_BUCKET ?? ''), Key: key }));
}
