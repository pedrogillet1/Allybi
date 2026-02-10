/**
 * Koda Backend Server
 *
 * Boot sequence:
 * 1. Initialize DI container (JSON configs, core services)
 * 2. Connect database
 * 3. Wire LLM client factory → ChatEngine → PrismaChatService
 * 4. Attach services to app.locals
 * 5. Start HTTP + Socket.IO server
 */

import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { config } from './config/env';
import { createSecureServer } from './config/ssl.config';
import { initializeContainer, getContainer } from './bootstrap/container';
import { createAuthService } from './bootstrap/authBridge';
import { PrismaDocumentService } from './services/prismaDocument.service';
import { PrismaFolderService } from './services/prismaFolder.service';
import { PrismaChatService } from './services/prismaChat.service';
import { PrismaHistoryService } from './services/prismaHistory.service';
import { TelemetryService } from './services/telemetry';
import { createAdminAuthService } from './bootstrap/adminAuthBridge';
import { createAdminTelemetryAdapter } from './services/telemetry/adminTelemetryAdapter';

// LLM wiring
import { LLMClientFactory } from './services/llm/core/llmClientFactory';
import { LLMChatEngine } from './services/llm/core/llmChatEngine';
import { loadGeminiConfig } from './services/llm/providers/gemini/geminiConfig';
import { TelemetryLLMClient } from './services/llm/core/telemetryLlmClient.decorator';

