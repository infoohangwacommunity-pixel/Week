#!/usr/bin/env node
/**
 * WaxPrep - HTTP Server Entry Point
 */

import express from 'express';
import helmet from 'helmet';
import { randomUUID } from 'crypto';
import config, { logSafeConfig } from './config/index.js';
import { logger, runWithContext } from './observability/index.js';
import { createPool } from './db/index.js';
import { registerGlobalErrorHandlers, registerGracefulShutdown } from './errors/index.js';
import healthRoutes from './health/routes.js';
import webhookRouter from './webhook/router.js';

logger.info({ config: logSafeConfig() }, 'Configuration loaded');

const pool = await createPool(config);
logger.info({ max: config.DATABASE_POOL_MAX }, 'Database pool created');

registerGlobalErrorHandlers(logger);
// The shutdown handler is registered after the HTTP server is listening so
// it can also close the server cleanly.
let shutdownHandler = null;

const app = express();
app.set('dbPool', pool);

// Security middleware: Helmet.js (FIRST middleware)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://*.facebook.com', 'https://*.whatsapp.com'],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  dnsPrefetchControl: { allow: true },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: "none" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true,
}));

// Trust proxy: Railway runs behind a proxy, so req.ip needs proxy support.
app.set('trust proxy', 1);

// Raw body middleware must come BEFORE json middleware for webhook
// Raw body for all requests - webhook needs Buffer, JSON can be parsed manually
app.use(express.raw({ limit: '1mb', type: 'application/json' }));

app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] ?? randomUUID();
  runWithContext({ correlationId, service: 'webhook' }, () => {
    req.correlationId = correlationId;
    next();
  });
});

app.use((req, res, next) => {
  const log = logger.child({ method: req.method, url: req.url, correlationId: req.correlationId });
  log.info('Request received');
  next();
});

app.use('/health', healthRoutes);
app.use('/webhook/whatsapp', webhookRouter);

app.get('/', (req, res) => {
  const log = logger.child({ path: '/' });
  log.info('Root endpoint accessed');
  res.json({ status: 'ok', service: 'waxprep-webhook', version: '0.1.0', health: '/health' });
});

app.use((req, res) => {
  const log = logger.child({ path: req.path });
  log.warn('404 - Endpoint not found');
  res.status(404).json({ error: 'Not found', path: req.path });
});

app.use((err, req, res, next) => {
  const log = logger.child({ error: err.message, correlationId: req.correlationId });
  log.error({ err }, 'Unhandled error in Express app');
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = config.PORT;

try {
  await pool.query('SELECT 1');
  logger.info('Database connection verified');
} catch (err) {
  logger.fatal({ err }, 'Database connection failed at startup');
  process.exit(1);
}

const server = app.listen(PORT, () => {
  logger.info({ port: PORT, env: config.NODE_ENV }, 'Webhook server started');
});

// Register graceful shutdown now that `server` exists.
registerGracefulShutdown({
  logger,
  pool,
  server,
  shutdownTimeoutMs: config.WORKER_SHUTDOWN_TIMEOUT_MS,
});

export default { app, server, pool };
