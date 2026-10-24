# Algo Quant in one container: the API serves the built web app, the live socket and
# uploaded files. Needs only a PostgreSQL DATABASE_URL (e.g. a Coolify PostgreSQL resource).
# Mount a persistent volume at /app/uploads so uploaded files survive redeploys.

# 1. Build the web app
FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

# 2. Build and run the API
FROM node:22-bookworm-slim

# Prisma's query engine needs OpenSSL at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dev dependencies stay installed: tsx runs the seed scripts on first start.
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/prisma ./prisma
RUN npx prisma generate

COPY backend/tsconfig.json ./
COPY backend/src ./src
COPY backend/scripts ./scripts
RUN npm run build

COPY --from=web /web/dist ./public
RUN mkdir -p /app/uploads

ENV NODE_ENV=production \
    PORT=3001 \
    STATIC_DIR=/app/public \
    STORAGE_DIR=/app/uploads \
    TRUST_PROXY_HOPS=1

EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "scripts/docker-start.sh"]
