import { createApp } from './app';
import { env } from './env';
import { db } from './db/client';
import { runMigrations } from './db/migrate';

async function main() {
  await runMigrations(db);
  const app = createApp();
  app.listen(Number(env.PORT), () => {
    console.log(`API listening on port ${env.PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start API:', err);
  process.exit(1);
});
