/**
 * WaxPrep - Health Check Routes
 * 
 * Implements liveness (/health) and readiness (/ready) probes.
 * Liveness: instant check if process is alive.
 * Readiness: checks critical dependencies (DB, Redis).
 */

import { Router } from 'express';

const router = Router();

/**
 * Liveness probe - is the process alive?
 * Returns immediately without checking dependencies.
 */
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'waxprep-webhook',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness probe - is the service ready to accept traffic?
 * Checks database connectivity.
 */
router.get('/ready', async (req, res) => {
  const checks = {};
  let allHealthy = true;

  // Database check
  try {
    const start = Date.now();
    const pool = req.app.get('dbPool');
    await pool.query('SELECT 1', [], { timeout: 5000 });
    checks.database = { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    checks.database = {
      status: 'error',
      message: 'Database connection failed',
    };
    allHealthy = false;
  }

  const statusCode = allHealthy ? 200 : 503;
  res.status(statusCode).json({
    status: allHealthy ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
  });
});

export default router;
