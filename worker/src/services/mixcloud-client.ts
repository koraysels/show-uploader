import FormData from 'form-data';
import fs from 'fs';
import { env } from '../env';
import { shouldDryRun, simulateUpload } from './dry-run';

type MixcloudResponse = {
  key?: string;
  result?: { key?: string; success?: boolean; message?: string };
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

  const token = env.MIXCLOUD_ACCESS_TOKEN;
  // The upload endpoint is /upload/ — /me/cloudcast/ is retired and returns 405.
  const res = await fetch(`https://api.mixcloud.com/upload/?access_token=${token}`, {
    method: 'POST',
    body: form as unknown as BodyInit,
    headers: form.getHeaders() as Record<string, string>,
  });

  if (!res.ok) {
    throw new Error(`MixCloud upload failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as MixcloudResponse;
  if (data.error) throw new Error(`MixCloud error: ${data.error.message}`);

  const key = data.key ?? data.result?.key;
  if (key) return `https://www.mixcloud.com${key}`;

  // A successful upload often returns just {result:{success:true}} without the
  // new cloudcast's key — look up the most recent cloudcast to get its URL.
  try {
    const meRes = await fetch(`https://api.mixcloud.com/me/cloudcasts/?limit=1&access_token=${token}`);
    if (meRes.ok) {
      const me = (await meRes.json()) as { data?: { url?: string; key?: string }[] };
      const c = me.data?.[0];
      if (c?.url) return c.url;
      if (c?.key) return `https://www.mixcloud.com${c.key}`;
    }
  } catch {
    /* fall through to the account URL */
  }

  return 'https://www.mixcloud.com/';
}
