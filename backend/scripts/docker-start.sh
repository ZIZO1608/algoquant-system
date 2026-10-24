#!/bin/sh
# Container entrypoint: sync the schema, seed an empty database once, then run the API.
set -e

# No --accept-data-loss: a destructive schema change stops the deploy instead of dropping data.
npx prisma db push --skip-generate

employees=$(node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.employee.count().then((n) => { console.log(n); return prisma.\$disconnect(); });
")

if [ "$employees" = "0" ]; then
  echo "Empty database: seeding base data"
  npx tsx prisma/seed.ts
  if [ "$SEED_DEMO" = "true" ]; then
    echo "Seeding demo data"
    npx tsx prisma/seed-demo.ts
  fi
fi

exec node dist/index.js
