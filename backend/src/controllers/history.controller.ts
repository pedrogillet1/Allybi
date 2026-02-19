import type { Request, Response, NextFunction } from "express";

/**
 * HISTORY CONTROLLER (ChatGPT-like)
 * - Thin controller: no business logic here.
 * - Delegates all persistence + ranking + title generation to a HistoryService.
 * - Works even if you swap DB/storage later.
 *
 * IMPORTANT:
 * This file intentionally does NOT import concrete service implementations
 * (to avoid "Cannot find module ..." explosions while refactoring).
 * It expects your bootstrap/server to attach services onto:
 *   app.locals.services.history
 */

type UUID = string;

export type ConversationVisibility = "active" | "archived" | "deleted";

export interface ConversationSummary {
  id: UUID;
  title: string;
  updatedAt: string;
  createdAt: string;
  pinned?: boolean;
  visibility?: ConversationVisibility;
  messageCount?: number;
  lastMessagePreview?: string;
}

export interface ConversationMessage {
  id: UUID;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ConversationMessage[];
}

export interface ListConversationsResult {
  items: ConversationSummary[];
  nextCursor?: string | null;
}

export interface ChatHistoryService {
  listConversations(args: {
    userId: string;
    limit: number;
    cursor?: string;
    pinnedOnly?: boolean;
    includeArchived?: boolean;
    q?: string;
  }): Promise<ListConversationsResult>;

  getConversation(args: {
    userId: string;
    conversationId: string;
  }): Promise<ConversationDetail | null>;

  updateConversation(args: {
    userId: string;
    conversationId: string;
    patch: Partial<
      Pick<ConversationSummary, "title" | "pinned" | "visibility">
    >;
  }): Promise<ConversationSummary>;

  deleteConversation(args: {
    userId: string;
    conversationId: string;
  }): Promise<{ deleted: true }>;

  searchConversations(args: {
    userId: string;
    q: string;
    limit: number;
  }): Promise<ConversationSummary[]>;

  generateTitle?: (args: {
    userId: string;
    conversationId: string;
  }) => Promise<{ title: string }>;
}

function getHistoryService(req: Request): ChatHistoryService {
  const svc = (req.app.locals?.services?.history ??
    req.app.locals?.historyService) as ChatHistoryService | undefined;
  if (!svc) {
    const err = new Error(
      "History service not available (bootstrap wiring missing).",
    );
    // @ts-expect-error
    err.statusCode = 503;
    throw err;
  }
  return svc;
}

function getUserId(req: Request): string {
  const anyReq = req as any;

  const userId =
    anyReq.user?.id ||
    anyReq.user?.userId ||
    anyReq.auth?.userId ||
    anyReq.session?.userId ||
    anyReq.userId;

  if (!userId || typeof userId !== "string") {
    const err = new Error("Unauthorized (missing user id).");
    // @ts-expect-error
    err.statusCode = 401;
    throw err;
  }
  return userId;
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function readLimit(req: Request, fallback = 20): number {
  const raw = req.query.limit ?? fallback;
  const parsed = typeof raw === "string" ? Number(raw) : Number(raw);
  return clampInt(parsed || fallback, 1, 50);
}

function readCursor(req: Request): string | undefined {
  const c = req.query.cursor;
  return typeof c === "string" && c.trim() ? c.trim() : undefined;
}

function readBool(v: unknown): boolean | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(s)) return true;
  if (["0", "false", "no", "n"].includes(s)) return false;
  return undefined;
}

function readString(v: unknown, maxLen: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

export class HistoryController {
  listConversations = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const history = getHistoryService(req);
      const userId = getUserId(req);

      const limit = readLimit(req, 20);
      const cursor = readCursor(req);
      const pinnedOnly = readBool(req.query.pinnedOnly);
      const includeArchived = readBool(req.query.includeArchived);
      const q = readString(req.query.q, 160);

      const result = await history.listConversations({
        userId,
        limit,
        cursor,
        pinnedOnly: pinnedOnly ?? false,
        includeArchived: includeArchived ?? false,
        q,
      });

      return res.json(result);
    } catch (err) {
      return next(err);
    }
  };

  getConversation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const history = getHistoryService(req);
      const userId = getUserId(req);

      const conversationId = String(req.params.conversationId || "").trim();
      if (!conversationId)
        return res.status(400).json({ error: "Missing conversationId." });

      const convo = await history.getConversation({ userId, conversationId });
      if (!convo)
        return res.status(404).json({ error: "Conversation not found." });

      return res.json(convo);
    } catch (err) {
      return next(err);
    }
  };

  searchConversations = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const history = getHistoryService(req);
      const userId = getUserId(req);

      const q = readString(req.body?.q ?? req.query.q, 160);
      if (!q)
        return res.status(400).json({ error: 'Missing search query "q".' });

      const limitRaw = req.body?.limit ?? req.query.limit ?? 20;
      const limit = clampInt(Number(limitRaw) || 20, 1, 50);

      const items = await history.searchConversations({ userId, q, limit });
      return res.json({ items });
    } catch (err) {
      return next(err);
    }
  };

  updateConversation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const history = getHistoryService(req);
      const userId = getUserId(req);

      const conversationId = String(req.params.conversationId || "").trim();
      if (!conversationId)
        return res.status(400).json({ error: "Missing conversationId." });

      const title = readString(req.body?.title, 80);
      const pinned =
        typeof req.body?.pinned === "boolean" ? req.body.pinned : undefined;
      const visibilityRaw = req.body?.visibility;
      const visibility: ConversationVisibility | undefined =
        visibilityRaw === "active" ||
        visibilityRaw === "archived" ||
        visibilityRaw === "deleted"
          ? visibilityRaw
          : undefined;

      if (
        title === undefined &&
        pinned === undefined &&
        visibility === undefined
      ) {
        return res.status(400).json({ error: "No valid fields to update." });
      }

      const patch: any = {};
      if (title !== undefined) patch.title = title;
      if (pinned !== undefined) patch.pinned = pinned;
      if (visibility !== undefined) patch.visibility = visibility;

      const updated = await history.updateConversation({
        userId,
        conversationId,
        patch,
      });
      return res.json(updated);
    } catch (err) {
      return next(err);
    }
  };

  deleteConversation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const history = getHistoryService(req);
      const userId = getUserId(req);

      const conversationId = String(req.params.conversationId || "").trim();
      if (!conversationId)
        return res.status(400).json({ error: "Missing conversationId." });

      const result = await history.deleteConversation({
        userId,
        conversationId,
      });
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  };

  generateTitle = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const history = getHistoryService(req);
      const userId = getUserId(req);

      if (!history.generateTitle) {
        return res
          .status(501)
          .json({ error: "Title generation not supported." });
      }

      const conversationId = String(req.params.conversationId || "").trim();
      if (!conversationId)
        return res.status(400).json({ error: "Missing conversationId." });

      const { title } = await history.generateTitle({ userId, conversationId });
      const safeTitle = (title || "").trim().slice(0, 80);

      const updated = await history.updateConversation({
        userId,
        conversationId,
        patch: { title: safeTitle || "Untitled" },
      });

      return res.json(updated);
    } catch (err) {
      return next(err);
    }
  };
}

export const historyController = new HistoryController();
