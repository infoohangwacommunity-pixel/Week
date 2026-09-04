#!/usr/bin/env node
/**
 * WaxPrep - HTTP Server Entry Point
 * 
 * This is the main entry point for the webhook HTTP server.
 * It loads configuration, sets up the Express app, and starts listening.
 */

import express from 'express';
import { randomUUID } from 'crypto';
import config from './config/index.js';
import { logger, runWithContext } from './observability/index.js';
import { createPool } from './db/index.js';
import { registerGlobalErrorHandlers, registerGracefulShutdown } from './errors/index.js';
import healthRoutes from './health/routes.js';

// Load configuration first - this validates all environment variables
logger.info({ config: config.logSafeConfig() }, 'Configuration loaded');

// Create database pool
const pool = await createPool(config);
logger.info({ max: config.DATABASE_POOL_MAX }, 'Database pool created');

// Register global error handlers (before any other code)
registerGlobalErrorHandlers(logger);

// Register graceful shutdown handler
registerGracefulShutdown({ logger, pool });

// Create Express app
const app = express();

// Store pool reference for health checks
app.set('dbPool', pool);

// Middleware: Parse JSON bodies
app.use(express.json({ limit: '1mb' }));

// Middleware: Parse raw body for WhatsApp webhook signature verification
app.use(express.raw({ limit: '1mb', type: 'application/json' }));

// Middleware: Correlation ID context
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] ?? randomUUID();
  runWithContext({ correlationId, service: 'webhook' }, () => {
    req.correlationId = correlationId;
    next();
  });
});

// Middleware: Log requests
app.use((req, res, next) => {
  const log = logger.child({ 
    method: req.method, 
    url: req.url,
    correlationId: req.correlationId,
  });
  log.info('Request received');
  next();
});

// Routes
app.use('/health', healthRoutes);

// Root endpoint
app.get('/', (req, res) => {
  const log = logger.child({ path: '/' });
  log.info('Root endpoint accessed');
  res.json({ 
    status: 'ok', 
    service: 'waxprep-webhook',
    version: '0.1.0',
    health: '/health',
  });
});

// 404 handler
app.use((req, res) => {
  const log = logger.child({ path: req.path });
  log.warn('404 - Endpoint not found');
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  const log = logger.child({ 
    error: err.message,
    correlationId: req.correlationId, 
  });
  log.error({ err }, 'Unhandled error in Express app');
  res.status(500).json({ error: 'Internal server error' });
});

// Start server

const PORT = config.PORT;

// Startup validation - verify database connection before listening
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

export default { app, server, pool };
