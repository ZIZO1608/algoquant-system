# Algo Quant — Academy ERP/CRM

Full-stack management system for the Algo Quant training academy.

## Stack

- **Frontend:** React 19 + Vite (RTL Arabic)
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL + Prisma ORM
- **Realtime:** Socket.io (notifications + chat)
- **Storage:** S3-compatible (MinIO locally)

## One-click local run (Windows)

Double-click **Algo Quant.exe** to open the control panel, then press **Start**. The first start takes a few
minutes: it installs dependencies, downloads an embedded PostgreSQL 17 into `.local/` (nothing is installed
system-wide), applies the schema and seeds the demo data. Later starts take a few seconds. Node.js is required.

The control panel has:

- **Start / Stop** for the database, the API and the web app, with a live status for each
- the links: `http://localhost:5173` on this laptop, and a Wi-Fi link for phones and other laptops, each with Open and Copy
- a **QR code** that opens the Wi-Fi link on a phone
- the sign-in accounts below (click an email or password to copy it) and live activity from all three services
- **Reset demo data**, **Open project folder** and **Open activity log**

| Account | Email | Password |
|---|---|---|
| Admin | admin@algoquant.local | Admin123! |
| Sales | reem.sales@algoquant.local | Demo@123 |
| Media | karim.media@algoquant.local | Demo@123 |
| Operations | sara.ops@algoquant.local | Demo@123 |
| Accounting | fadi.finance@algoquant.local | Demo@123 |
| Instructor | omar.instructor@algoquant.local | Demo@123 |

- Closing the panel while Algo Quant runs asks whether to stop it or keep it running in the background.
  Opening the panel again picks up whatever is running, including a start from `npm run local` or the .bat files.
- Without the panel: `npm run local` (or start-local.bat) starts everything in a console, `npm run local:stop`
  (or stop-local.bat) stops it, and reset-local-data.bat wipes the local database and re-seeds it.
- Rebuild the panel with `npm run build:exe` (uses the C# compiler that ships with Windows, nothing to install).
- Starting twice is safe: the second start notices the first and leaves it running.
- If a server or the database stops unexpectedly, the launcher restarts it and records why in `.local/launcher.log`.
- `node scripts/dev-local.mjs --no-demo` seeds only the base data; `--no-open` skips opening the browser.
- File uploads need an S3-compatible store (MinIO); everything else works offline.
- Design system reference: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).


### Open it from a phone or another laptop (same Wi-Fi)

Scan the QR code in the control panel, or open its Wi-Fi link (for example `http://192.168.1.20:5173`).
Windows Firewall blocks other devices by default. When it does, the panel shows **Allow Wi-Fi access**: press it
and approve the administrator prompt. This runs **allow-wifi-access.bat**, which you can also run yourself
(right-click → Run as administrator). If Windows treats the Wi-Fi as *Public*, the script offers to mark it *Private*.
`node scripts/dev-local.mjs --no-lan` keeps the app on this laptop only.

## Manual setup

> **After unzipping:** dependencies are not included. Run `npm install` in the project root and in `backend/` before starting.

### 1. Infrastructure (optional — Docker)

```bash
docker compose up -d
```

Starts PostgreSQL (5432), Redis (6379), MinIO (9000). Skip if you already have PostgreSQL installed locally.

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
```

**Docker PostgreSQL** — use default `.env` (`algo/algo`), then:
```bash
npm run db:push && npm run db:seed && npm run dev
```

**Local Windows PostgreSQL** — update `DATABASE_URL` in `.env` to your postgres user/password, then:
```bash
npm run db:setup
npm run dev
```

If `db:push` fails with P1000 auth error, run `npm run db:diagnose` to find working credentials.

API: http://localhost:3001  
Default admin: `admin@algoquant.local` / `Admin123!`

### 3. Frontend

```bash
npm install
npm run dev
```

UI: http://localhost:5173

## Features

- Multi-privilege RBAC (Admin, Sales, Media, Operation, Instructor, Accountant)
- CRM with 6 lead sources + bot webhook (`GET /api/v1/webhooks/leads/inbound`)
- Course task path templates with auto-generation
- Wallets, payroll, expenses, P&L
- Student enrollments, installments, attendance, magic-link evaluations
- Internal chat + real-time notifications
- Website chats: every algoquant.vip bot conversation, live, for all staff ([docs/SITE_CHATS.md](docs/SITE_CHATS.md))
- Reports including lead demand from bot `extra_data`

## Tests

```bash
cd backend && npm test
```

## Docs

- [docs/USER_GUIDE.html](docs/USER_GUIDE.html) — Arabic user guide for the academy owner and staff (setup, roles, day-to-day usage per module).
- [backend/docs/OPS.md](backend/docs/OPS.md) — backups, environments, and webhook setup.
- [docs/SITE_CHATS.md](docs/SITE_CHATS.md) — how website bot conversations reach the system, and how to connect the Lovable site.
