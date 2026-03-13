// src/routes/chat.routes.ts
//
// Clean chat routes for Koda (Express).
// - Delegates all persistence + AI to PrismaChatService via app.locals.services.chat
// - No inline stubs, no business logic here
// - Includes SSE streaming endpoint for frontend ChatInterface.jsx
//
// Endpoints:
// - GET    /conversations
// - POST   /conversations
// - GET    /conversations/:conversationId
// - GET    /conversations/:conversationId/messages
// - POST   /conversations/:conversationId/messages
// - PATCH  /conversations/:conversationId/title
// - DELETE /conversations/empty
// - DELETE /conversations/:conversationId
// - DELETE /conversations
// - POST   /stream    (SSE streaming — primary frontend endpoint)
// - POST   /chat      (non-streaming)

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { authMiddleware } from "../../../middleware/auth.middleware";
import { authorizeByMethod } from "../../../middleware/authorize.middleware";
import { rateLimitMiddleware } from "../../../middleware/rateLimit.middleware";
import {
  chatRequestSchema,
  titleUpdateSchema,
} from "../../../schemas/request.schemas";
import { validate } from "../../../middleware/validate.middleware";
import { logger } from "../../../utils/logger";
import { ConversationNotFoundError } from "../../../services/prismaChat.service";
import {
  resolveChatPreferredLanguage,
  type ChatLanguage,
} from "../../../modules/chat/presentation/chatLanguage.service";
import { resolveGenericChatFailureMessage } from "../../../modules/chat/presentation/chatMicrocopy.service";
import {
  toChatFinalEvent,
  toChatHttpEnvelope,
} from "../../../modules/chat/api/chatResultEnvelope";

import type {
  StreamSink,
  StreamEvent,
  StreamDelta,
  StreamTransport,
  LLMStreamingConfig,
} from "../../../services/llm/types/llmStreaming.types";

const router = Router();
const authorizeChat = authorizeByMethod("chat");

function getChatService(req: Request): any {
  const svc = (req.app.locals?.services as any)?.chat;
  if (!svc) throw new Error("CHAT_SERVICE_NOT_WIRED");
  return svc;
}

function getUserId(req: Request): string | null {
  const anyReq = req as any;
  const userId = anyReq?.user?.id || anyReq?.userId || anyReq?.auth?.userId;
  return typeof userId === "string" && userId.trim() ? userId.trim() : null;
}

function resolveRequestId(req: Request): string | null {
  const reqId = typeof req.requestId === "string" ? req.requestId.trim() : "";
  if (reqId) return reqId;
  const header =
    typeof req.headers["x-request-id"] === "string"
      ? req.headers["x-request-id"].trim()
      : "";
  return header || null;
}

function attachRequestIdToMeta(
  req: Request,
  meta: Record<string, unknown>,
): void {
  const requestId = resolveRequestId(req);
  if (requestId && !meta.requestId) {
    meta.requestId = requestId;
  }
  // Always propagate the HTTP middleware requestId so the runtime can
  // fall back to it when body meta.requestId is absent or invalid.
  if (requestId) {
    meta.httpRequestId = requestId;
  }
}

const resolvePreferredLanguage = resolveChatPreferredLanguage;

function extractAttachedDocumentIdsFromBody(body: any): string[] {
  const ids = new Set<string>();
  if (!body || typeof body !== "object") return [];

  const fromLegacyIds = Array.isArray(body.documentIds) ? body.documentIds : [];
  for (const id of fromLegacyIds) {
    const normalized = typeof id === "string" ? id.trim() : "";
    if (normalized) ids.add(normalized);
  }

  const fromArray = Array.isArray(body.attachedDocuments)
    ? body.attachedDocuments
    : [];
  for (const item of fromArray) {
    const id = typeof item?.id === "string" ? item.id.trim() : "";
    if (id) ids.add(id);
  }

  const single =
    typeof body.attachedDocumentId === "string"
      ? body.attachedDocumentId.trim()
      : "";
  if (single) ids.add(single);

  return [...ids];
}

function readRouteMessage(body: any): string {
  const raw =
    typeof body?.content === "string"
      ? body.content
      : typeof body?.message === "string"
        ? body.message
        : "";
  return raw.trim();
}

