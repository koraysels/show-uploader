import postgres from 'postgres';
import { env } from '../env';

export const db = postgres(env.DATABASE_URL, {
  ssl: 'require',
  max: 10,
});
