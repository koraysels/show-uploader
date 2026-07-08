import FormData from 'form-data';
import fs from 'fs';
import { env } from '../env';
import { shouldDryRun, simulateUpload } from './dry-run';

type MixcloudResponse = {
  key?: string;
  error?: { message: string };
};

export async function uploadToMixcloud(params: {
  audioPath: string;
  title: string;
  description: string;
  tags: string[];
  imagePath?: string;
}): Promise<string> {
  if (shouldDryRun([env.MIXCLOUD_ACCESS_TOKEN])) {
    await simulateUpload('mixcloud');
    return `https://www.mixcloud.com/dryrun-${Date.now().toString(36)}/`;
  }
  const form = new FormData();
  form.append('mp3', fs.createReadStream(params.audioPath));
  form.append('name', params.title);
  form.append('description', params.description);
  params.tags.slice(0, 5).forEach((tag, i) => {
    form.append(`tags-${i}-tag`, tag);
  });
  if (params.imagePath && fs.existsSync(params.imagePath)) {
    form.append('picture', fs.createReadStream(params.imagePath));
  }

  const res = await fetch(
    `https://api.mixcloud.com/me/cloudcast/?access_token=${env.MIXCLOUD_ACCESS_TOKEN}`,
    {
      method: 'POST',
      body: form as unknown as BodyInit,
      headers: form.getHeaders() as Record<string, string>,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MixCloud upload failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as MixcloudResponse;
  if (data.error) throw new Error(`MixCloud error: ${data.error.message}`);
  if (!data.key) throw new Error('MixCloud returned no key');

  return `https://www.mixcloud.com${data.key}`;
}