function isConversationNotFoundError(e: unknown): boolean {
  if (!e) return false;
  if (e instanceof ConversationNotFoundError) return true;
  const anyErr = e as any;
  return String(anyErr?.code || "").trim() === "CONVERSATION_NOT_FOUND";
}

const DEFAULT_STREAMING_CONFIG: LLMStreamingConfig = {
  chunking: { maxCharsPerDelta: 64 },
  markerHold: { enabled: false, flushAt: "final", maxBufferedMarkers: 0 },
};

type StreamLatencyTracker = {
  requestStartedAt: number;
  ackMs: number | null;
  streamStarted: boolean;
  streamStartedAt: number | null;
  firstTokenReceived: boolean;
  firstTokenMs: number | null;
  firstUsefulContentMs: number | null;
  streamEnded: boolean;
  clientDisconnected: boolean;
  wasAborted: boolean;
  sseErrors: string[];
  chunksSent: number;
  streamDurationMs: number | null;
  visibleText: string;
};

function createStreamLatencyTracker(
  requestStartedAt: number,
): StreamLatencyTracker {
  return {
    requestStartedAt,
    ackMs: null,
    streamStarted: false,
    streamStartedAt: null,
    firstTokenReceived: false,
    firstTokenMs: null,
    firstUsefulContentMs: null,
    streamEnded: false,
    clientDisconnected: false,
    wasAborted: false,
    sseErrors: [],
    chunksSent: 0,
    streamDurationMs: null,
    visibleText: "",
  };
}

function noteFirstUsefulContent(
  telemetry: StreamLatencyTracker,
  incomingText: string,
): void {
  if (telemetry.firstUsefulContentMs !== null) return;
  telemetry.visibleText += incomingText;
  const normalized = telemetry.visibleText.replace(/\s+/g, " ").trim();
  const hasBullet = /(^|\n)\s*(?:[-*•]|\d+\.)\s+\S/m.test(
    telemetry.visibleText,
  );
  const hasTableRow = /\|[^|\n]+\|[^|\n]+\|/.test(telemetry.visibleText);
  if (normalized.length >= 120 || hasBullet || hasTableRow) {
    telemetry.firstUsefulContentMs = Date.now() - telemetry.requestStartedAt;
  }
}

function markStreamStarted(telemetry: StreamLatencyTracker): void {
  if (telemetry.streamStarted) return;
  telemetry.streamStarted = true;
  telemetry.streamStartedAt = Date.now();
}

function markStreamEnded(telemetry: StreamLatencyTracker): void {
  if (telemetry.streamEnded) return;
  telemetry.streamEnded = true;
  if (telemetry.streamStartedAt !== null) {
    telemetry.streamDurationMs = Date.now() - telemetry.streamStartedAt;
  }
}

/**
 * SSE StreamSink adapter: maps LLM StreamEvents to SSE data frames
 * the frontend expects (type: "delta", "error", etc.).
 * Does NOT forward "final" — the route handler sends final with messageId.
 */
class SseStreamSink implements StreamSink {
  transport: StreamTransport = "sse";
  private _open = true;

  constructor(
    private res: Response,
    private language: ChatLanguage = "en",
    private telemetry?: StreamLatencyTracker,
  ) {}

  private normalizeStage(raw: unknown): string {
    const s = String(raw || "").trim();
    if (!s) return "processing";

    // Provider/core stages → UI stages
    if (s === "retrieval") return "retrieving";
    if (s === "compose") return "composing";
    if (s === "generation") return "composing";
    if (s === "validation") return "validating";
    if (s === "render") return "finalizing";

    return s;
  }

