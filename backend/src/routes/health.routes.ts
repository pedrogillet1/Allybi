import express from 'express';
import { isContainerReady } from '../middleware/containerGuard.middleware';

const router = express.Router();

/**
 * General health check
 * Includes container and database status
 */
router.get('/health', async (req, res) => {
  try {
    const containerInitialized = isContainerReady();

    // Check database connection (dynamic import to avoid crash if prisma isn't set up)
    let dbConnected = false;
    try {
      const prisma = (await import('../config/database')).default;
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    const isHealthy = containerInitialized && dbConnected;
    const httpStatus = isHealthy ? 200 : 503;

    res.status(httpStatus).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        container: containerInitialized ? 'initialized' : 'NOT_INITIALIZED',
        database: dbConnected ? 'connected' : 'disconnected',
      },
      ...(isHealthy ? {} : {
        issues: [
          ...(!containerInitialized ? ['Service container not initialized'] : []),
          ...(!dbConnected ? ['Database connection failed'] : []),
        ],
      }),
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Kubernetes-style readiness probe
 */
router.get('/health/readiness', async (_req, res) => {
  const containerReady = isContainerReady();

  let dbReady = false;
  try {
    const prisma = (await import('../config/database')).default;
    await prisma.$queryRaw`SELECT 1`;
    dbReady = true;
  } catch {
    dbReady = false;
  }

  const isReady = containerReady && dbReady;
  res.status(isReady ? 200 : 503).json({
    ready: isReady,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Kubernetes-style liveness probe
 */
router.get('/health/liveness', (_req, res) => {
  res.status(200).json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;
