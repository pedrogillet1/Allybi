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

import { Server as SocketIOServer } from "socket.io";
import app from "./app";
import { config } from "./config/env";
import { createSecureServer } from "./config/ssl.config";
import prisma from "./platform/db/prismaClient";
import * as gcsStorage from "./config/storage";
import { initializeContainer, getContainer } from "./bootstrap/container";
import { createAuthService } from "./bootstrap/authBridge";
import { PrismaDocumentService } from "./services/prismaDocument.service";
import { PrismaFolderService } from "./services/prismaFolder.service";
import { PrismaChatService } from "./services/prismaChat.service";
import { PrismaHistoryService } from "./services/prismaHistory.service";
import { TelemetryService } from "./services/telemetry";
import { createAdminAuthService } from "./bootstrap/adminAuthBridge";
import { createAdminTelemetryAdapter } from "./services/telemetry/adminTelemetryAdapter";
import { setRealtimeSocketServer } from "./services/realtime/socketGateway.service";
import {
  startDocumentWorker,
  startPreviewGenerationWorker,
  startPreviewReconciliationWorker,
  startStuckDocSweeper,
  startConnectorWorker,
  startEditWorker,
} from "./app/workers";

// LLM wiring
import { LLMChatEngine } from "./services/llm/core/llmChatEngine";
import { TelemetryLLMClient } from "./services/llm/core/telemetryLlmClient.decorator";
import {
  buildGatewayRuntime,
  buildLLMFactoryFromEnv,
  resolveRuntimeEnvName,
} from "./services/llm/core/llmGatewayRuntime.factory";

// Security / encryption wiring
import { EncryptionService } from "./services/security/encryption.service";
import { EnvelopeService } from "./services/security/envelope.service";
import { TenantKeyService } from "./services/security/tenantKey.service";
import { ConversationKeyService } from "./services/chat/conversationKey.service";
import { ChatCryptoService } from "./services/chat/chatCrypto.service";
import { EncryptedChatRepo } from "./services/chat/encryptedChatRepo.service";
import { EncryptedChatContextService } from "./services/chat/encryptedChatContext.service";
import { DocumentKeyService } from "./services/documents/documentKey.service";
import { DocumentCryptoService } from "./services/documents/documentCrypto.service";
import { EncryptedDocumentRepo } from "./services/documents/encryptedDocumentRepo.service";
import { ChunkCryptoService } from "./services/retrieval/chunkCrypto.service";
import { resolveIndexingPolicySnapshot } from "./services/retrieval/indexingPolicy.service";
import { recordIndexingPlaintextOverrideActivation } from "./services/ingestion/pipeline/pipelineMetrics.service";
import { startRevisionLinkReconciler } from "./services/documents/revisionLinkReconciler.service";

const driveStorage = {
  provider: "drive",
  isConfigured: false,
};

// ============================================================================
// Global Error Handlers
// ============================================================================

process.on("uncaughtException", (error: Error) => {
  console.error("UNCAUGHT EXCEPTION:", error.message);
  console.error(error.stack);
});

process.on("unhandledRejection", (reason: any) => {
  console.error("UNHANDLED REJECTION:", reason);
});

// ============================================================================
// Start Server
// ============================================================================

const PORT = Number(config.PORT ?? process.env.PORT ?? 3001);

