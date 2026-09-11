#!/usr/bin/env node
/**
 * WaxPrep - AI Worker Entry Point
 * 
 * This is the entry point for the BullMQ worker that processes AI tasks.
 * It connects to Redis, sets up queue consumers, and handles graceful shutdown.
 * Also includes a minimal health HTTP server for Railway health checks.
 */

import http from 'http';
import config, { logSafeConfig } from '../config/index.js';
import { logger } from '../observability/index.js';
import { createPool } from '../db/index.js';
import { createRedisClient } from '../queue/index.js';
import { registerGlobalErrorHandlers, registerGracefulShutdown } from '../errors/index.js';
import { setupWorkers } from './setup.js';

// Load configuration first
logger.info({ config: logSafeConfig() }, 'Configuration loaded');

// Create database pool
const pool = await createPool(config);
logger.info({ max: config.DATABASE_POOL_MAX }, 'Database pool created');

// Create Redis client
const redis = await createRedisClient(config);
logger.info('Redis client created');

// Register global error handlers
registerGlobalErrorHandlers(logger);

// Setup workers (BEFORE registering graceful shutdown so we can pass them in)
const workers = await setupWorkers({ redis, pool, logger });

logger.info({ concurrency: config.QUEUE_WORKER_CONCURRENCY }, 'Worker setup complete');

// Minimal health server for Railway health checks
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', worker: 'running' }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const healthPort = config.WORKER_HEALTH_PORT;
healthServer.listen(healthPort, () => {
  logger.info({ port: healthPort }, 'Worker health server started');
});

// Register graceful shutdown handler now that workers and healthServer exist.
// Order: stop HTTP → close workers → close redis → close pool.
registerGracefulShutdown({
  logger,
  pool,
  redis,
  workers,
  server: healthServer,
  shutdownTimeoutMs: config.WORKER_SHUTDOWN_TIMEOUT_MS,
});

export default { workers, redis, pool, healthServer };
