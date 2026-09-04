/**
 * WaxPrep - Health Check Routes
 * 
 * Simple liveness probe that confirms the server is running.
 * Does not check external dependencies - that's for readiness probes.
 */

import { Router } from 'express';

const router = Router();

/**
 * Basic health check - server is alive
 */
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'waxprep-webhook',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Detailed health check - includes dependency status
 * (Implemented in Stage 7)
 */
router.get('/detailed', async (req, res) => {
  const health = {
    status: 'ok',
    service: 'waxprep-webhook',
    timestamp: new Date().toISOString(),
    dependencies: {
      database: 'unknown',
      redis: 'unknown',
    },
  };

  try {
    // Placeholder for database check (Stage 7)
    // const dbStatus = await checkDatabase(pool);
    // health.dependencies.database = dbStatus;

    // Placeholder for Redis check (Stage 7)
    // const redisStatus = await checkRedis(redis);
    // health.dependencies.redis = redisStatus;

    res.status(200).json(health);
  } catch (err) {
    health.status = 'degraded';
    res.status(503).json(health);
  }
});

export default router;
