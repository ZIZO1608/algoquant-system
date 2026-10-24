/**
 * Creates algo_quant database — run: npx tsx scripts/create-db.ts
 */
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function main() {
  const base = process.env.DATABASE_URL ?? '';
  if (!base) {
    console.error('DATABASE_URL is not set in .env');
    process.exit(1);
  }

  const adminUrl = base.includes('algo:algo@')
    ? base.replace('algo:algo@', 'postgres:postgres@').replace('/algo_quant', '/postgres')
    : base.replace(/\/[^/?]+(\?|$)/, '/postgres$1');

  const client = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  await client.$connect();

  try {
    await client.$executeRawUnsafe('CREATE DATABASE algo_quant');
    console.log('Database algo_quant created.');
  } catch (err) {
    const msg = String(err);
    if (msg.includes('already exists')) {
      console.log('Database algo_quant already exists.');
    } else {
      throw err;
    }
  } finally {
    await client.$disconnect();
  }
}

main().catch((err) => {
  console.error('Failed to create database:', err instanceof Error ? err.message : err);
  process.exit(1);
});
