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
import { authMiddleware } from "../middleware/auth.middleware";
import { rateLimitMiddleware } from "../middleware/rateLimit.middleware";
import { chatRequestSchema, titleUpdateSchema } from "../schemas/request.schemas";
import { validate } from "../middleware/validate.middleware";
import { logger } from "../utils/logger";

import type {
  StreamSink,
  StreamEvent,
  StreamDelta,
  StreamTransport,
  LLMStreamingConfig,
} from "../services/llm/types/llmStreaming.types";

const router = Router();

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

const DEFAULT_STREAMING_CONFIG: LLMStreamingConfig = {
  chunking: { maxCharsPerDelta: 64 },
  markerHold: { enabled: false, flushAt: "final", maxBufferedMarkers: 0 },
};

/**
 * SSE StreamSink adapter: maps LLM StreamEvents to SSE data frames
 * the frontend expects (type: "delta", "error", etc.).
 * Does NOT forward "final" — the route handler sends final with messageId.
 */
class SseStreamSink implements StreamSink {
  transport: StreamTransport = "sse";
  private _open = true;

  constructor(private res: Response) {}

  write(event: StreamEvent): void {
    if (!this._open || this.res.writableEnded) return;

    const ev = event.event as string;

    if (ev === "delta") {
      const text = (event.data as StreamDelta).text;
      if (text) {
        this.res.write(`data: ${JSON.stringify({ type: "delta", text })}\n\n`);
      }
    } else if (ev === "meta") {
      // Forward meta event (answerMode, navType) → frontend meta event
      const data = event.data as any;
      this.res.write(`data: ${JSON.stringify({ type: "meta", answerMode: data.answerMode, navType: data.navType ?? null })}\n\n`);
    } else if (ev === "progress") {
      // Map LLM progress events → frontend "stage" events
      const data = event.data as any;
      this.res.write(`data: ${JSON.stringify({ type: "stage", stage: data.stage || "processing", message: data.message || "" })}\n\n`);
    } else if (ev === "sources") {
      // Forward sources (from RAG integration) → frontend sources event
      const data = event.data as any;
      this.res.write(`data: ${JSON.stringify({ type: "sources", sources: data.sources || data })}\n\n`);
    } else if (ev === "followups") {
      // Forward follow-up suggestions → frontend followups event
      const data = event.data as any;
      this.res.write(`data: ${JSON.stringify({ type: "followups", followups: data.followups || data })}\n\n`);
    } else if (ev === "action") {
      // Forward file action events (create/rename/delete folder, move/delete document)
      const data = event.data as any;
      this.res.write(`data: ${JSON.stringify({ type: "action", ...data })}\n\n`);
    } else if (ev === "error") {
      const data = event.data as any;
      const safeMessage = (process.env.NODE_ENV === 'production')
        ? "Something went wrong. Please try again."
        : (data.message || "Error");
      this.res.write(`data: ${JSON.stringify({ type: "error", message: safeMessage })}\n\n`);
    }
  }

  flush(): void { /* noop for HTTP response */ }

  close(): void {
    this._open = false;
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
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid request" });
      return;
    }

    const { message, conversationId } = parsed.data;

    try {
      const chat = getChatService(req);

      // SSE headers
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });

      // NOTE: meta event (answerMode, navType) is emitted by streamChat() after retrieval,
      // so the frontend gets an accurate answerMode based on retrieved sources.

      // Create SSE sink
      const sink = new SseStreamSink(res);

      // Stream chat (persists user + assistant messages internally)
      const result = await chat.streamChat({
        req: { userId, conversationId, message: message.trim() },
        sink,
        streamingConfig: DEFAULT_STREAMING_CONFIG,
      });

      // Send final event with message IDs, sources, and dynamic answerMode
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({
          type: "final",
          conversationId: result.conversationId,
          messageId: result.assistantMessageId,
          content: result.assistantText,
          answerMode: result.answerMode || "general_answer",
          navType: result.navType || null,
          sources: result.sources || [],
          ...(result.generatedTitle ? { generatedTitle: result.generatedTitle } : {}),
        })}\n\n`);
      }

      res.end();
    } catch (e: any) {
      logger.error("[Chat] stream error", { path: req.path, error: e?.message, stack: e?.stack });
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to stream" });
      } else if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: "error", message: "An error occurred while streaming the response" })}\n\n`);
        res.end();
      }
    }
  }
);

