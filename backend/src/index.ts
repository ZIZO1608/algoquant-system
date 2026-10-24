import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app.js';
import { config, corsOriginCallback } from './config/index.js';
import { disconnectPrisma } from './lib/prisma.js';
import { setSocketIO } from './lib/socket.js';
import { setupSocketAuth } from './services/chat.service.js';
import { ensureWebhookSettings } from './services/webhook.service.js';
import { startScheduler } from './jobs/scheduler.js';
import { startSiteChatSync } from './services/site-chat-sync.service.js';

const app = createApp();
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: { origin: corsOriginCallback, credentials: true },
});
setSocketIO(io);
setupSocketAuth(io);

async function bootstrap() {
  await ensureWebhookSettings();
  startScheduler();
  startSiteChatSync();
}

bootstrap().catch(console.error);

server.listen(config.port, () => {
  console.log(`Algo Quant API running on port ${config.port} [${config.env}]`);
});

process.on('SIGTERM', async () => {
  await disconnectPrisma();
  server.close();
});

export { app, server, io };
