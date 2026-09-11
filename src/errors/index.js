/**
 * WaxPrep - Error Handling Module
 * 
 * Global error handlers, graceful shutdown, and error taxonomy.
 * Implements the resilience patterns from Stage 5.
 */

import { Policy, ExponentialBackoff } from 'cockatiel';

/**
 * Register global error handlers.
 *
 * Note: we use process.exitCode + logger.flush() rather than synchronous
 * process.exit(1) so that pino transports (especially pino-pretty) get a
 * chance to drain before the process dies.
 */
export function registerGlobalErrorHandlers(logger) {
  const handleFatal = (err, kind) => {
    logger.fatal({ err }, `${kind} — crashing`);
    process.exitCode = 1;
    // Allow the log to flush before exiting.
    setTimeout(() => process.exit(1), 250);
  };

  process.on('uncaughtException', (err) => handleFatal(err, 'UNCAUGHT EXCEPTION'));
  process.on('unhandledRejection', (reason) => handleFatal(reason, 'UNHANDLED REJECTION'));

  console.log('✓ Global error handlers registered');
}

/**
 * Register graceful shutdown handler.
 *
 * Accepts an options object with:
 *   { logger, pool, redis?, workers?, server?, shutdownTimeoutMs? }
 *
 * Order of operations on shutdown:
 *   1. Stop accepting new HTTP connections (server.close()).
 *   2. Stop accepting new BullMQ jobs (worker.close()) and wait for in-flight
 *      jobs to complete (subject to lockDuration).
 *   3. Close the Redis connection.
 *   4. Close the Postgres pool.
 */
export function registerGracefulShutdown({ logger, pool, redis, workers, server, shutdownTimeoutMs }) {
  let shutdownInProgress = false;
  const timeoutMs = shutdownTimeoutMs || 30000;

  async function gracefulShutdown(signal) {
    if (shutdownInProgress) {
      logger.warn('Shutdown already in progress, forcing exit');
      process.exit(1);
    }

    shutdownInProgress = true;
    logger.info({ signal }, 'Beginning graceful shutdown');

    // Hard-fail timer: if anything below hangs, force-exit.
    const forceTimer = setTimeout(() => {
      logger.error({ timeoutMs }, 'Graceful shutdown exceeded timeout — forcing exit');
      process.exit(1);
    }, timeoutMs);

    try {
      // 1. Stop accepting new HTTP requests.
      if (server && typeof server.close === 'function') {
        await new Promise((resolve) => server.close(resolve));
        logger.info('HTTP server closed');
      }

      // 2. Close workers (stops accepting new jobs; waits for in-flight to finish).
      if (Array.isArray(workers) && workers.length > 0) {
        await Promise.all(
          workers
            .filter((w) => w && typeof w.close === 'function')
            .map((w) => w.close()),
        );
        logger.info({ count: workers.length }, 'BullMQ workers closed');
      }

      // 3. Close Redis.
      if (redis) {
        try {
          await redis.quit();
          logger.info('Redis connection closed');
        } catch (err) {
          logger.warn({ err: err.message }, 'Redis close error (non-fatal)');
        }
      }

      // 4. Close Postgres pool.
      if (pool && typeof pool.end === 'function') {
        try {
          await pool.end();
          logger.info('Database pool closed');
        } catch (err) {
          logger.warn({ err: err.message }, 'Pool end error (non-fatal)');
        }
      }

      logger.info('Graceful shutdown complete');
      clearTimeout(forceTimer);
      process.exit(0);
    } catch (err) {
      logger.fatal({ err }, 'Error during graceful shutdown');
      clearTimeout(forceTimer);
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  console.log('✓ Graceful shutdown handler registered');
}

/**
 * Create AI provider policy with circuit breaker and retries
 */
export function createAIPolicy(config) {
  return Policy
    .wrap(
      Policy.handleAll()
        .circuitBreaker(
          config.CIRCUIT_BREAKER_DURATION_MS,
          { threshold: config.CIRCUIT_BREAKER_THRESHOLD },
        ),
      Policy.handleAll()
        .retry()
        .exponential(new ExponentialBackoff({
          initialDelay: config.QUEUE_RETRY_DELAY_BASE_MS,
          maxDelay: config.QUEUE_RETRY_DELAY_MAX_MS,
        })),
    );
}

/**
 * Create WhatsApp API policy with retries
 */
export function createWhatsAppPolicy(config) {
  return Policy
    .wrap(
      Policy.handleAll()
        .retry()
        .exponential(new ExponentialBackoff({
          initialDelay: config.QUEUE_RETRY_DELAY_BASE_MS,
          maxDelay: config.QUEUE_RETRY_DELAY_MAX_MS,
        })),
    );
}

export default {
  registerGlobalErrorHandlers,
  registerGracefulShutdown,
  createAIPolicy,
  createWhatsAppPolicy,
};
