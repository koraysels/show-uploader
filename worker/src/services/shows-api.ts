import { env } from '../env';

export async function writeBackUrls(
  showId: string,
  uploads: { youtube?: string; mixcloud?: string }
): Promise<void> {
  const res = await fetch(`${env.SHOWS_API_URL}/shows/${showId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${env.SHOWS_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uploads }),
  });
  if (!res.ok) {
    console.error(`Failed to write back URLs to shows API: ${res.status}`);
  }
}