/**
 * POST /chat — non-streaming chat
 * Frontend sends: { conversationId?, message }
 */
router.post(
  "/chat",
  authMiddleware,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid request" });
      return;
    }

    const { message, conversationId } = parsed.data;

    try {
      const chat = getChatService(req);
      const result = await chat.chat({ userId, conversationId, message: message.trim() });
      res.json({ ok: true, data: result });
    } catch (e: any) {
      logger.error("[Chat] chat error", { path: req.path });
      res.status(500).json({ error: "Failed to process chat" });
    }
  }
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
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    try {
      const chat = getChatService(req);
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const cursor = req.query.cursor ? String(req.query.cursor) : undefined;

      const conversations = await chat.listConversations(userId, { limit, cursor });
      res.json({ conversations });
    } catch (e) {
      logger.error("[Chat] list conversations error", { path: req.path });
      res.status(500).json({ error: "Failed to list conversations" });
    }
  }
);

/**
 * POST /conversations — create a new conversation
 */
router.post(
  "/conversations",
  authMiddleware,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const title = req.body?.title || "New Chat";

    try {
      const chat = getChatService(req);
      const conv = await chat.createConversation({ userId, title });
      res.status(201).json(conv);
    } catch (e) {
      logger.error("[Chat] create conversation error", { path: req.path });
      res.status(500).json({ error: "Failed to create conversation" });
    }
  }
);

/**
 * POST /conversations/new — alias for create conversation (frontend compatibility)
 */
router.post(
  "/conversations/new",
  authMiddleware,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const title = req.body?.title || "New Chat";

    try {
      const chat = getChatService(req);
      const conv = await chat.createConversation({ userId, title });
      res.status(201).json(conv);
    } catch (e) {
      logger.error("[Chat] create conversation error", { path: req.path });
      res.status(500).json({ error: "Failed to create conversation" });
    }
  }
);

/**
 * GET /conversations/:conversationId — get conversation with messages
 */
router.get(
  "/conversations/:conversationId",
  authMiddleware,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const conversationId = req.params.conversationId;

    try {
      const chat = getChatService(req);
      const data = await chat.getConversationWithMessages(userId, conversationId, { order: "asc" });
      if (!data) { res.status(404).json({ error: "Conversation not found" }); return; }

      // Shape response to match frontend expectations
      res.json({
        id: data.id,
        title: data.title,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        messages: data.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      });
    } catch (e) {
      logger.error("[Chat] get conversation error", { path: req.path });
      res.status(500).json({ error: "Failed to get conversation" });
    }
  }
);

/**
 * GET /conversations/:conversationId/messages — list messages
 */
router.get(
  "/conversations/:conversationId/messages",
  authMiddleware,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const conversationId = req.params.conversationId;

    try {
      const chat = getChatService(req);
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const order = req.query.order === "desc" ? "desc" as const : "asc" as const;

      const messages = await chat.listMessages(userId, conversationId, { limit, order });
      res.json({ ok: true, data: { items: messages } });
    } catch (e) {
      logger.error("[Chat] list messages error", { path: req.path });
      res.status(500).json({ error: "Failed to list messages" });
    }
  }
);

/**
 * POST /conversations/:conversationId/messages — send message (non-stream)
 * Delegates to chat service for AI response.
 */
