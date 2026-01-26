/**
 * Container Guard Middleware
 *
 * Ensures the service container is initialized before processing requests.
 * Returns 503 Service Unavailable if container is not ready.
 *
 * This guards against:
 * - Tests or other runners importing app.ts without initializing the container
 * - Race conditions during startup
 * - Any code path that bypasses server.ts initialization
 */

import { Request, Response, NextFunction } from 'express';
import { getContainer } from '../bootstrap/container';

/**
 * Middleware that checks if the service container is initialized.
 * Should be added early in the middleware chain for routes that use V3 services.
 *
 * For health checks, this middleware is skipped to allow monitoring systems
 * to detect the uninitialized state.
 */
export function containerGuard(req: Request, res: Response, next: NextFunction): void {
  // Skip guard for health check endpoints (they report container status)
  if (req.path.startsWith('/health')) {
    return next();
  }

  try {
    const container = getContainer();
    if (!container.isInitialized()) {
      console.error('[ContainerGuard] Service container not initialized - rejecting request');
      res.status(503).json({
        error: 'Service Unavailable',
        message: 'Server is starting up. Please try again in a moment.',
        code: 'CONTAINER_NOT_INITIALIZED',
      });
      return;
    }
    next();
  } catch (error) {
    console.error('[ContainerGuard] Error checking container status:', error);
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'Server is starting up. Please try again in a moment.',
      code: 'CONTAINER_CHECK_FAILED',
    });
  }
}

/**
 * Check if container is initialized (for use in health checks).
 */
export function isContainerReady(): boolean {
  try {
    return getContainer().isInitialized();
  } catch {
    return false;
  }
}

/**
 * Assert that container is initialized (throws if not).
 * Use in health checks or startup validation for strict mode.
 */
export function assertContainerReady(): void {
  if (!isContainerReady()) {
    throw new Error('CONTAINER_NOT_INITIALIZED: Service container must be initialized before use');
  }
}

/**
 * Ensure container is initialized for alternate entrypoints (e.g., tests).
 * Call this at the start of test files that import app.ts directly.
 *
 * @example
 * // In test file:
 * import { ensureContainerInitialized } from '../middleware/containerGuard.middleware';
 * beforeAll(async () => {
 *   await ensureContainerInitialized();
 * });
 */
export async function ensureContainerInitialized(): Promise<void> {
  if (isContainerReady()) {
    return; // Already initialized
  }

  // Dynamically import to avoid circular dependencies
  const { initializeContainer } = await import('../bootstrap/container');
  await initializeContainer();
  console.log('[ContainerGuard] Container initialized for alternate entrypoint');
}

export default containerGuard;