  write(event: StreamEvent): void {
    if (!this._open || this.res.writableEnded) return;

    const ev = event.event as string;

    if (ev === "delta") {
      const text = (event.data as StreamDelta).text;
      if (text) {
        if (this.telemetry) {
          this.telemetry.chunksSent += 1;
          if (!this.telemetry.firstTokenReceived) {
            this.telemetry.firstTokenReceived = true;
            this.telemetry.firstTokenMs =
              Date.now() - this.telemetry.requestStartedAt;
          }
          noteFirstUsefulContent(this.telemetry, text);
        }
        this.res.write(`data: ${JSON.stringify({ type: "delta", text })}\n\n`);
      }
    } else if (ev === "meta") {
      // Forward meta event (answerMode, navType) → frontend meta event
      const data = event.data as any;
      this.res.write(
        `data: ${JSON.stringify({ type: "meta", answerMode: data.answerMode, answerClass: data.answerClass ?? null, navType: data.navType ?? null })}\n\n`,
      );
    } else if (ev === "progress") {
      // Map LLM progress events → frontend "stage" events
      const data = event.data as any;
      this.res.write(
        `data: ${JSON.stringify({
          type: "stage",
          stage: this.normalizeStage(data.stage) || "processing",
          message: data.message || "",
          key: data.key || null,
          params: data.params || null,
          phase: data.phase || null,
          step: data.step || null,
          status: data.status || null,
          vars: data.vars || null,
          summary: data.summary || null,
          scope: data.scope || null,
          documentKind: data.documentKind || null,
          documentLabel: data.documentLabel || null,
        })}\n\n`,
      );
    } else if (ev === "worklog") {
      const data = event.data as any;
      this.res.write(
        `data: ${JSON.stringify({ type: "worklog", ...(data || {}) })}\n\n`,
      );
    } else if (ev === "sources") {
      if (this.telemetry && this.telemetry.firstUsefulContentMs === null) {
        this.telemetry.firstUsefulContentMs =
          Date.now() - this.telemetry.requestStartedAt;
      }
      // Forward sources (from RAG integration) → frontend sources event
      const data = event.data as any;
      this.res.write(
        `data: ${JSON.stringify({ type: "sources", sources: data.sources || data })}\n\n`,
      );
    } else if (ev === "followups") {
      // Forward follow-up suggestions → frontend followups event
      const data = event.data as any;
      this.res.write(
        `data: ${JSON.stringify({ type: "followups", followups: data.followups || data })}\n\n`,
      );
    } else if (ev === "action") {
      // Forward file action events (create/rename/delete folder, move/delete document)
      const data = event.data as any;
      this.res.write(
        `data: ${JSON.stringify({ type: "action", ...data })}\n\n`,
      );
    } else if (ev === "listing") {
      if (this.telemetry && this.telemetry.firstUsefulContentMs === null) {
        this.telemetry.firstUsefulContentMs =
          Date.now() - this.telemetry.requestStartedAt;
      }
      // Forward structured file/folder listing → frontend listing event (with optional breadcrumb)
      const data = event.data as any;
      this.res.write(
        `data: ${JSON.stringify({ type: "listing", items: data.items || [], ...(data.breadcrumb?.length ? { breadcrumb: data.breadcrumb } : {}) })}\n\n`,
      );
    } else if (ev === "error") {
      const data = event.data as any;
      if (this.telemetry && data?.message) {
        this.telemetry.sseErrors.push(String(data.message).slice(0, 240));
      }
      const safeMessage =
        resolveGenericChatFailureMessage(
          this.language,
          String(data?.code || data?.message || "stream_error"),
        ) || String(data?.message || "").trim();
      this.res.write(
        `data: ${JSON.stringify({ type: "error", message: safeMessage })}\n\n`,
      );
    }
  }

  flush(): void {
    /* noop for HTTP response */
  }

  close(): void {
    this._open = false;
    if (this.telemetry) {
      markStreamEnded(this.telemetry);
    }
    // Do NOT end the response — the route handler does that after sending final
  }

  isOpen(): boolean {
    return this._open && !this.res.writableEnded;
  }
}

// ---------------------------------------------------------------------------
// SSE Streaming (primary endpoint for ChatInterface.jsx)
// ---------------------------------------------------------------------------

/**
 * POST /stream — SSE streaming chat response
 * Frontend sends: { conversationId?, message, attachedDocuments? }
 * Streams: data: {"type":"meta",...}\n\n, data: {"type":"delta","text":"..."}\n\n, data: {"type":"final",...}\n\n
 */
