/**
 * Admin API Router
 *
 * Admin API is read-only; do not add mutating endpoints here.
 *
 * This router mounts all admin dashboard routes under a single prefix.
 * All routes are protected by the requireAdmin guard at the router level.
 */

import { Router, Request, Response, NextFunction } from 'express';

// Guards
import { requireAdmin } from './guards/requireAdmin.guard';

// Route modules
import overviewRoutes from './routes/overview.routes';
import usersRoutes from './routes/users.routes';
import filesRoutes from './routes/files.routes';
import queriesRoutes from './routes/queries.routes';
import answerQualityRoutes from './routes/answerQuality.routes';
import llmCostRoutes from './routes/llmCost.routes';
import reliabilityRoutes from './routes/reliability.routes';
import securityRoutes from './routes/security.routes';
import marketingRoutes from './routes/marketing.routes';
import liveRoutes from './routes/live.routes';

// Version from package.json (fallback if not available)
const VERSION = process.env.npm_package_version || '1.0.0';

/**
 * Build and configure the admin router
 *
 * @returns Express Router configured with all admin routes
 * @throws Error if required environment variables are missing in lockdown mode
 */
export function buildAdminRouter(): Router {
  const router = Router();

  // ============================================================================
  // LOCKDOWN CHECK (optional strict mode)
  // ============================================================================
  if (process.env.KODA_LOCKDOWN === 'true') {
    if (!process.env.KODA_OWNER_USER_ID) {
      throw new Error('[Admin] KODA_LOCKDOWN is enabled but KODA_OWNER_USER_ID is not set');
    }
    if (!process.env.KODA_ADMIN_KEY) {
      throw new Error('[Admin] KODA_LOCKDOWN is enabled but KODA_ADMIN_KEY is not set');
    }
  }

  // ============================================================================
  // APPLY ADMIN GUARD TO ALL ROUTES
  // This MUST come before any route mounts
  // ============================================================================
  router.use(requireAdmin);

  // ============================================================================
  // HEALTH CHECK (protected by requireAdmin)
  // ============================================================================
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      ts: new Date().toISOString(),
      version: VERSION,
      service: 'admin-api',
    });
  });

  // ============================================================================
  // MOUNT ROUTE MODULES
  // All routes are GET-only (read-only API)
  // ============================================================================

  try {
    router.use('/overview', overviewRoutes);
  } catch (err) {
    throw new Error(`[Admin] Failed to mount /overview routes: ${err}`);
  }

  try {
    router.use('/users', usersRoutes);
  } catch (err) {
    throw new Error(`[Admin] Failed to mount /users routes: ${err}`);
  }

  try {
    router.use('/files', filesRoutes);
  } catch (err) {
    throw new Error(`[Admin] Failed to mount /files routes: ${err}`);
  }

  try {
    router.use('/queries', queriesRoutes);
  } catch (err) {
    throw new Error(`[Admin] Failed to mount /queries routes: ${err}`);
  }

  try {
    router.use('/answer-quality', answerQualityRoutes);
  } catch (err) {
    throw new Error(`[Admin] Failed to mount /answer-quality routes: ${err}`);
  }

  try {
    router.use('/llm-cost', llmCostRoutes);
  } catch (err) {
    throw new Error(`[Admin] Failed to mount /llm-cost routes: ${err}`);
  }

  try {
    router.use('/reliability', reliabilityRoutes);
  } catch (err) {
    throw new Error(`[Admin] Failed to mount /reliability routes: ${err}`);
  }

  try {
    router.use('/security', securityRoutes);
  } catch (err) {
    throw new Error(`[Admin] Failed to mount /security routes: ${err}`);
  }

  try {
    router.use('/marketing', marketingRoutes);
  } catch (err) {
    throw new Error(`[Admin] Failed to mount /marketing routes: ${err}`);
  }

  try {
    router.use('/live', liveRoutes);
  } catch (err) {
    throw new Error(`[Admin] Failed to mount /live routes: ${err}`);
  }

  // ============================================================================
  // 404 HANDLER FOR ADMIN ROUTES
  // ============================================================================
  router.use((_req: Request, res: Response) => {
    res.status(404).json({
      ok: false,
      error: 'Admin endpoint not found',
      code: 'ADMIN_NOT_FOUND',
    });
  });

  // ============================================================================
  // ERROR HANDLER FOR ADMIN ROUTES
  // ============================================================================
  router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Admin] Route error:', err);
    res.status(500).json({
      ok: false,
      error: 'Internal admin error',
      code: 'ADMIN_INTERNAL_ERROR',
      // Only include message in development
      ...(process.env.NODE_ENV === 'development' && { message: err.message }),
    });
  });

  return router;
}

/**
 * Pre-built admin router instance
 * Use this for simple mounting: app.use('/api/admin', adminRouter)
 */
export const adminRouter = buildAdminRouter();

export default adminRouter;
