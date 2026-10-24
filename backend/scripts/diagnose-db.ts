/**
 * DB connection diagnostic — run: npm run db:diagnose
 */
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

function log(label: string, data: Record<string, unknown>) {
  console.log(`[${label}]`, JSON.stringify(data));
}

async function tryConnect(label: string, url: string) {
  const parsed = new URL(url.replace('postgresql://', 'http://'));
  log(label, {
    action: 'attempt',
    host: parsed.hostname,
    port: parsed.port || '5432',
    user: parsed.username,
    database: parsed.pathname.slice(1).split('?')[0],
  });

  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    await client.$connect();
    await client.$queryRaw`SELECT 1 as ok`;
    log(label, { result: 'success', user: parsed.username });
    await client.$disconnect();
    return true;
  } catch (err) {
    const e = err as { message?: string };
    const errorType = e.message?.includes('Authentication failed')
      ? 'P1000_auth'
      : e.message?.includes("Can't reach")
        ? 'P1001_unreachable'
        : 'other';
    log(label, {
      result: 'failed',
      user: parsed.username,
      errorType,
      message: e.message?.slice(0, 120),
    });
    await client.$disconnect().catch(() => {});
    return false;
  }
}

async function main() {
  const configured = process.env.DATABASE_URL ?? '';
  if (!configured) {
    console.error('DATABASE_URL is not set in .env');
    process.exit(1);
  }

  const parsed = new URL(configured.replace('postgresql://', 'http://'));
  log('env', { user: parsed.username, host: parsed.hostname });

  await tryConnect('configured', configured);
  await tryConnect('postgres_postgres', configured.replace(/\/\/[^:]+:[^@]+@/, '//postgres:postgres@'));

  console.log('\nIf configured failed but postgres_postgres succeeded, update DATABASE_URL user/password in .env');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