router.post(
  "/stream",
  authMiddleware,
  authorizeChat,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const requestStartedAt = Date.now();
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message || "Invalid request" });
      return;
    }

    const { message, conversationId, language, isRegenerate } = parsed.data;
    const confirmationToken = (parsed.data as any).confirmationToken as
      | string
      | undefined;

    const attachedDocumentIds = extractAttachedDocumentIdsFromBody(parsed.data);

    // Server-side language resolution: infer from user query text (language is query-driven).
    const preferredLanguage = resolvePreferredLanguage(language, message);

    const rawMeta = (parsed.data as any).meta as
      | Record<string, unknown>
      | undefined;
    const meta: Record<string, unknown> = {
      ...(rawMeta || {}),
      viewerMode: false,
    };
    const streamTelemetry = createStreamLatencyTracker(requestStartedAt);
    meta.streamTelemetry = streamTelemetry;
    attachRequestIdToMeta(req, meta);
    // Never trust viewer-only context on the normal chat endpoint.
    delete (meta as any).viewerContext;
    delete (meta as any).viewerSelection;
    delete (meta as any).viewerHistory;

    // Resolve the best-effort traceId for the response header.
    // The runtime will use the same meta values so this will match unless
    // both meta.requestId and meta.httpRequestId are missing/invalid.
    const sseTraceId = String(meta.requestId || meta.httpRequestId || "").trim();

    // SSE headers (set before try so finally can always end)
    const sseHeaders: Record<string, string> = {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    };
    if (sseTraceId) sseHeaders["x-trace-id"] = sseTraceId;
    res.writeHead(200, sseHeaders);
    res.flushHeaders();
    markStreamStarted(streamTelemetry);
    res.write(`data: ${JSON.stringify({ type: "chat_start" })}\n\n`);
    streamTelemetry.ackMs = Date.now() - requestStartedAt;
    res.on("close", () => {
      if (!res.writableEnded) {
        streamTelemetry.clientDisconnected = true;
        streamTelemetry.wasAborted = true;
        markStreamEnded(streamTelemetry);
      }
    });

    try {
      const isViewerMode = Boolean((meta as any)?.viewerMode);
      // Always emit an initial stage frame for regular chat; viewer/edit mode has
      // task-specific progress events and should not flash generic retrieval labels.
      if (!isViewerMode) {
        res.write(
          `data: ${JSON.stringify({ type: "stage", stage: "retrieving", key: "allybi.stage.search.scanning_library", params: null, message: "" })}\n\n`,
        );
      }

      const chat = getChatService(req);

      // Create SSE sink
      const sink = new SseStreamSink(res, preferredLanguage, streamTelemetry);

      // SSE keepalive: send a comment every 15s to prevent proxies/browsers
      // from closing the connection during long operations (e.g. slide generation).
      const heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(`: heartbeat\n\n`);
      }, 15_000);

      // Stream chat (persists user + assistant messages internally)
      const connectorContext = (parsed.data as any).connectorContext as
        | Record<string, unknown>
        | undefined;
      const context = (parsed.data as any).context as
        | Record<string, unknown>
        | undefined;

      let result;
      try {
        result = await chat.streamChat({
          req: {
            userId,
            conversationId,
            message: message.trim(),
            attachedDocumentIds,
            preferredLanguage,
            isRegenerate: !!isRegenerate,
            confirmationToken,
            connectorContext: connectorContext as any,
            meta,
            context,
          },
          sink,
          streamingConfig: DEFAULT_STREAMING_CONFIG,
        });
      } finally {
        clearInterval(heartbeat);
      }

      // Send final event with message IDs, sources, and dynamic answerMode
      if (!res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({ type: "worklog", eventType: "RUN_COMPLETE", summary: "Completed" })}\n\n`,
        );
        res.write(`data: ${JSON.stringify(toChatFinalEvent(result))}\n\n`);
      }
    } catch (e: any) {
      streamTelemetry.sseErrors.push(String(e?.message || "stream_route_error"));
      if (isConversationNotFoundError(e)) {
        if (!res.writableEnded) {
          res.write(
            `data: ${JSON.stringify({ type: "error", message: "Conversation not found" })}\n\n`,
          );
        }
        return;
      }
      logger.error("[Chat] stream error", {
        path: req.path,
        error: e?.message,
        stack: e?.stack,
      });
      const exposeDebugError =
        String(process.env.CHAT_STREAM_DEBUG_ERRORS || "")
          .trim()
          .toLowerCase() === "true";
      const genericMessage = resolveGenericChatFailureMessage(
        preferredLanguage,
        "stream_route_error",
      );
      const debugSuffix =
        exposeDebugError && e?.message
          ? ` [debug: ${String(e.message).slice(0, 500)}]`
          : "";
      if (!res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({ type: "worklog", eventType: "RUN_ERROR", summary: "Request failed" })}\n\n`,
        );
        res.write(
          `data: ${JSON.stringify({ type: "error", message: `${genericMessage}${debugSuffix}` })}\n\n`,
        );
      }
    } finally {
      markStreamEnded(streamTelemetry);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        res.end();
      }
    }
  },
);

