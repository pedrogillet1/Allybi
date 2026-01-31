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
  entityId?: string; // traceId
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
 * Retrieval emitter:
 * - Tracks doc scoping, search size, chunk counts, latency.
 * - Does NOT store chunk text, document names, or raw queries.
 * - Stores docId hashes for correlation (optional).
 */
export const retrievalEmitter = {
  async started(params: {
    ctx?: TelemetryContext;
    traceId: string;
    conversationId?: string;

    // scoping is critical to quality
    scopeApplied: boolean;
    scopeMode?: "pinned" | "auto" | "none";
    scopeDocumentIds?: string[]; // hashed only

    // retrieval config (safe)
    strategy?: "vector" | "hybrid" | "keyword" | "metadata" | "unknown";
    topK?: number;
    filtersUsed?: string[]; // e.g. ["mime:pdf", "folder:xyz"] (safe short labels)
  }) {
    const payload: Record<string, any> = {
      conversationId: params.conversationId ?? null,
      scopeApplied: params.scopeApplied,
      scopeMode: params.scopeMode ?? (params.scopeApplied ? "auto" : "none"),
      strategy: params.strategy ?? "unknown",
      topK: params.topK ?? null,
      filtersUsed: params.filtersUsed ?? [],
    };

    if (Array.isArray(params.scopeDocumentIds) && params.scopeDocumentIds.length > 0) {
      payload.scopeDocCount = params.scopeDocumentIds.length;
      payload.scopeDocIdHashes = params.scopeDocumentIds.slice(0, 10).map((id) => safeHash(id));
    } else {
      payload.scopeDocCount = 0;
      payload.scopeDocIdHashes = [];
    }

    await emit({
      ...base(params.ctx),
      type: "retrieval.started",
      entityId: params.traceId,
      payload,
    });
  },

  async completed(params: {
    ctx?: TelemetryContext;
    traceId: string;
    conversationId?: string;

    durationMs?: number;
    docsConsidered?: number;
    docsSearched?: number;
    chunksConsidered?: number;
    chunksReturned?: number;

    // quality signals
    topScore?: number; // best relevance score
    weakEvidence?: boolean;

    // what document "won" (hashed only)
    topDocumentId?: string;
    topChunkId?: string;

    // fallback behavior
    usedFallbackGlobalSearch?: boolean;
    fallbackReason?: string; // short label only
  }) {
    await emit({
      ...base(params.ctx),
      type: "retrieval.completed",
      entityId: params.traceId,
      payload: {
        conversationId: params.conversationId ?? null,

        durationMs: params.durationMs ?? null,
        docsConsidered: params.docsConsidered ?? null,
        docsSearched: params.docsSearched ?? null,
        chunksConsidered: params.chunksConsidered ?? null,
        chunksReturned: params.chunksReturned ?? null,

        topScore: typeof params.topScore === "number" ? params.topScore : null,
        weakEvidence: params.weakEvidence ?? null,

        topDocHash: params.topDocumentId ? safeHash(params.topDocumentId) : null,
        topChunkHash: params.topChunkId ? safeHash(params.topChunkId) : null,

        usedFallbackGlobalSearch: params.usedFallbackGlobalSearch ?? false,
        fallbackReason: params.fallbackReason ?? null,
      },
    });
  },

  async failed(params: {
    ctx?: TelemetryContext;
    traceId: string;
    conversationId?: string;
    durationMs?: number;
    stage?: "vector_search" | "keyword_search" | "merge" | "rerank" | "unknown";
    errorCategory?: "storage" | "index" | "timeout" | "auth" | "unknown";
    errorName?: string; // short safe name only
  }) {
    await emit({
      ...base(params.ctx),
      type: "retrieval.failed",
      entityId: params.traceId,
      payload: {
        conversationId: params.conversationId ?? null,
        durationMs: params.durationMs ?? null,
        stage: params.stage ?? "unknown",
        errorCategory: params.errorCategory ?? "unknown",
        errorName: params.errorName ?? "Error",
      },
    });
  },

  async citationsSelected(params: {
    ctx?: TelemetryContext;
    traceId: string;
    conversationId?: string;
    citationsCount: number;

    // optional: hashed doc ids of cited sources
    citedDocumentIds?: string[];
  }) {
    const payload: Record<string, any> = {
      conversationId: params.conversationId ?? null,
      citationsCount: params.citationsCount,
    };

    if (Array.isArray(params.citedDocumentIds) && params.citedDocumentIds.length > 0) {
      payload.citedDocCount = params.citedDocumentIds.length;
      payload.citedDocHashes = params.citedDocumentIds.slice(0, 10).map((id) => safeHash(id));
    } else {
      payload.citedDocCount = 0;
      payload.citedDocHashes = [];
    }

    await emit({
      ...base(params.ctx),
      type: "retrieval.citations_selected",
      entityId: params.traceId,
      payload,
    });
  },
};
