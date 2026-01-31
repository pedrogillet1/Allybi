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
  entityId?: string; // often conversationId or traceId
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
 * RAG emitter:
 * - Tracks routing, retrieval, doc-scoping, and evidence quality.
 * - Never emits raw chunk text.
 * - Safe to power Queries/Quality/Reliability dashboards.
 */
export const ragEmitter = {
  async queryReceived(params: {
    ctx?: TelemetryContext;
    traceId: string; // stable per request
    conversationId?: string;
    query?: string; // optional raw; we hash it and/or store length only
    queryLength?: number;
    language?: string;
  }) {
    const payload: Record<string, any> = {
      conversationId: params.conversationId ?? null,
      queryLength:
        typeof params.queryLength === "number"
          ? params.queryLength
          : typeof params.query === "string"
            ? params.query.length
            : null,
      language: params.language ?? null,
    };

    if (typeof params.query === "string" && params.query.length > 0) {
      payload.queryHash = safeHash(params.query);
      payload.prefixHash = safeHash(params.query.slice(0, 32));
    }

    await emit({
      ...base(params.ctx),
      type: "rag.query_received",
      entityId: params.traceId,
      payload,
    });
  },

  async routed(params: {
    ctx?: TelemetryContext;
    traceId: string;
    conversationId?: string;
    intent: string; // e.g., "summarize", "extract", "compare", "qa"
    domain: string; // e.g., "finance", "legal", "general", "research", "comp_sci"
    confidence?: number; // 0..1
    fallbackUsed?: boolean;
    reason?: string; // short label only, no long text
  }) {
    await emit({
      ...base(params.ctx),
      type: "rag.routed",
      entityId: params.traceId,
      payload: {
        conversationId: params.conversationId ?? null,
        intent: params.intent,
        domain: params.domain,
        confidence: typeof params.confidence === "number" ? params.confidence : null,
        fallbackUsed: params.fallbackUsed ?? false,
        reason: params.reason ?? null,
      },
    });
  },

  async retrievalStarted(params: {
    ctx?: TelemetryContext;
    traceId: string;
    conversationId?: string;
    // doc scoping behavior is a major quality metric
    scopeApplied: boolean;
    scopeMode?: "pinned" | "auto" | "none";
    scopeDocumentIds?: string[]; // optional; we hash IDs for correlation
  }) {
    const payload: Record<string, any> = {
      conversationId: params.conversationId ?? null,
      scopeApplied: params.scopeApplied,
      scopeMode: params.scopeMode ?? (params.scopeApplied ? "auto" : "none"),
    };

    if (Array.isArray(params.scopeDocumentIds) && params.scopeDocumentIds.length > 0) {
      payload.scopeDocCount = params.scopeDocumentIds.length;
      payload.scopeDocIdHashes = params.scopeDocumentIds.slice(0, 10).map((id) => safeHash(id));
    } else {
      payload.scopeDocCount = 0;
    }

    await emit({
      ...base(params.ctx),
      type: "rag.retrieval_started",
      entityId: params.traceId,
      payload,
    });
  },

  async retrievalCompleted(params: {
    ctx?: TelemetryContext;
    traceId: string;
    conversationId?: string;
    durationMs?: number;
    docsSearched?: number;
    chunksReturned?: number;
    topDocId?: string; // hash only
    topScore?: number; // 0..1
    usedFallbackGlobalSearch?: boolean;
  }) {
    await emit({
      ...base(params.ctx),
      type: "rag.retrieval_completed",
      entityId: params.traceId,
      payload: {
        conversationId: params.conversationId ?? null,
        durationMs: params.durationMs ?? null,
        docsSearched: params.docsSearched ?? null,
        chunksReturned: params.chunksReturned ?? null,
        topDocHash: params.topDocId ? safeHash(params.topDocId) : null,
        topScore: typeof params.topScore === "number" ? params.topScore : null,
        usedFallbackGlobalSearch: params.usedFallbackGlobalSearch ?? false,
      },
    });
  },

  async retrievalFailed(params: {
    ctx?: TelemetryContext;
    traceId: string;
    conversationId?: string;
    durationMs?: number;
    errorCategory?: "storage" | "index" | "timeout" | "auth" | "unknown";
    errorName?: string; // safe short name only
  }) {
    await emit({
      ...base(params.ctx),
      type: "rag.retrieval_failed",
      entityId: params.traceId,
      payload: {
        conversationId: params.conversationId ?? null,
        durationMs: params.durationMs ?? null,
        errorCategory: params.errorCategory ?? "unknown",
        errorName: params.errorName ?? "Error",
      },
    });
  },

  async answerGenerated(params: {
    ctx?: TelemetryContext;
    traceId: string;
    conversationId?: string;
    // quality signals:
    citationsCount?: number;
    weakEvidence?: boolean;
    answerScore?: number; // 0..1
    fallbackUsed?: boolean;
    // safe size tracking:
    outputChars?: number;
    // optional: hash of response prefix (no plaintext)
    responsePreview?: string; // optional; hashed only
  }) {
    const payload: Record<string, any> = {
      conversationId: params.conversationId ?? null,
      citationsCount: params.citationsCount ?? null,
      weakEvidence: params.weakEvidence ?? null,
      answerScore: typeof params.answerScore === "number" ? params.answerScore : null,
      fallbackUsed: params.fallbackUsed ?? false,
      outputChars: params.outputChars ?? null,
    };

    if (typeof params.responsePreview === "string" && params.responsePreview.length > 0) {
      payload.responsePreviewHash = safeHash(params.responsePreview.slice(0, 64));
    }

    await emit({
      ...base(params.ctx),
      type: "rag.answer_generated",
      entityId: params.traceId,
      payload,
    });
  },

  async answerFailed(params: {
    ctx?: TelemetryContext;
    traceId: string;
    conversationId?: string;
    stage?: "routing" | "retrieval" | "llm" | "stream" | "unknown";
    errorCategory?: "llm" | "timeout" | "server" | "unknown";
    errorName?: string;
  }) {
    await emit({
      ...base(params.ctx),
      type: "rag.answer_failed",
      entityId: params.traceId,
      payload: {
        conversationId: params.conversationId ?? null,
        stage: params.stage ?? "unknown",
        errorCategory: params.errorCategory ?? "unknown",
        errorName: params.errorName ?? "Error",
      },
    });
  },

  async feedbackReceived(params: {
    ctx?: TelemetryContext;
    traceId: string;
    conversationId?: string;
    rating: "up" | "down";
    reason?: string; // short label only
  }) {
    await emit({
      ...base(params.ctx),
      type: "rag.feedback",
      entityId: params.traceId,
      payload: {
        conversationId: params.conversationId ?? null,
        rating: params.rating,
        reason: params.reason ?? null,
      },
    });
  },
};