/**
 * POST /chat — non-streaming chat
 * Frontend sends: { conversationId?, message }
 */
router.post(
  "/chat",
  authMiddleware,
  authorizeChat,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message || "Invalid request" });
      return;
    }

    const { message, conversationId, language } = parsed.data;
    const confirmationToken = (parsed.data as any).confirmationToken as
      | string
      | undefined;
    const chatAttDocIds = extractAttachedDocumentIdsFromBody(parsed.data);

    try {
      const connectorContext = (parsed.data as any).connectorContext as
        | Record<string, unknown>
        | undefined;
      const rawMeta = (parsed.data as any).meta as
        | Record<string, unknown>
        | undefined;
      const meta: Record<string, unknown> = {
        ...(rawMeta || {}),
        viewerMode: false,
      };
      attachRequestIdToMeta(req, meta);
      delete (meta as any).viewerContext;
      delete (meta as any).viewerSelection;
      delete (meta as any).viewerHistory;
      const context = (parsed.data as any).context as
        | Record<string, unknown>
        | undefined;
      const chat = getChatService(req);
      const result = await chat.chat({
        userId,
        conversationId,
        message: message.trim(),
        attachedDocumentIds: chatAttDocIds,
        preferredLanguage: resolvePreferredLanguage(language, message),
        confirmationToken,
        connectorContext: connectorContext as any,
        meta,
        context,
      });
      if (result.traceId) res.setHeader("x-trace-id", result.traceId);
      res.json(toChatHttpEnvelope(result));
    } catch (e: any) {
      if (isConversationNotFoundError(e)) {
        res.status(404).json({
          error: "Conversation not found",
          code: "CONVERSATION_NOT_FOUND",
        });
        return;
      }
      logger.error("[Chat] chat error", {
        path: req.path,
        error: e?.message,
        stack: e?.stack,
      });
      res.status(500).json({ error: "Failed to process chat" });
    }
  },
);

// ---------------------------------------------------------------------------
// Conversation CRUD
// ---------------------------------------------------------------------------

/**
 * GET /conversations — list conversations
 */
router.get(
  "/conversations",
  authMiddleware,
  authorizeChat,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const chat = getChatService(req);
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const cursor = req.query.cursor ? String(req.query.cursor) : undefined;

      const conversations = await chat.listConversations(userId, {
        limit,
        cursor,
      });
      res.json({ ok: true, data: { conversations } });
    } catch (e) {
      logger.error("[Chat] list conversations error", { path: req.path });
      res.status(500).json({ error: "Failed to list conversations" });
    }
  },
);

/**
 * POST /conversations — create a new conversation
 */
router.post(
  "/conversations",
  authMiddleware,
  authorizeChat,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const title = req.body?.title || "New Chat";

    try {
      const chat = getChatService(req);
      const conv = await chat.createConversation({ userId, title });
      res.status(201).json({ ok: true, data: conv });
    } catch (e) {
      logger.error("[Chat] create conversation error", { path: req.path });
      res.status(500).json({ error: "Failed to create conversation" });
    }
  },
);

/**
 * POST /conversations/new — alias for create conversation (frontend compatibility)
 */
