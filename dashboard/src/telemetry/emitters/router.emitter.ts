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
 * Router emitter:
 * - Tracks the domain/intent routing decision.
 * - Tracks confidence + fallbacks + reasons.
 * - Does NOT store the query in plaintext.
 *
 * Use `traceId` as the stable correlation ID for one request/turn.
 */
export const routerEmitter = {
  async decision(params: {
    ctx?: TelemetryContext;
    traceId: string;
    conversationId?: string;

    // what the router decided
    intent: string; // e.g. "qa" | "summarize" | "extract" | "compare" | "action"
    domain: string; // e.g. "finance" | "legal" | "general" | "research" | "comp_sci" | "insurance" | ...
    confidence?: number; // 0..1

    // optional alternative candidates (no text, just labels)
    candidates?: Array<{ intent: string; domain: string; score: number }>;

    // fallback logic
    fallbackUsed?: boolean;
    fallbackReason?: string; // short label only (no raw text)
    ruleMatched?: string; // e.g. "keyword:tax" or "bank:insurance"
    modelUsed?: string; // e.g. "gpt-5.2" or "local-router"
    durationMs?: number;

    // safe query info
    query?: string; // optional raw, hashed only
    queryLength?: number;
    language?: string;
  }) {
    const payload: Record<string, any> = {
      conversationId: params.conversationId ?? null,
      intent: params.intent,
      domain: params.domain,
      confidence: typeof params.confidence === "number" ? params.confidence : null,
      fallbackUsed: params.fallbackUsed ?? false,
      fallbackReason: params.fallbackReason ?? null,
      ruleMatched: params.ruleMatched ?? null,
      modelUsed: params.modelUsed ?? null,
      durationMs: params.durationMs ?? null,
      language: params.language ?? null,
      queryLength:
        typeof params.queryLength === "number"
          ? params.queryLength
          : typeof params.query === "string"
            ? params.query.length
            : null,
    };

    if (typeof params.query === "string" && params.query.length > 0) {
      payload.queryHash = safeHash(params.query);
      payload.queryPrefixHash = safeHash(params.query.slice(0, 32));
    }

    if (Array.isArray(params.candidates) && params.candidates.length > 0) {
      // Keep only top 5 for payload size.
      payload.candidates = params.candidates
        .slice(0, 5)
        .map((c) => ({ intent: c.intent, domain: c.domain, score: c.score }));
    } else {
      payload.candidates = [];
    }

    await emit({
      ...base(params.ctx),
      type: "router.decision",
      entityId: params.traceId,
      payload,
    });
  },

  async fallbackTriggered(params: {
    ctx?: TelemetryContext;
    traceId: string;
    conversationId?: string;
    fromIntent?: string;
    fromDomain?: string;
    toIntent: string;
    toDomain: string;
    reason: string; // short label
  }) {
    await emit({
      ...base(params.ctx),
      type: "router.fallback_triggered",
      entityId: params.traceId,
      payload: {
        conversationId: params.conversationId ?? null,
        fromIntent: params.fromIntent ?? null,
        fromDomain: params.fromDomain ?? null,
        toIntent: params.toIntent,
        toDomain: params.toDomain,
        reason: params.reason,
      },
    });
  },

  async blocked(params: {
    ctx?: TelemetryContext;
    traceId: string;
    conversationId?: string;
    reason: "no_banks_enabled" | "policy_denied" | "unknown";
  }) {
    await emit({
      ...base(params.ctx),
      type: "router.blocked",
      entityId: params.traceId,
      payload: {
        conversationId: params.conversationId ?? null,
        reason: params.reason,
      },
    });
  },
};
