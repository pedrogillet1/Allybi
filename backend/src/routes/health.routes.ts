import express from 'express';
import prisma from '../config/database';
import { DATA_DIR, verifyAllDataFiles, REQUIRED_DATA_FILES } from '../config/dataPaths';
import { isContainerReady } from '../middleware/containerGuard.middleware';
import { fallbackConfigService } from '../services/core/fallbackConfig.service';
import { kodaProductHelpServiceV3 } from '../services/core/kodaProductHelpV3.service';
import { intentConfigService } from '../services/core/intentConfig.service';

const router = express.Router();

/**
 * General health check
 * Includes container, database, and config loading status
 */
router.get('/health', async (req, res) => {
  try {
    // Check container initialization (critical for V3 services)
    const containerInitialized = isContainerReady();

    // Check config services loaded (MUST be loaded before container)
    const fallbacksLoaded = fallbackConfigService.isReady();
    const productHelpLoaded = kodaProductHelpServiceV3.isReady();
    const intentConfigLoaded = intentConfigService.isReady();

    // Check database connection
    let dbConnected = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    // Overall health: all components must be ready
    const isHealthy = containerInitialized && dbConnected && fallbacksLoaded && productHelpLoaded && intentConfigLoaded;
    const httpStatus = isHealthy ? 200 : 503;

    res.status(httpStatus).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        container: containerInitialized ? 'initialized' : 'NOT_INITIALIZED',
        database: dbConnected ? 'connected' : 'disconnected',
        fallbacks: fallbacksLoaded ? 'loaded' : 'NOT_LOADED',
        productHelp: productHelpLoaded ? 'loaded' : 'NOT_LOADED',
        intentConfig: intentConfigLoaded ? 'loaded' : 'NOT_LOADED',
      },
      // Include details if unhealthy
      ...(isHealthy ? {} : {
        issues: [
          ...(!containerInitialized ? ['Service container not initialized - V3 services unavailable'] : []),
          ...(!dbConnected ? ['Database connection failed'] : []),
          ...(!fallbacksLoaded ? ['Fallback configs not loaded'] : []),
          ...(!productHelpLoaded ? ['Product help content not loaded'] : []),
          ...(!intentConfigLoaded ? ['Intent config patterns not loaded'] : []),
        ],
      }),
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      checks: {
        container: 'unknown',
        database: 'unknown',
        fallbacks: 'unknown',
        productHelp: 'unknown',
        intentConfig: 'unknown',
      },
    });
  }
});

/**
 * Kubernetes-style readiness probe
 * Returns 200 if server is ready to accept traffic, 503 otherwise
 * Lighter weight than /health - no detailed diagnostics
 */
router.get('/health/readiness', async (_req, res) => {
  const containerReady = isContainerReady();
  const configsReady = fallbackConfigService.isReady() && kodaProductHelpServiceV3.isReady() && intentConfigService.isReady();

  // Quick DB check
  let dbReady = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbReady = true;
  } catch {
    dbReady = false;
  }

  const isReady = containerReady && configsReady && dbReady;

  res.status(isReady ? 200 : 503).json({
    ready: isReady,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Kubernetes-style liveness probe
 * Returns 200 if process is alive (not deadlocked)
 */
router.get('/health/liveness', (_req, res) => {
  res.status(200).json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * Stuck documents health check
 * Returns count of documents stuck in "processing" for > 10 minutes
 */
router.get('/health/stuck-documents', async (req, res) => {
  try {
    const STUCK_THRESHOLD = 10 * 60 * 1000; // 10 minutes
    const stuckCutoff = new Date(Date.now() - STUCK_THRESHOLD);

    const stuckDocuments = await prisma.document.findMany({
      where: {
        status: 'processing',
        updatedAt: {
          lt: stuckCutoff
        }
      },
      select: {
        id: true,
        filename: true,
        updatedAt: true
      }
    });

    const stuckCount = stuckDocuments.length;
    const status = stuckCount === 0 ? 'healthy' : 'warning';

    res.json({
      status,
      stuck_documents: stuckCount,
      threshold_minutes: 10,
      timestamp: new Date().toISOString(),
      documents: stuckDocuments.map(doc => ({
        id: doc.id,
        filename: doc.filename,
        stuck_for_minutes: Math.floor(
          (Date.now() - new Date(doc.updatedAt).getTime()) / 1000 / 60
        )
      }))
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Document processing statistics
 */
router.get('/health/document-stats', async (req, res) => {
  try {
    const statusCounts = await prisma.document.groupBy({
      by: ['status'],
      _count: true
    });

    const stats: Record<string, number> = {};
    statusCounts.forEach(item => {
      stats[item.status] = item._count;
    });

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      statistics: stats,
      total: Object.values(stats).reduce((a, b) => a + b, 0)
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Config statistics endpoint
 * Returns detailed counts from loaded JSON config files
 * Useful for verifying JSON data is actually being used
 */
router.get('/health/config-stats', async (_req, res) => {
  try {
    const intentStats = intentConfigService.getStatistics();
    const fallbackStats = fallbackConfigService.getStatistics();
    const productHelpStats = kodaProductHelpServiceV3.getStatistics();

    // Validate non-zero counts (fail-fast indicator)
    const issues: string[] = [];
    if (intentStats.totalIntents === 0) issues.push('No intent patterns loaded');
    if (fallbackStats.totalScenarios === 0) issues.push('No fallback scenarios loaded');
    if (productHelpStats.topicsLoaded === 0 && productHelpStats.capabilitiesLoaded === 0) issues.push('No product help topics or capabilities loaded');

    const isHealthy = issues.length === 0;
    const httpStatus = isHealthy ? 200 : 503;

    res.status(httpStatus).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      configs: {
        intentPatterns: {
          loaded: intentConfigService.isReady(),
          totalIntents: intentStats.totalIntents,
          totalKeywords: intentStats.totalKeywords,
          totalPatterns: intentStats.totalPatterns,
          byLanguage: intentStats.byLanguage,
        },
        fallbacks: {
          loaded: fallbackConfigService.isReady(),
          totalScenarios: fallbackStats.totalScenarios,
          totalStyles: fallbackStats.totalStyles,
          byLanguage: fallbackStats.byLanguage,
        },
        productHelp: {
          loaded: kodaProductHelpServiceV3.isReady(),
          topicsLoaded: productHelpStats.topicsLoaded,
          capabilitiesLoaded: productHelpStats.capabilitiesLoaded,
        },
      },
      ...(issues.length > 0 ? { issues } : {}),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Data files health check
 * Returns status of all required JSON data files
 */
router.get('/health/data-health', async (_req, res) => {
  try {
    const { ok, problems } = verifyAllDataFiles();

    const status = problems.length === 0 ? 'healthy' : 'unhealthy';
    const httpStatus = problems.length === 0 ? 200 : 503;

    res.status(httpStatus).json({
      status,
      timestamp: new Date().toISOString(),
      dataDir: DATA_DIR,
      totalFiles: REQUIRED_DATA_FILES.length,
      okFiles: ok.length,
      problemFiles: problems.length,
      files: {
        ok,
        problems: problems.map(p => ({
          file: p.file,
          error: p.error,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
