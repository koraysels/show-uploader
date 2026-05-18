import postgres from 'postgres';
import { env } from '../env';

export const db = postgres(env.DATABASE_URI, {
  ssl: 'require',
  max: 10,
});
