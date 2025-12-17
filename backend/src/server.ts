/**
 * KODA Backend Server V2
 *
 * Clean server startup with V2 RAG pipeline
 */

import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app';
import { config } from './config/env';
import jwt from 'jsonwebtoken';
import { createSecureServer, createHTTPRedirectServer, getPortConfig, checkCertificateExpiry } from './config/ssl.config';
import prisma from './config/database';
import websocketService from './services/websocket.service';
import chatService from './services/chat.service';
import { startDocumentWorker, stopDocumentWorker } from './queues/document.queue';

import { DATA_DIR, verifyAllDataFiles } from './config/dataPaths';
import { initPromptConfig } from './services/core/promptConfig.service';
import { initTokenBudgetEstimator } from './services/utils/tokenBudgetEstimator.service';
import { initContextWindowBudgeting } from './services/utils/contextWindowBudgeting.service';
// Config services are now loaded inside container.ts during initialization
import { initializeContainer, getContainer } from './bootstrap/container';
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
// Server Setup
// ============================================================================

const portConfig = getPortConfig();
const httpServer = createSecureServer(app);
const redirectServer = createHTTPRedirectServer();

// Initialize Socket.IO
export const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = [config.FRONTEND_URL, 'https://getkoda.ai', 'http://localhost:3000'];
      if (!origin || allowedOrigins.includes(origin || '')) {
        callback(null, origin || '*');
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ============================================================================
// Socket.IO Authentication
// ============================================================================

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as { userId: string };
    socket.data.userId = decoded.userId;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

// ============================================================================
// Socket.IO Event Handlers
// ============================================================================

io.on('connection', (socket) => {
  const userId = socket.data.userId;
  console.log(`[WS] User connected: ${userId}`);

  // Join user's personal room
  socket.join(`user:${userId}`);

  // Handle chat messages
  socket.on('send-message', async (data: {
    conversationId: string;
    content: string;
    attachedDocumentId?: string;
  }) => {
    try {
      const { conversationId, content, attachedDocumentId } = data;

      // Join conversation room
      socket.join(`conversation:${conversationId}`);

      // Send acknowledgment
      socket.emit('message-received', { conversationId });

      // Process message
      const result = await chatService.sendMessageStreaming(
        {
          userId,
          conversationId,
          content,
          attachedDocumentId,
        },
        (chunk: string) => {
          // Stream chunks to client
          io.to(`conversation:${conversationId}`).emit('message-chunk', {
            chunk,
            conversationId,
          });
        }
      );

      // Send completion
      io.to(`conversation:${conversationId}`).emit('message-complete', {
        conversationId,
        userMessage: result.userMessage,
        assistantMessage: result.assistantMessage,
        sources: result.sources,
      });
    } catch (error: any) {
      console.error('[WS] Message error:', error);
      socket.emit('message-error', { error: error.message });
    }
  });

  // Handle conversation join
  socket.on('join-conversation', (conversationId: string) => {
    socket.join(`conversation:${conversationId}`);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`[WS] User disconnected: ${userId}`);
  });
});

// ============================================================================
// Start Server
// ============================================================================

async function startServer() {
  try {
    // Verify all data files before starting
    console.log(`[Server] Using DATA_DIR: ${DATA_DIR}`);
    const { ok, problems } = verifyAllDataFiles();
    if (problems.length > 0) {
      console.error('[Server] CRITICAL: Missing or invalid data files:');
      problems.forEach(p => console.error(`  - ${p.file}: ${p.error}`));
      console.error('[Server] Cannot start with missing data files. Exiting.');
      process.exit(1);
    }
    console.log(`[Server] All ${ok.length} data files verified successfully`);

    // Initialize V3 services (MUST be before routes use them)
    console.log('[Server] Initializing V3 services...');

    // 1. Initialize token budget estimator
    initTokenBudgetEstimator();
    console.log('[Server] TokenBudgetEstimator initialized');

    // 2. Initialize context window budgeting
    initContextWindowBudgeting();
    console.log('[Server] ContextWindowBudgeting initialized');

    // 3. Initialize prompt config (loads all JSON data files)
    initPromptConfig({
      dataDir: DATA_DIR,
      env: config.NODE_ENV as 'dev' | 'prod' | 'test',
      logger: console,
    });
    console.log('[Server] PromptConfig initialized');

    // 4. Initialize service container (CRITICAL - wires all services with DI)
    // This now loads JSON configs (intent patterns, fallbacks, product help) inside container
    await initializeContainer();
    
    // ASSERTION: Verify container is ready before proceeding
    const container = getContainer();
    if (!container.isInitialized()) {
      throw new Error('FATAL: Container initialization returned but isInitialized() is false');
    }
    console.log('[Server] ✅ Service container initialized and verified ready');
    console.log('[Server]    - Orchestrator: ', container.getOrchestrator() ? 'OK' : 'MISSING');
    console.log('[Server]    - IntentEngine: ', container.getIntentEngine() ? 'OK' : 'MISSING');
    console.log('[Server]    - RetrievalEngine: ', container.getRetrievalEngine() ? 'OK' : 'MISSING');

    // Test database connection
    await prisma.$connect();
    console.log('[Server] Database connected');

    // Initialize WebSocket service
    websocketService.initialize(io);

    // Start HTTPS server
    httpServer.listen(portConfig.httpsPort, () => {
      console.log(`[Server] Running on port ${portConfig.httpsPort}`);
      console.log(`[Server] Environment: ${config.NODE_ENV}`);
    });

    // Start HTTP redirect (production only)
    if (redirectServer && config.NODE_ENV === 'production' && portConfig.httpPort) {
      redirectServer.listen(portConfig.httpPort, () => {
        console.log(`[Server] HTTP redirect on port ${portConfig.httpPort}`);
      });
    }

    // Check SSL certificate expiry
    checkCertificateExpiry();

    // Start document processing queue worker
    try {
      startDocumentWorker();
      console.log('[Server] Document queue worker started');
    } catch (queueError) {
      console.warn('[Server] Document queue worker failed to start:', queueError);
    }

    console.log('[Server] V2 RAG Pipeline initialized');
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

startServer();

export default httpServer;
