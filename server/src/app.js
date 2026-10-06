import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { config } from './config.js';
import { logger } from './logger.js';
import { pool } from './db.js';
import { requireAdmin, requireSameOrigin } from './auth.js';
import { HttpError } from './lib/errors.js';
import authRoutes from './routes/auth.js';
import sourceRoutes from './routes/sources.js';
import templateRoutes from './routes/templates.js';
import scheduleRoutes from './routes/schedules.js';
import runRoutes from './routes/runs.js';
import auditRoutes from './routes/audit.js';
import inboxRoutes from './routes/inbox.js';
import dashboardRoutes from './routes/dashboard.js';
import settingsRoutes from './routes/settings.js';
import webhookRoutes from './routes/webhooks.js';

const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');

export function createApp() {
  const app = express();
  // Behind cloudflared on the same machine: trust the local proxy hop for req.ip
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }));
  app.use(pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === '/healthz' },
    customProps: (req) => ({ admin: req.admin?.email }),
    serializers: { req: (req) => ({ method: req.method, url: req.url }), res: (res) => ({ statusCode: res.statusCode }) },
  }));

  app.get('/healthz', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  // Webhooks: public, signature-verified, mounted before the JSON body parser
  app.use('/webhooks', rateLimit({ windowMs: 60_000, limit: 1200 }), webhookRoutes);

  const api = express.Router();
  api.use(express.json({ limit: '1mb' }));
  api.use(cookieParser());
  api.use(rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false }));
  api.use(requireSameOrigin);
  api.use('/auth', authRoutes);
  api.use(requireAdmin);
  api.use('/dashboard', dashboardRoutes);
  api.use('/sources', sourceRoutes);
  api.use('/templates', templateRoutes);
  api.use('/schedules', scheduleRoutes);
  api.use('/runs', runRoutes);
  api.use('/audit', auditRoutes);
  api.use('/inbox', inboxRoutes);
  api.use('/settings', settingsRoutes);
  api.use((_req, _res, next) => next(new HttpError(404, 'Not found')));
  app.use('/api', api);

  // Built React dashboard
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api|webhooks).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  app.use((err, req, res, _next) => {
    if (err?.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE') err = new HttpError(413, 'File is too large');
    if (err?.type === 'entity.parse.failed') err = new HttpError(400, 'Invalid JSON');
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) req.log.error({ err }, 'request failed');
    res.status(status).json({ error: status >= 500 && !(err instanceof HttpError) ? 'Internal server error' : err.message });
  });

  return app;
}
