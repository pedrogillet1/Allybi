import type { Request, Response } from "express";

/**
 * Clean, DI-friendly Chat Controller (ChatGPT-like streaming).
 * - Controller does NOT build answers.
 * - Controller does NOT contain domain/routing logic.
 * - It delegates to a ChatService / Orchestrator facade that returns:
 *   { content, attachments, answerMode, meta } or streams tokens/events.
 *
 * This file is safe to keep even while you refactor core engines:
 * you only need to keep the ChatService interface stable.
 */

export type Lang = "en" | "pt" | "es";

export type AnswerMode =
  | "nav_pills"
  | "rank_disambiguate"
  | "rank_autopick"
  | "doc_grounded_single"
  | "doc_grounded_table"
  | "doc_grounded_quote"
  | "doc_grounded_multi"
  | "doc_discovery_list"
  | "help_steps"
  | "no_docs"
  | "scoped_not_found"
  | "refusal"
  | "general_answer";

export type Attachment =
  | {
      type: "source_buttons";
      answerMode?: "nav_pills" | "rank_disambiguate" | string;
      buttons: Array<{
        documentId: string;
        title: string;
        filename?: string;
        mimeType?: string;
        location?: { type: "page" | "slide" | "sheet" | "cell" | "section"; value: string | number; label?: string };
      }>;
      seeAll?: { label: string; totalCount: number; remainingCount: number };
    }
  | {
      type: "file_list";
      items: Array<{
        id?: string;
        documentId?: string;
        filename: string;
        mimeType?: string;
        folderPath?: string;
      }>;
      totalCount?: number;
      seeAll?: { label: string; totalCount: number; remainingCount: number };
    }
  | {
      type: "select_file";
      prompt: string;
      options: any[];
    }
  | Record<string, any>;

export interface ChatTurnResult {
  conversationId: string;
  messageId: string;
  answerMode: AnswerMode;
  content: string;
  attachments?: Attachment[];
  meta?: Record<string, any>;
}

export interface ChatStreamEvent {
  type: "token" | "final" | "meta" | "error";
  data: any;
}

export interface ChatService {
  chat(input: {
    userId: string;
    conversationId?: string;
    message: string;
    regenCount?: number;
    clientMessageId?: string;
    lang?: Lang;
  }): Promise<ChatTurnResult>;

  streamChat(input: {
    userId: string;
    conversationId?: string;
    message: string;
    regenCount?: number;
    clientMessageId?: string;
    lang?: Lang;
    signal?: AbortSignal;
  }): AsyncIterable<ChatStreamEvent>;

  listConversations(input: { userId: string; limit?: number; cursor?: string }): Promise<{
    items: Array<{ conversationId: string; title: string; updatedAt: string }>;
    nextCursor?: string;
  }>;

  listMessages(input: { userId: string; conversationId: string; limit?: number; cursor?: string }): Promise<{
    items: Array<{
      messageId: string;
      role: "user" | "assistant";
      content: string;
      createdAt: string;
      answerMode?: AnswerMode;
      attachments?: Attachment[];
    }>;
    nextCursor?: string;
  }>;

  setTitle(input: { userId: string; conversationId: string; title: string }): Promise<{ conversationId: string; title: string }>;
}

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: { code: string; message: string } };

function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ ok: true, data } satisfies ApiOk<T>);
}

function err(res: Response, code: string, message: string, status = 400) {
  return res.status(status).json({ ok: false, error: { code, message } } satisfies ApiErr);
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function getLang(req: Request): Lang | undefined {
  const h = asString(req.header("x-lang") || req.header("accept-language"));
  if (!h) return undefined;
  if (h.toLowerCase().includes("pt")) return "pt";
  if (h.toLowerCase().includes("es")) return "es";
  return "en";
}

function getUserId(req: Request): string | null {
  const anyReq = req as any;
  const userId = anyReq?.user?.id || anyReq?.userId || anyReq?.auth?.userId;
  return typeof userId === "string" && userId.trim() ? userId.trim() : null;
}

function setSseHeaders(res: Response) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
}

function sseSend(res: Response, event: string, data: any) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function mapError(e: unknown): { code: string; message: string; status: number } {
  const msg = e instanceof Error ? e.message : "Unknown error";
  const m = msg.toLowerCase();

  if (m.includes("unauthorized") || m.includes("not authenticated")) {
    return { code: "AUTH_UNAUTHORIZED", message: "Not authenticated.", status: 401 };
  }
  if (m.includes("rate limit")) {
    return { code: "RATE_LIMITED", message: "Too many requests. Try again shortly.", status: 429 };
  }
  if (m.includes("payload too large")) {
    return { code: "PAYLOAD_TOO_LARGE", message: "Message too large.", status: 413 };
  }
  return { code: "CHAT_ERROR", message: msg || "Chat error.", status: 400 };
}