router.post(
  "/conversations/new",
  authMiddleware,
  authorizeChat,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const title = req.body?.title || "New Chat";

    try {
      const chat = getChatService(req);
      const conv = await chat.createConversation({ userId, title });
      res.status(201).json({ ok: true, data: conv });
    } catch (e) {
      logger.error("[Chat] create conversation error", { path: req.path });
      res.status(500).json({ error: "Failed to create conversation" });
    }
  },
);

/**
 * GET /conversations/:conversationId — get conversation with messages
 */
router.get(
  "/conversations/:conversationId",
  authMiddleware,
  authorizeChat,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const conversationId = req.params.conversationId;

    try {
      const chat = getChatService(req);
      const data = await chat.getConversationWithMessages(
        userId,
        conversationId,
        { order: "asc" },
      );
      if (!data) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }

      // Shape response to match frontend expectations
      res.json({
        ok: true,
        data: {
          id: data.id,
          title: data.title,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          messages: data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
            metadata: m.metadata || null,
          })),
        },
      });
    } catch (e) {
      logger.error("[Chat] get conversation error", { path: req.path });
      res.status(500).json({ error: "Failed to get conversation" });
    }
  },
);

/**
 * GET /conversations/:conversationId/messages — list messages
 */
router.get(
  "/conversations/:conversationId/messages",
  authMiddleware,
  authorizeChat,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const conversationId = req.params.conversationId;

    try {
      const chat = getChatService(req);
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const order =
        req.query.order === "desc" ? ("desc" as const) : ("asc" as const);

      const messages = await chat.listMessages(userId, conversationId, {
        limit,
        order,
      });
      res.json({ ok: true, data: { items: messages } });
    } catch (e) {
      logger.error("[Chat] list messages error", { path: req.path });
      res.status(500).json({ error: "Failed to list messages" });
    }
  },
);

/**
 * POST /conversations/:conversationId/messages — send message (non-stream)
 * Delegates to chat service for AI response.
 */
