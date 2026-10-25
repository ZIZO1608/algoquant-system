#!/bin/sh
# Container entrypoint: sync the schema, seed once, then run the API.
set -e

# No --accept-data-loss: a destructive schema change stops the deploy instead of dropping data.
npx prisma db push --skip-generate

count_employees() {
  node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.employee.count($1).then((n) => { console.log(n); return prisma.\$disconnect(); });
"
}

if [ "$(count_employees)" = "0" ]; then
  echo "Empty database: seeding base data"
  npx tsx prisma/seed.ts
fi

# Demo data loads once (marked by the demo sales account), also into a database that
# already has its admin. A failure here must not keep the app from starting.
if [ "$SEED_DEMO" = "true" ] && \
   [ "$(count_employees "{ where: { email: 'reem.sales@algoquant.local' } }")" = "0" ]; then
  echo "Seeding demo data"
  npx tsx prisma/seed-demo.ts || echo "Demo seed failed; starting without demo data"
fi

exec node dist/index.js
