// src/services/app/chatApp.service.ts
import type { Request } from "express";
import type { Attachment } from "../../types/handlerResult.types";

import { KodaOrchestratorV3Service } from "../core/orchestration/kodaOrchestrator.service";
import { ConversationContextService } from "../memory/conversationContext.service";
import { ConversationMemoryService } from "../memory/conversationMemory.service";

// Alias for code expecting ComposedResponse
type ComposedResponse = {
  text: string;
  attachments?: Attachment[];
  meta?: Record<string, any>;
};

/**
 * ChatAppService
 * Controller-facing facade for chat.
 *
 * Responsibilities:
 * - Validate/shape request into a stable "chat input contract"
 * - Pull minimal conversation context + memory summary
 * - Call orchestrator (single entrypoint)
 * - Return response in the exact format the frontend expects (SSE or JSON)
 *
 * IMPORTANT: This service should not contain business logic (routing/retrieval/composition).
 * That belongs in core/orchestrator + data_banks.
 */

export type ChatRole = "user" | "assistant";

export interface ChatMessageInput {
  role: ChatRole;
  content: string;
  createdAt?: string;
}

export interface ChatRequestBody {
  conversationId?: string | null;
  message: string;

  // Frontend regenerate contract
  regenerateMessageId?: string | null;
  regenCount?: number;

  // Optional UI features
  researchMode?: boolean;

  // Optional doc pinning
  attachedDocumentId?: string | null;

  // Optional: user wants short response
  userRequestedShort?: boolean;

  // Optional: client-side language preference
  language?: "en" | "pt" | "es";
}

export interface ChatResponsePayload {
  messageId: string;
  conversationId: string;
  content: string;
  attachments?: Attachment[];
  answerMode?: string | null;
  followUpSuggestions?: string[] | undefined;
  metadata?: Record<string, any>;
}

export interface ChatStreamChunk {
  type: "status" | "delta" | "done" | "error" | "meta" | "attachments";
  requestId?: string;
  messageId?: string;
  conversationId?: string;
  data?: any;
}

/**
 * Helper to safely read requester identity without coupling to auth implementation.
 */
function getActor(req: Request): { userId: string; isGuest: boolean } {
  const anyReq: any = req as any;
  const userId =
    anyReq.user?.id ||
    anyReq.user?.userId ||
    anyReq.auth?.userId ||
    anyReq.session?.userId ||
    "guest";
  return { userId: String(userId), isGuest: userId === "guest" };
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeUserText(input: unknown, maxChars: number): string {
  const s = String(input ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!s) return "";
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars);
}

function normalizeLanguage(lang: any): "en" | "pt" | "es" | undefined {
  if (lang === "en" || lang === "pt" || lang === "es") return lang;
  return undefined;
}

export class ChatAppService {
  private readonly orchestrator: any = null;
  private readonly conversationContext: any = null;
  private readonly memory: any = null;

  /**
   * Non-streaming chat call (controller returns JSON).
   */
  async chat(
    req: Request,
    body: ChatRequestBody,
  ): Promise<ChatResponsePayload> {
    const actor = getActor(req);

    const message = sanitizeUserText(body.message, 8000);
    if (!message) {
      return {
        messageId: cryptoRandomId(),
        conversationId: body.conversationId || "new",
        content: "I didn't get any text. What would you like to ask?",
        answerMode: "conversation",
      };
    }

    const conversationId =
      (body.conversationId && String(body.conversationId)) || "new";

    // Pull context (recent turns + lightweight state)
    const ctx = await this.conversationContext.build({
      actor,
      conversationId,
      userMessage: message,
      attachedDocumentId: body.attachedDocumentId || null,
      userLanguage: normalizeLanguage(body.language),
    });

    // Pull memory summary (for ChatGPT-like continuity)
    const mem = await this.memory.getMemorySummary({
      actor,
      conversationId: ctx.conversationId,
    });

    const result = await this.orchestrator.run({
      actor,
      conversationId: ctx.conversationId,
      requestId: ctx.requestId,
      userMessage: message,
      regenCount: body.regenCount || 0,
      regenerateMessageId: body.regenerateMessageId || null,
      attachedDocumentId: body.attachedDocumentId || null,
      researchMode: !!body.researchMode,
      userRequestedShort: !!body.userRequestedShort,
      language: ctx.language,
      // Provide context + memory to orchestrator
      conversationState: ctx.state,
      recentMessages: ctx.recentMessages,
      memorySummary: mem.summary,
    });

    // Persist assistant turn + update state/memory (single place)
    await this.conversationContext.persistTurn({
      actor,
      conversationId: result.conversationId,
      requestId: result.requestId,
      userMessage: message,
      assistant: {
        id: result.messageId,
        content: result.content,
        answerMode: result.answerMode || null,
        attachments: result.attachments || [],
        meta: result.meta || {},
      },
    });

    return {
      messageId: result.messageId,
      conversationId: result.conversationId,
      content: result.content,
      attachments: result.attachments,
      answerMode: result.answerMode || null,
      followUpSuggestions: result.meta?.followupSuggestions,
      metadata: result.meta,
    };
  }

