import crypto from "crypto";
import { emit } from "../index";

export type TelemetryContext = {
  userId?: string;
  orgId?: string;
  sessionId?: string;
  requestId?: string;
  ipHash?: string;
  userAgentHash?: string;
};

type BaseEvent = {
  ts: string;
  type: string;
  userId?: string;
  orgId?: string;
  sessionId?: string;
  requestId?: string;
  ipHash?: string;
  userAgentHash?: string;
  entityId?: string; // conversationId or messageId
  payload?: Record<string, any>;
};

function nowIso() {
  return new Date().toISOString();
}

function safeHash(input: string): string {
  const pepper = process.env.TELEMETRY_HASH_PEPPER || "";
  return crypto.createHash("sha256").update(`${pepper}${input}`).digest("hex");
}

function base(ctx?: TelemetryContext): Omit<BaseEvent, "type"> {
  return {
    ts: nowIso(),
    userId: ctx?.userId,
    orgId: ctx?.orgId,
    sessionId: ctx?.sessionId,
    requestId: ctx?.requestId,
    ipHash: ctx?.ipHash,
    userAgentHash: ctx?.userAgentHash,
  };
}

/**
 * Chat emitter:
 * - Never emit plaintext message content.
 * - Emit contentHash + length + language.
 * - Track conversation lifecycle and messaging volume.
 */
export const chatEmitter = {
  async conversationStarted(params: {
    ctx?: TelemetryContext;
    conversationId: string;
    source?: "web" | "mobile" | "api" | "unknown";
    locale?: string; // e.g., "en-US", "pt-BR"
  }) {
    await emit({
      ...base(params.ctx),
      type: "chat.conversation_started",
      entityId: params.conversationId,
      payload: {
        source: params.source ?? "unknown",
        locale: params.locale ?? null,
      },
    });
  },

  async messageSent(params: {
    ctx?: TelemetryContext;
    conversationId: string;
    role: "user" | "assistant" | "system";
    // Never store plaintext; hashing is optional but recommended
    content?: string;
    contentLength?: number; // if you already have length without plaintext
    language?: string; // "en" | "pt" | etc.
    attachmentCount?: number;
    // Useful for dashboards:
    isFollowUp?: boolean;
  }) {
    const length =
      typeof params.contentLength === "number"
        ? params.contentLength
        : typeof params.content === "string"
          ? params.content.length
          : null;

    const payload: Record<string, any> = {
      conversationId: params.conversationId,
      role: params.role,
      contentLength: length,
      language: params.language ?? null,
      attachmentCount: params.attachmentCount ?? 0,
      isFollowUp: params.isFollowUp ?? null,
    };

    if (typeof params.content === "string" && params.content.length > 0) {
      payload.contentHash = safeHash(params.content);
      // Optional: hash first 32 chars too for fuzzy correlation without storing text
      payload.prefixHash = safeHash(params.content.slice(0, 32));
    }

    await emit({
      ...base(params.ctx),
      type: "chat.message_sent",
      entityId: params.conversationId,
      payload,
    });
  },

  async responseStreamStarted(params: {
    ctx?: TelemetryContext;
    conversationId: string;
    // useful when debugging streaming issues
    transport?: "sse" | "ws" | "http" | "unknown";
  }) {
    await emit({
      ...base(params.ctx),
      type: "chat.stream_started",
      entityId: params.conversationId,
      payload: {
        transport: params.transport ?? "unknown",
      },
    });
  },

  async responseStreamCompleted(params: {
    ctx?: TelemetryContext;
    conversationId: string;
    ttftMs?: number; // time-to-first-token
    totalMs?: number;
    outputChars?: number;
    // if you measure it:
    tokensOut?: number;
  }) {
    await emit({
      ...base(params.ctx),
      type: "chat.stream_completed",
      entityId: params.conversationId,
      payload: {
        ttftMs: params.ttftMs ?? null,
        totalMs: params.totalMs ?? null,
        outputChars: params.outputChars ?? null,
        tokensOut: params.tokensOut ?? null,
      },
    });
  },

  async responseStreamFailed(params: {
    ctx?: TelemetryContext;
    conversationId: string;
    totalMs?: number;
    failureStage?: "before_first_token" | "mid_stream" | "finalize" | "unknown";
    errorName?: string; // safe short name only
    errorCategory?: "network" | "timeout" | "llm" | "server" | "unknown";
  }) {
    await emit({
      ...base(params.ctx),
      type: "chat.stream_failed",
      entityId: params.conversationId,
      payload: {
        totalMs: params.totalMs ?? null,
        failureStage: params.failureStage ?? "unknown",
        errorName: params.errorName ?? "Error",
        errorCategory: params.errorCategory ?? "unknown",
      },
    });
  },

  async conversationEnded(params: {
    ctx?: TelemetryContext;
    conversationId: string;
    messageCount?: number;
    durationMs?: number;
    reason?: "user_exit" | "timeout" | "system" | "unknown";
  }) {
    await emit({
      ...base(params.ctx),
      type: "chat.conversation_ended",
      entityId: params.conversationId,
      payload: {
        messageCount: params.messageCount ?? null,
        durationMs: params.durationMs ?? null,
        reason: params.reason ?? "unknown",
      },
    });
  },
};