router.post(
  "/conversations/:conversationId/messages",
  authMiddleware,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const conversationId = req.params.conversationId;
    const content = req.body?.content;
    if (!content) { res.status(400).json({ error: "content is required" }); return; }

    try {
      const chat = getChatService(req);
      const result = await chat.chat({ userId, conversationId, message: content });

      res.json({
        userMessage: {
          id: result.userMessageId,
          role: "user",
          content,
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
      logger.error("[Chat] send message error", { path: req.path });
      res.status(500).json({ error: "Failed to send message" });
    }
  }
);

/**
 * POST /conversations/:conversationId/messages/adaptive — adaptive message
 * Delegates to chat service.
 */
router.post(
  "/conversations/:conversationId/messages/adaptive",
  authMiddleware,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const conversationId = req.params.conversationId;
    const content = req.body?.content;
    if (!content) { res.status(400).json({ error: "content is required" }); return; }

    try {
      const chat = getChatService(req);
      const result = await chat.chat({ userId, conversationId, message: content });

      res.json({
        id: result.assistantMessageId,
        role: "assistant",
        content: result.assistantText,
        createdAt: new Date().toISOString(),
        queryType: "general",
        confidence: 1.0,
      });
    } catch (e) {
      logger.error("[Chat] adaptive message error", { path: req.path });
      res.status(500).json({ error: "Failed to process adaptive message" });
    }
  }
);

/**
 * POST /conversations/:conversationId/messages/adaptive/stream — SSE adaptive streaming
 * Delegates to chat service streamChat.
 */
router.post(
  "/conversations/:conversationId/messages/adaptive/stream",
  authMiddleware,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const conversationId = req.params.conversationId;
    const content = req.body?.content;
    if (!content) { res.status(400).json({ error: "content is required" }); return; }

    try {
      const chat = getChatService(req);

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      res.write(`data: ${JSON.stringify({ type: "connected", conversationId })}\n\n`);

      const sink = new SseStreamSink(res);

      const result = await chat.streamChat({
        req: { userId, conversationId, message: content },
        sink,
        streamingConfig: DEFAULT_STREAMING_CONFIG,
      });

      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({
          type: "done",
          messageId: result.assistantMessageId,
          content: result.assistantText,
          conversationId: result.conversationId,
          answerMode: result.answerMode || "general_answer",
          navType: result.navType || null,
          sources: result.sources || [],
          ...(result.generatedTitle ? { generatedTitle: result.generatedTitle } : {}),
        })}\n\n`);
      }

      res.end();
    } catch (e: any) {
      logger.error("[Chat] adaptive stream error", { path: req.path });
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to stream" });
      } else if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: "error", message: "An error occurred while streaming the response" })}\n\n`);
        res.end();
      }
    }
  }
);

/**
 * PATCH /conversations/:conversationId/title — rename conversation
 */
router.patch(
  "/conversations/:conversationId/title",
  authMiddleware,
  rateLimitMiddleware,
  validate(titleUpdateSchema),
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const conversationId = req.params.conversationId;
    const { title } = req.body;

    try {
      const chat = getChatService(req);
      const updated = await chat.updateTitle(userId, conversationId, title);
      if (!updated) { res.status(404).json({ error: "Conversation not found" }); return; }
      res.json({ ok: true, data: { conversationId: updated.id, title: updated.title } });
    } catch (e) {
      logger.error("[Chat] update title error", { path: req.path });
      res.status(500).json({ error: "Failed to update title" });
    }
  }
);

/**
 * DELETE /conversations/empty — delete empty conversations (MUST be before /:id)
 */
router.delete(
  "/conversations/empty",
  authMiddleware,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    try {
      const emptyConvos = await (await import("../config/database")).default.conversation.findMany({
        where: { userId, isDeleted: false, messages: { none: {} } },
        select: { id: true },
      });

      if (emptyConvos.length > 0) {
        await (await import("../config/database")).default.conversation.updateMany({
          where: { id: { in: emptyConvos.map((c: any) => c.id) } },
          data: { isDeleted: true, deletedAt: new Date() },
        });
      }

      res.json({ ok: true, deleted: emptyConvos.length });
    } catch (e) {
      logger.error("[Chat] delete empty conversations error", { path: req.path });
      res.status(500).json({ error: "Failed to delete empty conversations" });
    }
  }
);

/**
 * DELETE /conversations/:conversationId — soft-delete conversation
 */
router.delete(
  "/conversations/:conversationId",
  authMiddleware,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    try {
      const chat = getChatService(req);
      const result = await chat.deleteConversation(userId, req.params.conversationId);
      res.json({ ok: true, ...result });
    } catch (e) {
      logger.error("[Chat] delete conversation error", { path: req.path });
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  }
);

/**
 * DELETE /conversations — soft-delete all conversations
 */
router.delete(
  "/conversations",
  authMiddleware,
  rateLimitMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    try {
      const chat = getChatService(req);
      const result = await chat.deleteAllConversations(userId);
      res.json({ ok: true, ...result });
    } catch (e) {
      logger.error("[Chat] delete all conversations error", { path: req.path });
      res.status(500).json({ error: "Failed to delete conversations" });
    }
  }
);

export default router;
