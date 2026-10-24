# Algo Quant Backend — Deployment & Ops

## Environments

| Env | Config |
|-----|--------|
| local | `backend/.env` from `.env.example` |
| staging | Set `NODE_ENV=staging`, use staging DB/Redis/S3 |
| production | Set `NODE_ENV=production`, secrets via env/secrets manager |

## Database Backups

### Automated (recommended)

Add a cron job on the server:

```bash
# Daily at 3am — backup to /backups
0 3 * * * pg_dump $DATABASE_URL | gzip > /backups/algo_$(date +\%Y\%m\%d).sql.gz
```

### Restore

```bash
gunzip -c /backups/algo_20260709.sql.gz | psql $DATABASE_URL
```

## Local Development

```bash
docker compose up -d          # PostgreSQL, Redis, MinIO
cd backend
cp .env.example .env
npm install
npm run db:push
npm run db:seed
npm run dev
```

Default admin: `admin@algoquant.local` / `Admin123!`

## Webhook URL

Prefer sending the shared secret in a header (avoids proxy/CDN access-log exposure):

```
GET /api/v1/webhooks/leads/inbound?external_lead_id=...&full_name=...&phone=...
Header: X-Webhook-Token: SECRET
```

Also accepted: `Authorization: Bearer SECRET`.

Query `?token=SECRET` remains supported for backward compatibility with existing bot configs:

```
GET /api/v1/webhooks/leads/inbound?token=SECRET&external_lead_id=...&full_name=...&phone=...
```

Rotate secret from Settings → Webhook or `POST /api/v1/settings/webhook/rotate-secret`.

## Critical Test Suites

```bash
cd backend && npm test              # alias for test:unit — no database required
cd backend && npm run test:unit
cd backend && npm run test:integration
```

- **Unit** (`test` / `test:unit`): `money.test.ts`, `wallet.test.ts`, `privileges.test.ts`, `webhook.test.ts` — pure helpers, no Postgres.
- **Integration** (`test:integration`): `*.integration.test.ts` via [`vitest.integration.config.ts`](vitest.integration.config.ts) — requires `.env.test` (see `.env.test.example`) and a reachable Postgres database (`algo_quant_test`). Create it with `npx tsx scripts/create-test-db.ts` then `DATABASE_URL=...algo_quant_test npx prisma db push`.

Unit coverage:

- `tests/money.test.ts` — minor unit math
- `tests/privileges.test.ts` — RBAC + state machines
- `tests/webhook.test.ts` — bot field parsing
- `tests/wallet.test.ts` — payment/refund logic