export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  chat = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const message = asString((req.body as any)?.message);
    if (!message) return err(res, "VALIDATION_MESSAGE_REQUIRED", "Message is required.", 400);

    const conversationId = asString((req.body as any)?.conversationId) ?? undefined;
    const clientMessageId = asString((req.body as any)?.clientMessageId) ?? undefined;
    const regenCountRaw = (req.body as any)?.regenCount;
    const regenCount = typeof regenCountRaw === "number" && regenCountRaw >= 0 ? regenCountRaw : 0;

    try {
      const result = await this.chatService.chat({
        userId,
        conversationId,
        message,
        regenCount,
        clientMessageId,
        lang: getLang(req),
      });
      return ok(res, result, 200);
    } catch (e) {
      const mapped = mapError(e);
      return err(res, mapped.code, mapped.message, mapped.status);
    }
  };

  stream = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const message = asString((req.body as any)?.message);
    if (!message) return err(res, "VALIDATION_MESSAGE_REQUIRED", "Message is required.", 400);

    const conversationId = asString((req.body as any)?.conversationId) ?? undefined;
    const clientMessageId = asString((req.body as any)?.clientMessageId) ?? undefined;
    const regenCountRaw = (req.body as any)?.regenCount;
    const regenCount = typeof regenCountRaw === "number" && regenCountRaw >= 0 ? regenCountRaw : 0;

    const ac = new AbortController();
    req.on("close", () => ac.abort());

    setSseHeaders(res);
    sseSend(res, "meta", { conversationId, clientMessageId, regenCount });

    try {
      for await (const evt of this.chatService.streamChat({
        userId,
        conversationId,
        message,
        regenCount,
        clientMessageId,
        lang: getLang(req),
        signal: ac.signal,
      })) {
        if (ac.signal.aborted) break;

        if (evt.type === "token") {
          sseSend(res, "token", evt.data);
          continue;
        }

        if (evt.type === "meta") {
          sseSend(res, "meta", evt.data);
          continue;
        }

        if (evt.type === "final") {
          sseSend(res, "final", evt.data);
          break;
        }

        if (evt.type === "error") {
          sseSend(res, "error", evt.data);
          break;
        }
      }
    } catch (e) {
      const mapped = mapError(e);
      sseSend(res, "error", { code: mapped.code, message: mapped.message });
    } finally {
      res.end();
    }
  };

  listConversations = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const limitRaw = asString(req.query.limit);
    const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 30, 1), 100) : 30;
    const cursor = asString(req.query.cursor) ?? undefined;

    try {
      const result = await this.chatService.listConversations({ userId, limit, cursor });
      return ok(res, result, 200);
    } catch (e) {
      const mapped = mapError(e);
      return err(res, mapped.code, mapped.message, mapped.status);
    }
  };

  listMessages = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const conversationId = asString(req.params.conversationId);
    if (!conversationId) return err(res, "VALIDATION_CONVERSATION_REQUIRED", "conversationId is required.", 400);

    const limitRaw = asString(req.query.limit);
    const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 50, 1), 200) : 50;
    const cursor = asString(req.query.cursor) ?? undefined;

    try {
      const result = await this.chatService.listMessages({ userId, conversationId, limit, cursor });
      return ok(res, result, 200);
    } catch (e) {
      const mapped = mapError(e);
      return err(res, mapped.code, mapped.message, mapped.status);
    }
  };

  setTitle = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const conversationId = asString(req.params.conversationId);
    if (!conversationId) return err(res, "VALIDATION_CONVERSATION_REQUIRED", "conversationId is required.", 400);

    const title = asString((req.body as any)?.title);
    if (!title) return err(res, "VALIDATION_TITLE_REQUIRED", "title is required.", 400);

    try {
      const result = await this.chatService.setTitle({ userId, conversationId, title });
      return ok(res, result, 200);
    } catch (e) {
      const mapped = mapError(e);
      return err(res, mapped.code, mapped.message, mapped.status);
    }
  };
}

export function createChatController(chatService: ChatService) {
  return new ChatController(chatService);
}