async function startServer() {
  try {
    // 1. Initialize service container (loads JSON configs, creates services)
    console.log("[Server] Initializing service container...");
    await initializeContainer();

    const container = getContainer();
    console.log(`[Server] Container ready: ${container.isInitialized()}`);
    const sharedConversationMemory = container.getConversationMemory();
    const indexingPolicy = resolveIndexingPolicySnapshot();
    console.log(
      `[Server] Indexing policy mode=${indexingPolicy.runtimeMode} allowed=${indexingPolicy.runtimeModeAllowed} allowedModes=${indexingPolicy.allowedRuntimeModes.join(",")} strictFailClosed=${indexingPolicy.strictFailClosed} encryptedOnly=${indexingPolicy.encryptedChunksOnly} allowPlaintextOverride=${indexingPolicy.allowPlaintextChunksOverride} enforceEncryptedOnly=${indexingPolicy.enforceEncryptedOnlyInvariant} enforceChunkMetadata=${indexingPolicy.enforceChunkMetadataInvariant} enforceVersionMetadata=${indexingPolicy.enforceVersionMetadataInvariant}`,
    );
    if (!indexingPolicy.encryptedChunksOnly && indexingPolicy.allowPlaintextChunksOverride) {
      recordIndexingPlaintextOverrideActivation();
      console.warn(
        "[Server] ALERT: plaintext chunk indexing override is active (INDEXING_ALLOW_PLAINTEXT_CHUNKS=true).",
      );
    }

    // 2. Connect to database
    try {
      await prisma.$connect();
      console.log("[Server] Database connected");
    } catch (dbErr: any) {
      console.warn("[Server] Database not available:", dbErr.message);
    }

    // 3. Wire Telemetry (needed before LLM wiring)
    const telemetryService = new TelemetryService(prisma, {
      enabled: process.env.TELEMETRY_ENABLED !== "false",
    });
    console.log("[Server] Telemetry service created");

    // 4. Wire LLM client factory → TelemetryDecorator → ChatEngine → PrismaChatService
    let chatService: PrismaChatService;
    try {
      const envName = resolveRuntimeEnvName(process.env.NODE_ENV);
      const llmFactory = buildLLMFactoryFromEnv(envName);
      const configuredKeys = llmFactory.listConfigured();
      console.log(
        `[Server] LLM factory ready — providers: ${configuredKeys.join(", ")}`,
      );

      const runtime = buildGatewayRuntime({
        envName,
        llmFactory,
        wrapClient(client) {
          return new TelemetryLLMClient(client, telemetryService);
        },
      });
      const llmClient = runtime.defaultClient;
      const defaultModelId = runtime.defaultModelId;
      const llmGateway = runtime.gateway;
      console.log("[Server] LLM client wrapped with telemetry decorator");
      const bankBackedChatEngine = new LLMChatEngine(llmGateway, {
        provider: llmClient.provider,
        modelId: defaultModelId,
      });

      // Wire shared gateway into title generation service (Phase 4: shadow path consolidation)
      try {
        const { setTitleGenGateway } = await import("./services/ingestion/titleGeneration.service");
        setTitleGenGateway(llmGateway);
        console.log("[Server] Title generation wired with shared LLM gateway");
      } catch {
        console.warn("[Server] Title generation gateway wiring skipped");
      }

      chatService = new PrismaChatService(bankBackedChatEngine, {
        conversationMemory: sharedConversationMemory || undefined,
      });
      console.log("[Server] Chat service wired with LLM engine");
    } catch (llmErr: any) {
      if (process.env.NODE_ENV === "production") {
        console.error(
          "[Server] FATAL: LLM initialization failed in production:",
          llmErr.message,
        );
        process.exit(1);
      }
      console.warn(
        "[Server] LLM not available, chat will use fallback:",
        llmErr.message,
      );
      const stubEngine = {
        generate: async () => ({
          text: "LLM not configured. Set GEMINI_API_KEY/GOOGLE_API_KEY or OPENAI_API_KEY.",
        }),
        stream: async (p: any) => {
          p.sink.close();
          return {
            finalText:
              "LLM not configured. Set GEMINI_API_KEY/GOOGLE_API_KEY or OPENAI_API_KEY.",
          };
        },
      };
      chatService = new PrismaChatService(stubEngine as any, {
        conversationMemory: sharedConversationMemory || undefined,
      });
    }

    // 5. Wire services into app.locals so controllers can resolve them

    // Security / encryption service graph
    const encryptionService = new EncryptionService();
    const envelopeService = new EnvelopeService(encryptionService);
    const tenantKeyService = new TenantKeyService(prisma, encryptionService);

    // Chat encryption
    const convoKeyService = new ConversationKeyService(
      prisma,
      encryptionService,
      tenantKeyService,
      envelopeService,
    );
    const chatCryptoService = new ChatCryptoService(encryptionService);
    const encryptedChatRepo = new EncryptedChatRepo(
      prisma,
      convoKeyService,
      chatCryptoService,
    );
    const encryptedChatContext = new EncryptedChatContextService(
      encryptedChatRepo,
    );

    // Document encryption
    const docKeyService = new DocumentKeyService(
      prisma,
      encryptionService,
      tenantKeyService,
      envelopeService,
    );
    const docCryptoService = new DocumentCryptoService(encryptionService);
    const encryptedDocRepo = new EncryptedDocumentRepo(
      prisma,
      docKeyService,
      docCryptoService,
    );

    // Retrieval decryption
    const chunkCryptoService = new ChunkCryptoService(
      prisma,
      docKeyService,
      docCryptoService,
    );

    // Wire encryption into chat service unless explicitly disabled for local/debug runs.
    const hasEncryptionKey = !!process.env.KODA_MASTER_KEY_BASE64;
    const disableChatEncryption =
      String(process.env.KODA_DISABLE_CHAT_ENCRYPTION || "")
        .trim()
        .toLowerCase() === "true";
    if (hasEncryptionKey && !disableChatEncryption) {
      chatService.wireEncryption(encryptedChatRepo, encryptedChatContext);
      console.log("[Server] Chat encryption enabled");
    } else {
      console.warn(
        "[Server] Chat encryption DISABLED",
      );
    }

    app.locals.services = {
      documents: new PrismaDocumentService(),
      folders: new PrismaFolderService(),
      history: new PrismaHistoryService(),
      auth: createAuthService(),
      adminAuth: createAdminAuthService(),
      chat: chatService,
      telemetry: telemetryService,
      adminTelemetryApp: createAdminTelemetryAdapter(prisma),
      storage: {
        gcs: gcsStorage,
        drive: driveStorage,
      },
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
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:5173",
      "https://localhost:3000",
      "https://localhost:5000",
      "https://localhost:5173",
      "https://allybi.co",
      "https://www.allybi.co",
      "https://app.allybi.co",
      "https://admin.allybi.co",
      config.FRONTEND_URL,
    ].filter(Boolean) as string[];

    const io = new SocketIOServer(httpServer, {
      cors: {
        origin: socketOrigins,
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
    });
    setRealtimeSocketServer(io);

    io.on("connection", (socket) => {
      console.log("[Socket.IO] connected:", socket.id);

      socket.on("join-user-room", (rawUserId: unknown) => {
        const userId = String(rawUserId || "").trim();
        if (!userId) return;
        socket.join(userId);
        socket.join(`user:${userId}`);
        socket.emit("joined-user-room", { userId });
      });

      socket.on("disconnect", (reason) => {
        console.log("[Socket.IO] disconnected:", socket.id, reason);
      });

      socket.on("ping", () => {
        socket.emit("pong");
      });
    });

    // Expose io on app.locals so controllers can emit events
    app.locals.io = io;

    httpServer.listen(PORT, () => {
      console.log(`[Server] Running on port ${PORT}`);
      console.log(`[Server] Environment: ${config.NODE_ENV}`);
    });

    // Graceful shutdown handler — release port cleanly on SIGTERM/SIGINT
    const gracefulShutdown = (signal: string) => {
      console.log(`[Server] ${signal} received — shutting down gracefully...`);
      httpServer.close(() => {
        console.log("[Server] HTTP server closed.");

        // Flush telemetry buffer before disconnecting Prisma (flush writes to DB)
        (async () => {
          try {
            await telemetryService.shutdown();
            console.log("[Server] Telemetry buffer flushed.");
          } catch (err: unknown) {
            console.warn("[Server] Telemetry flush failed:", (err as Error)?.message ?? String(err));
          }
        })()
          .then(() => prisma.$disconnect())
          .then(() => {
            console.log("[Server] Database disconnected.");
            process.exit(0);
          })
          .catch(() => {
            process.exit(0);
          });
      });
      // Force exit after 10s if connections don't drain
      setTimeout(() => {
        console.warn("[Server] Forced shutdown after 10s timeout.");
        process.exit(1);
      }, 10_000).unref();
    };
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    const disableBackgroundWorkers =
      String(process.env.DISABLE_BACKGROUND_WORKERS || "")
        .trim()
        .toLowerCase() === "true";

    if (disableBackgroundWorkers) {
      console.warn("[Server] Background workers disabled by env");
    } else {
      // 7. Start document queue + preview workers (non-fatal on boot failures)
      try {
        startDocumentWorker();
        console.log("[Server] Document queue worker started");
        startPreviewGenerationWorker();
        console.log("[Server] Preview generation worker started");
        await startPreviewReconciliationWorker();
        console.log("[Server] Preview reconciliation worker started");
        await startStuckDocSweeper();
        console.log("[Server] Stuck document sweeper started");
      } catch {
        console.warn("[Server] Document queue worker not available");
      }

      // 8. Start connector worker (non-fatal if missing)
      try {
        startConnectorWorker();
        console.log("[Server] Connector worker started");
      } catch {
        console.warn("[Server] Connector worker not available");
      }

      // 9. Start edit worker (non-fatal if missing)
      try {
        startEditWorker();
        console.log("[Server] Edit worker started");
      } catch {
        console.warn("[Server] Edit worker not available");
      }

      // 10. Start revision-link reconciler (non-fatal if disabled/misconfigured)
      try {
        startRevisionLinkReconciler();
      } catch {
        console.warn("[Server] Revision link reconciler not available");
      }
    }

    console.log("[Server] Startup complete");
  } catch (error) {
    console.error("[Server] Failed to start:", error);
    process.exit(1);
  }
}

startServer();