// Security / encryption wiring
import { EncryptionService } from './services/security/encryption.service';
import { EnvelopeService } from './services/security/envelope.service';
import { TenantKeyService } from './services/security/tenantKey.service';
import { ConversationKeyService } from './services/chat/conversationKey.service';
import { ChatCryptoService } from './services/chat/chatCrypto.service';
import { EncryptedChatRepo } from './services/chat/encryptedChatRepo.service';
import { EncryptedChatContextService } from './services/chat/encryptedChatContext.service';
import { DocumentKeyService } from './services/documents/documentKey.service';
import { DocumentCryptoService } from './services/documents/documentCrypto.service';
import { EncryptedDocumentRepo } from './services/documents/encryptedDocumentRepo.service';
import { ChunkCryptoService } from './services/retrieval/chunkCrypto.service';

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

    // 2. Connect to database
    const prisma = (await import('./config/database')).default;
    try {
      await prisma.$connect();
      console.log('[Server] Database connected');
    } catch (dbErr: any) {
      console.warn('[Server] Database not available:', dbErr.message);
    }

    // 3. Wire Telemetry (needed before LLM wiring)
    const telemetryService = new TelemetryService(
      prisma,
      { enabled: process.env.TELEMETRY_ENABLED !== 'false' },
    );
    console.log('[Server] Telemetry service created');

    // 4. Wire LLM client factory → TelemetryDecorator → ChatEngine → PrismaChatService
    let chatService: PrismaChatService;
    try {
      const llmFactory = buildLLMFactory();
      const rawClient = llmFactory.get();
      console.log(`[Server] LLM factory ready — providers: ${llmFactory.listConfigured().join(', ')}`);

      // Wrap with telemetry decorator so every LLM call is logged
      const llmClient = new TelemetryLLMClient(rawClient, telemetryService);
      console.log('[Server] LLM client wrapped with telemetry decorator');

      const geminiCfg = loadGeminiConfig((process.env.NODE_ENV as any) || 'dev');
      const chatEngine = new LLMChatEngine(llmClient, {
        provider: llmClient.provider,
        modelId: geminiCfg.models.defaultDraft,
      });

      chatService = new PrismaChatService(chatEngine);
      console.log('[Server] Chat service wired with LLM engine');
    } catch (llmErr: any) {
      console.warn('[Server] LLM not available, chat will use fallback:', llmErr.message);
      const stubEngine = {
        generate: async () => ({ text: 'LLM not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY.' }),
        stream: async (p: any) => {
          p.sink.close();
          return { finalText: 'LLM not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY.' };
        },
      };
      chatService = new PrismaChatService(stubEngine as any);
    }

    // 5. Wire services into app.locals so controllers can resolve them

    // Security / encryption service graph
    const encryptionService = new EncryptionService();
    const envelopeService = new EnvelopeService(encryptionService);
    const tenantKeyService = new TenantKeyService(prisma, encryptionService);

    // Chat encryption
    const convoKeyService = new ConversationKeyService(prisma, encryptionService, tenantKeyService, envelopeService);
    const chatCryptoService = new ChatCryptoService(encryptionService);
    const encryptedChatRepo = new EncryptedChatRepo(prisma, convoKeyService, chatCryptoService);
    const encryptedChatContext = new EncryptedChatContextService(encryptedChatRepo);

    // Document encryption
    const docKeyService = new DocumentKeyService(prisma, encryptionService, tenantKeyService, envelopeService);
    const docCryptoService = new DocumentCryptoService(encryptionService);
    const encryptedDocRepo = new EncryptedDocumentRepo(prisma, docKeyService, docCryptoService);

    // Retrieval decryption
    const chunkCryptoService = new ChunkCryptoService(prisma, docKeyService, docCryptoService);

    // Wire encryption into chat service (if KODA_MASTER_KEY_BASE64 is set)
    const hasEncryptionKey = !!process.env.KODA_MASTER_KEY_BASE64;
    if (hasEncryptionKey) {
      (chatService as any).encryptedRepo = encryptedChatRepo;
      (chatService as any).encryptedContext = encryptedChatContext;
      console.log('[Server] Chat encryption enabled');
    } else {
      console.warn('[Server] Chat encryption DISABLED (no KODA_MASTER_KEY_BASE64)');
    }

    app.locals.services = {
      core: {
        kodaOrchestrator: container.getOrchestrator(),
        orchestrator: container.getOrchestrator(),
      },
      documents: new PrismaDocumentService(),
      folders: new PrismaFolderService(),
      history: new PrismaHistoryService(),
      auth: createAuthService(),
      adminAuth: createAdminAuthService(),
      chat: chatService,
      telemetry: telemetryService,
      adminTelemetryApp: createAdminTelemetryAdapter(prisma),
      // Encryption services
      security: {
        encryption: encryptionService,
        envelope: envelopeService,
        tenantKeys: tenantKeyService,
      },
      encryptedChat: {
        repo: encryptedChatRepo,
        context: encryptedChatContext,
        convoKeys: convoKeyService,
        crypto: chatCryptoService,
      },
      encryptedDocuments: {
        repo: encryptedDocRepo,
        docKeys: docKeyService,
        crypto: docCryptoService,
      },
      chunkCrypto: chunkCryptoService,
    };

    // 6. Start HTTPS (or HTTP fallback) + Socket.IO server
    const httpServer = createSecureServer(app);

    const socketOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'https://localhost:3000',
      'https://localhost:5000',
      'https://localhost:5173',
      'https://getkoda.ai',
      config.FRONTEND_URL,
    ].filter(Boolean) as string[];

    const io = new SocketIOServer(httpServer, {
      cors: {
        origin: socketOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    io.on('connection', (socket) => {
      console.log('[Socket.IO] connected:', socket.id);

      socket.on('disconnect', (reason) => {
        console.log('[Socket.IO] disconnected:', socket.id, reason);
      });

      socket.on('ping', () => {
        socket.emit('pong');
      });
    });

    // Expose io on app.locals so controllers can emit events
    app.locals.io = io;

    httpServer.listen(PORT, () => {
      console.log(`[Server] Running on port ${PORT}`);
      console.log(`[Server] Environment: ${config.NODE_ENV}`);
    });

    // 7. Try to start document queue worker + preview workers (non-fatal if missing)
    try {
      const queue = await import('./queues/document.queue');
      if (queue.startDocumentWorker) {
        queue.startDocumentWorker();
        console.log('[Server] Document queue worker started');
      }
      if (queue.startPreviewGenerationWorker) {
        queue.startPreviewGenerationWorker();
        console.log('[Server] Preview generation worker started');
      }
      if (queue.startPreviewReconciliationWorker) {
        queue.startPreviewReconciliationWorker();
        console.log('[Server] Preview reconciliation worker started');
      }
      if (queue.startStuckDocSweeper) {
        queue.startStuckDocSweeper();
        console.log('[Server] Stuck document sweeper started');
      }
    } catch {
      console.warn('[Server] Document queue worker not available');
    }

    // 8. Start connector worker (non-fatal if missing)
    try {
      const connectorWorker = await import('./workers/connector-worker');
      if (connectorWorker.startWorker) {
        connectorWorker.startWorker();
        console.log('[Server] Connector worker started');
      }
    } catch {
      console.warn('[Server] Connector worker not available');
    }

    // 9. Start edit worker (non-fatal if missing)
    try {
      const editWorker = await import('./workers/edit-worker');
      if (editWorker.startWorker) {
        editWorker.startWorker();
        console.log('[Server] Edit worker started');
      }
    } catch {
      console.warn('[Server] Edit worker not available');
    }

    console.log('[Server] Startup complete');
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

/**
 * Build LLMClientFactory from environment variables.
 * Gemini is the preferred provider; throws if no API key is found.
 */
function buildLLMFactory(): LLMClientFactory {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!geminiKey && !openaiKey) {
    throw new Error('No LLM API key found. Set GEMINI_API_KEY or OPENAI_API_KEY.');
  }

  const geminiCfg = loadGeminiConfig((process.env.NODE_ENV as any) || 'dev');

  return new LLMClientFactory({
    defaultProvider: geminiKey ? 'google' : 'openai',
    providers: {
      google: geminiKey
        ? {
            enabled: true,
            config: {
              apiKey: geminiCfg.apiKey,
              baseUrl: geminiCfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
              defaults: {
                gemini3: geminiCfg.models.defaultFinal,
                gemini3Flash: geminiCfg.models.defaultDraft,
              },
              timeoutMs: geminiCfg.timeoutMs,
            },
          }
        : undefined,
      // OpenAI support can be enabled here when needed
    },
  });
}

startServer();
