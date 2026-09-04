/**
 * WaxPrep - Error Handling Module
 * 
 * Global error handlers, graceful shutdown, and error taxonomy.
 * Implements the resilience patterns from Stage 5.
 */

import { Policy, ExponentialBackoff } from 'cockatiel';

/**
 * Register global error handlers
 */
export function registerGlobalErrorHandlers(logger) {
  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'UNCAUGHT EXCEPTION — crashing');
    process.exit(1);
  });

  // Handle unhandled rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.fatal({ reason }, 'UNHANDLED REJECTION — crashing');
    process.exit(1);
  });

  console.log('✓ Global error handlers registered');
}

/**
 * Register graceful shutdown handler
 */
export function registerGracefulShutdown({ logger, pool, redis }) {
  let shutdownInProgress = false;

  async function gracefulShutdown(signal) {
    if (shutdownInProgress) {
      logger.warn('Shutdown already in progress, forcing exit');
      process.exit(1);
    }

    shutdownInProgress = true;
    logger.info(`Received ${signal}, beginning graceful shutdown`);

    try {
      // Close database pool
      if (pool) {
        await pool.end();
        logger.info('Database pool closed');
      }

      // Close Redis connection
      if (redis) {
        await redis.quit();
        logger.info('Redis connection closed');
      }

      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.fatal({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  }

  // Handle SIGTERM (used by Railway for deployments)
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // Handle SIGINT (Ctrl+C)
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
