/**
 * Koda Backend Server
 *
 * Minimal boot: initializes container, connects DB, starts HTTP server.
 * Socket.IO, document workers, and deletion workers are disabled until
 * their service files are restored or rebuilt.
 */

import { createServer } from 'http';
import app from './app';
import { config } from './config/env';
import { initializeContainer, getContainer } from './bootstrap/container';
import { createAuthService } from './bootstrap/authBridge';

// ============================================================================
// Global Error Handlers
// ============================================================================

process.on('uncaughtException', (error: Error) => {
  console.error('UNCAUGHT EXCEPTION:', error.message);
  console.error(error.stack);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('UNHANDLED REJECTION:', reason);
});

// ============================================================================
// Start Server
// ============================================================================

const PORT = Number(config.PORT ?? process.env.PORT ?? 3001);

async function startServer() {
  try {
    // 1. Initialize service container (loads JSON configs, creates services)
    console.log('[Server] Initializing service container...');
    await initializeContainer();

    const container = getContainer();
    console.log(`[Server] Container ready: ${container.isInitialized()}`);

    // 2. Try to connect to database (non-fatal if missing)
    try {
      const prisma = (await import('./config/database')).default;
      await prisma.$connect();
      console.log('[Server] Database connected');
    } catch (dbErr: any) {
      console.warn('[Server] Database not available:', dbErr.message);
    }

    // 3. Wire container services into app.locals so controllers can resolve them
    app.locals.services = {
      core: {
        kodaOrchestrator: container.getOrchestrator(),
        orchestrator: container.getOrchestrator(),
      },
      history: null, // TODO: wire HistoryAppService
      auth: createAuthService(),
      chat: null,    // TODO: wire ChatAppService
    };

    // 4. Start HTTP server
    const httpServer = createServer(app);

    httpServer.listen(PORT, () => {
      console.log(`[Server] Running on port ${PORT}`);
      console.log(`[Server] Environment: ${config.NODE_ENV}`);
    });

    // 5. Try to start document queue worker (non-fatal if missing)
    try {
      const queue = await import('./queues/document.queue');
      if (queue.startDocumentWorker) {
        queue.startDocumentWorker();
        console.log('[Server] Document queue worker started');
      }
    } catch {
      console.warn('[Server] Document queue worker not available');
    }

    console.log('[Server] Startup complete');
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

startServer();