router.post(
  "/conversations/:conversationId/messages",
  authMiddleware,
  authorizeChat,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const conversationId = req.params.conversationId;
    const message = readRouteMessage(req.body);
    if (!message) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    const rawMeta = req.body?.meta as Record<string, unknown> | undefined;
    const meta: Record<string, unknown> = {
      ...(rawMeta || {}),
      viewerMode: false,
    };
    attachRequestIdToMeta(req, meta);
    delete (meta as any).viewerContext;
    delete (meta as any).viewerSelection;
    delete (meta as any).viewerHistory;
    const context = req.body?.context as Record<string, unknown> | undefined;
    const connectorContext = req.body?.connectorContext as
      | Record<string, unknown>
      | undefined;

    try {
      const chat = getChatService(req);
      const result = await chat.chat({
        userId,
        conversationId,
        message,
        attachedDocumentIds: extractAttachedDocumentIdsFromBody(req.body),
        preferredLanguage: resolvePreferredLanguage(
          req.body?.language,
          message,
        ),
        meta,
        context,
        connectorContext: connectorContext as any,
      });

      if (result.traceId) res.setHeader("x-trace-id", result.traceId);
      const envelope = toChatHttpEnvelope(result);
      res.json({
        ...envelope,
        userMessage: {
          id: result.userMessageId,
          role: "user",
          content: message,
          createdAt: new Date().toISOString(),
        },
        assistantMessage: {
          id: result.assistantMessageId,
          role: "assistant",
          content: result.assistantText,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      if (isConversationNotFoundError(e)) {
        res.status(404).json({
          error: "Conversation not found",
          code: "CONVERSATION_NOT_FOUND",
        });
        return;
      }
      logger.error("[Chat] send message error", { path: req.path });
      res.status(500).json({ error: "Failed to send message" });
    }
  },
);

/**
 * POST /conversations/:conversationId/messages/adaptive — adaptive message
 * Delegates to chat service.
 */
router.post(
  "/conversations/:conversationId/messages/adaptive",
  authMiddleware,
  authorizeChat,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const conversationId = req.params.conversationId;
    const message = readRouteMessage(req.body);
    if (!message) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    const rawMeta = req.body?.meta as Record<string, unknown> | undefined;
    const meta: Record<string, unknown> = {
      ...(rawMeta || {}),
      viewerMode: false,
    };
    attachRequestIdToMeta(req, meta);
    delete (meta as any).viewerContext;
    delete (meta as any).viewerSelection;
    delete (meta as any).viewerHistory;
    const context = req.body?.context as Record<string, unknown> | undefined;
    const connectorContext = req.body?.connectorContext as
      | Record<string, unknown>
      | undefined;

    try {
      const chat = getChatService(req);
      const result = await chat.chat({
        userId,
        conversationId,
        message,
        attachedDocumentIds: extractAttachedDocumentIdsFromBody(req.body),
        preferredLanguage: resolvePreferredLanguage(
          req.body?.language,
          message,
        ),
        meta,
        context,
        connectorContext: connectorContext as any,
      });

      if (result.traceId) res.setHeader("x-trace-id", result.traceId);
      const envelope = toChatHttpEnvelope(result);
      res.json({
        ...envelope,
        id: result.assistantMessageId,
        role: "assistant",
        content: result.assistantText,
        createdAt: new Date().toISOString(),
        queryType: "general",
        confidence: 1.0,
      });
    } catch (e) {
      if (isConversationNotFoundError(e)) {
        res.status(404).json({
          error: "Conversation not found",
          code: "CONVERSATION_NOT_FOUND",
        });
        return;
      }
      logger.error("[Chat] adaptive message error", { path: req.path });
      res.status(500).json({ error: "Failed to process adaptive message" });
    }
  },
);

/**
 * POST /conversations/:conversationId/messages/adaptive/stream — SSE adaptive streaming
 * Delegates to chat service streamChat.
 */
router.post(
  "/conversations/:conversationId/messages/adaptive/stream",
  authMiddleware,
  authorizeChat,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const requestStartedAt = Date.now();
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const conversationId = req.params.conversationId;
    const message = readRouteMessage(req.body);
    if (!message) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    const rawMeta = req.body?.meta as Record<string, unknown> | undefined;
    const meta: Record<string, unknown> = {
      ...(rawMeta || {}),
      viewerMode: false,
    };
    const streamTelemetry = createStreamLatencyTracker(requestStartedAt);
    meta.streamTelemetry = streamTelemetry;
    attachRequestIdToMeta(req, meta);
    delete (meta as any).viewerContext;
    delete (meta as any).viewerSelection;
    delete (meta as any).viewerHistory;
    const context = req.body?.context as Record<string, unknown> | undefined;
    const connectorContext = req.body?.connectorContext as
      | Record<string, unknown>
      | undefined;

    try {
      const chat = getChatService(req);

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      // Best-effort traceId header — matches what the runtime will resolve
      const adaptiveTraceId = String(meta.requestId || meta.httpRequestId || "").trim();
      if (adaptiveTraceId) res.setHeader("x-trace-id", adaptiveTraceId);

      markStreamStarted(streamTelemetry);
      res.write(`data: ${JSON.stringify({ type: "chat_start" })}\n\n`);
      streamTelemetry.ackMs = Date.now() - requestStartedAt;
      res.write(
        `data: ${JSON.stringify({ type: "connected", conversationId })}\n\n`,
      );
      res.on("close", () => {
        if (!res.writableEnded) {
          streamTelemetry.clientDisconnected = true;
          streamTelemetry.wasAborted = true;
          markStreamEnded(streamTelemetry);
        }
      });

      const preferredLanguage = resolvePreferredLanguage(
        req.body?.language,
        message,
      );
      const sink = new SseStreamSink(res, preferredLanguage, streamTelemetry);

      // SSE keepalive for long operations (e.g. slide generation)
      const heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(`: heartbeat\n\n`);
      }, 15_000);

      let result;
      try {
        result = await chat.streamChat({
          req: {
            userId,
            conversationId,
            message,
            attachedDocumentIds: extractAttachedDocumentIdsFromBody(req.body),
            preferredLanguage,
            connectorContext: connectorContext as any,
            meta,
            context,
          },
          sink,
          streamingConfig: DEFAULT_STREAMING_CONFIG,
        });
      } finally {
        clearInterval(heartbeat);
      }

      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(toChatFinalEvent(result))}\n\n`);
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      }

      markStreamEnded(streamTelemetry);
      res.end();
    } catch (e: any) {
      streamTelemetry.sseErrors.push(String(e?.message || "adaptive_stream_error"));
      if (isConversationNotFoundError(e)) {
        if (!res.headersSent) {
          res.status(404).json({
            error: "Conversation not found",
            code: "CONVERSATION_NOT_FOUND",
          });
        } else if (!res.writableEnded) {
          res.write(
            `data: ${JSON.stringify({ type: "error", message: "Conversation not found" })}\n\n`,
          );
          markStreamEnded(streamTelemetry);
          res.end();
        }
        return;
      }
      logger.error("[Chat] adaptive stream error", { path: req.path });
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to stream" });
      } else if (!res.writableEnded) {
        const preferredLanguage = resolvePreferredLanguage(
          req.body?.language,
          message,
        );
        res.write(
          `data: ${JSON.stringify({ type: "error", message: resolveGenericChatFailureMessage(preferredLanguage, "adaptive_stream_route_error") })}\n\n`,
        );
        markStreamEnded(streamTelemetry);
        res.end();
      }
    }
  },
);

/**
 * PATCH /conversations/:conversationId/title — rename conversation
 */
router.patch(
  "/conversations/:conversationId/title",
  authMiddleware,
  authorizeChat,
  rateLimitMiddleware,
  validate(titleUpdateSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const conversationId = req.params.conversationId;
    const { title } = req.body;

    try {
      const chat = getChatService(req);
      const updated = await chat.updateTitle(userId, conversationId, title);
      if (!updated) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      res.json({
        ok: true,
        data: { conversationId: updated.id, title: updated.title },
      });
    } catch (e) {
      logger.error("[Chat] update title error", { path: req.path });
      res.status(500).json({ error: "Failed to update title" });
    }
  },
);

/**
 * DELETE /conversations/empty — delete empty conversations (MUST be before /:id)
 */
router.delete(
  "/conversations/empty",
  authMiddleware,
  authorizeChat,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      // Grace period: never delete conversations created in the last 60 seconds.
      // This prevents a race condition where a conversation is created by the
      // frontend just before the first message is streamed to it.
      const graceCutoff = new Date(Date.now() - 60_000);

      const emptyConvos = await (
        await import("../../../config/database")
      ).default.conversation.findMany({
        where: {
          userId,
          isDeleted: false,
          messages: { none: {} },
          createdAt: { lt: graceCutoff },
        },
        select: { id: true },
      });

      if (emptyConvos.length > 0) {
        await (
          await import("../../../config/database")
        ).default.conversation.updateMany({
          where: { id: { in: emptyConvos.map((c: any) => c.id) } },
          data: { isDeleted: true, deletedAt: new Date() },
        });
      }

      res.json({ ok: true, data: { deleted: emptyConvos.length } });
    } catch (e) {
      logger.error("[Chat] delete empty conversations error", {
        path: req.path,
      });
      res.status(500).json({ error: "Failed to delete empty conversations" });
    }
  },
);

/**
 * DELETE /conversations/:conversationId — soft-delete conversation
 */
router.delete(
  "/conversations/:conversationId",
  authMiddleware,
  authorizeChat,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const chat = getChatService(req);
      const result = await chat.deleteConversation(
        userId,
        req.params.conversationId,
      );
      res.json({ ok: true, data: result });
    } catch (e) {
      logger.error("[Chat] delete conversation error", { path: req.path });
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  },
);

/**
 * DELETE /conversations — soft-delete all conversations
 */
router.delete(
  "/conversations",
  authMiddleware,
  authorizeChat,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const chat = getChatService(req);
      const result = await chat.deleteAllConversations(userId);
      res.json({ ok: true, data: result });
    } catch (e) {
      logger.error("[Chat] delete all conversations error", { path: req.path });
      res.status(500).json({ error: "Failed to delete conversations" });
    }
  },
);

export default router;
