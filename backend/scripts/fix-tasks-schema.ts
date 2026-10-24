import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

async function main() {
  const sql = readFileSync(join(__dirname, 'fix-schema.sql'), 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt.endsWith(';') ? stmt : `${stmt};`);
      console.log('OK:', stmt.slice(0, 60).replace(/\s+/g, ' ') + '...');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists')) {
        console.log('SKIP (exists):', stmt.slice(0, 40));
      } else {
        console.error('FAIL:', msg);
      }
    }
  }

  const cols = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'deleted_at'
  `;
  console.log('tasks.deleted_at present:', cols.length > 0);

  const count = await prisma.$queryRaw<{ c: number }[]>`SELECT COUNT(*)::int as c FROM tasks`;
  console.log('total tasks in DB:', count[0]?.c ?? 0);

  const active = await prisma.$queryRaw<{ c: number }[]>`
    SELECT COUNT(*)::int as c FROM tasks WHERE deleted_at IS NULL
  `;
  console.log('active tasks (deleted_at IS NULL):', active[0]?.c ?? 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
