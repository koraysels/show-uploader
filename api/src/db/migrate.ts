import fs from 'fs';
import path from 'path';
import type { Sql } from 'postgres';

export async function runMigrations(db: Sql) {
  await db`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      ran_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  for (const file of files) {
    const [ran] = await db`
      SELECT filename FROM schema_migrations WHERE filename = ${file}
    `;
    if (ran) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await db.unsafe(sql);
    await db`INSERT INTO schema_migrations (filename) VALUES (${file})`;
    console.log(`Migration applied: ${file}`);
  }
}