  /**
   * Streaming chat call.
   * The controller should wire this to SSE and write chunks returned by `stream()`.
   */
  async *stream(
    req: Request,
    body: ChatRequestBody,
  ): AsyncGenerator<ChatStreamChunk> {
    const actor = getActor(req);

    const message = sanitizeUserText(body.message, 8000);
    const conversationId =
      (body.conversationId && String(body.conversationId)) || "new";

    if (!message) {
      yield {
        type: "error",
        data: { code: "EMPTY_MESSAGE", message: "I didn't get any text." },
      };
      return;
    }

    // Build request context
    const ctx = await this.conversationContext.build({
      actor,
      conversationId,
      userMessage: message,
      attachedDocumentId: body.attachedDocumentId || null,
      userLanguage: normalizeLanguage(body.language),
    });

    const mem = await this.memory.getMemorySummary({
      actor,
      conversationId: ctx.conversationId,
    });

    yield {
      type: "status",
      requestId: ctx.requestId,
      conversationId: ctx.conversationId,
      data: { stage: "thinking", message: "Thinking…" },
    };

    // Orchestrator streaming generator
    const stream = this.orchestrator.stream({
      actor,
      conversationId: ctx.conversationId,
      requestId: ctx.requestId,
      userMessage: message,
      regenCount: body.regenCount || 0,
      regenerateMessageId: body.regenerateMessageId || null,
      attachedDocumentId: body.attachedDocumentId || null,
      researchMode: !!body.researchMode,
      userRequestedShort: !!body.userRequestedShort,
      language: ctx.language,
      conversationState: ctx.state,
      recentMessages: ctx.recentMessages,
      memorySummary: mem.summary,
    });

    let final: {
      messageId: string;
      content: string;
      answerMode?: string | null;
      attachments?: Attachment[];
      meta?: Record<string, any>;
    } | null = null;

    for await (const chunk of stream) {
      // Pass-through normalized chunk types to frontend
      if (chunk.type === "delta") {
        yield {
          type: "delta",
          requestId: ctx.requestId,
          conversationId: ctx.conversationId,
          data: { text: chunk.text },
        };
      } else if (chunk.type === "meta") {
        yield {
          type: "meta",
          requestId: ctx.requestId,
          conversationId: ctx.conversationId,
          data: chunk.data,
        };
      } else if (chunk.type === "attachments") {
        yield {
          type: "attachments",
          requestId: ctx.requestId,
          conversationId: ctx.conversationId,
          data: chunk.attachments,
        };
      } else if (chunk.type === "done") {
        final = {
          messageId: chunk.messageId,
          content: chunk.content,
          answerMode: chunk.answerMode ?? null,
          attachments: chunk.attachments ?? [],
          meta: chunk.meta ?? {},
        };

        yield {
          type: "done",
          requestId: ctx.requestId,
          messageId: chunk.messageId,
          conversationId: ctx.conversationId,
          data: {
            content: chunk.content,
            answerMode: chunk.answerMode ?? null,
            attachments: chunk.attachments ?? [],
            meta: chunk.meta ?? {},
          },
        };
      } else if (chunk.type === "error") {
        yield {
          type: "error",
          requestId: ctx.requestId,
          conversationId: ctx.conversationId,
          data: chunk.error,
        };
      }
    }

    // Persist the turn after stream ends (if we got a final)
    if (final) {
      await this.conversationContext.persistTurn({
        actor,
        conversationId: ctx.conversationId,
        requestId: ctx.requestId,
        userMessage: { role: "user", content: message, createdAt: nowIso() },
        assistant: {
          id: final.messageId,
          content: final.content,
          answerMode: final.answerMode || null,
          attachments: final.attachments || [],
          meta: final.meta || {},
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Small helpers (no external deps)
// ---------------------------------------------------------------------------

function cryptoRandomId(): string {
  // Node 14+ has crypto.randomUUID but avoid hard dependency
  const rnd = Math.random().toString(16).slice(2);
  return `msg_${Date.now().toString(36)}_${rnd}`;
}

// Export singleton getter if your codebase uses that pattern
let _chatApp: ChatAppService | null = null;
export function getChatAppService(): ChatAppService {
  if (!_chatApp) _chatApp = new ChatAppService();
  return _chatApp;
}
