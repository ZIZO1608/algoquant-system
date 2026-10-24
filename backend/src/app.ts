import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import { config, corsOriginCallback } from './config/index.js';
import apiRoutes from './routes/index.js';
import { errorHandler, jsonSerializer } from './middleware/error.middleware.js';
import { paramsMiddleware } from './middleware/params.middleware.js';

export function createApp() {
  const app = express();

  if (config.env === 'production') {
    // Number of proxies in front of the API: 1 behind Coolify's Traefik, 2 with the nginx web container in front.
    app.set('trust proxy', config.trustProxyHops);
  }

  // No CSP: the web app uses an inline theme script and Google Fonts.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: corsOriginCallback, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(paramsMiddleware);
  app.use(jsonSerializer);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', env: config.env });
  });

  app.use('/api/v1', apiRoutes);

  // Single-container deploys serve the built web app; unknown paths fall back to the SPA.
  if (config.staticDir) {
    const staticDir = path.resolve(config.staticDir);
    app.use(
      '/assets',
      express.static(path.join(staticDir, 'assets'), { immutable: true, maxAge: '1y' })
    );
    app.use(express.static(staticDir, { index: false }));
    app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  app.use(errorHandler);

  return app;
}
