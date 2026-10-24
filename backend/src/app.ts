import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, corsOriginCallback } from './config/index.js';
import apiRoutes from './routes/index.js';
import { errorHandler, jsonSerializer } from './middleware/error.middleware.js';
import { paramsMiddleware } from './middleware/params.middleware.js';

export function createApp() {
  const app = express();

  if (config.env === 'production') {
    // Number of proxies in front of the API (2 on Coolify: Traefik, then the web nginx).
    app.set('trust proxy', config.trustProxyHops);
  }

  app.use(helmet());
  app.use(cors({ origin: corsOriginCallback, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(paramsMiddleware);
  app.use(jsonSerializer);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', env: config.env });
  });

  app.use('/api/v1', apiRoutes);

  app.use(errorHandler);

  return app;
}
