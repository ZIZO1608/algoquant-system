import { PrismaClient } from '@prisma/client';

async function main() {
  const client = new PrismaClient({
    datasources: { db: { url: 'postgresql://postgres:postgres@localhost:5432/postgres' } },
  });
  await client.$connect();
  try {
    await client.$executeRawUnsafe('CREATE DATABASE algo_quant_test');
    console.log('Database algo_quant_test created.');
  } catch (err) {
    const msg = String(err);
    if (msg.includes('already exists')) {
      console.log('Database algo_quant_test already exists.');
    } else {
      throw err;
    }
  } finally {
    await client.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
