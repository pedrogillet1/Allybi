/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Postgres Telemetry Sink (Koda)
 * ------------------------------
 * Writes telemetry events to Postgres (via Prisma).
 *
 * Design:
 *  - Best-effort: never throw to callers
 *  - Route events to the right table depending on category/name
 *  - Store full payload JSON for later drill-down
 *
 * Tables (recommended mapping):
 *  - QueryTelemetry   -> routing/retrieval/format/quality pipeline events (high value)
 *  - TokenUsage       -> llm.* cost + token accounting
 *  - APIPerformanceLog-> external service calls
 *  - ErrorLog         -> error/fatal events
 *  - AnalyticsEvent   -> everything else (general telemetry stream)
 *
 * NOTE:
 *  - Prisma model names differ by project; adjust mappings once and keep stable.
 */

import type { TelemetryEvent } from "../types";

export interface TelemetrySink {
  write(event: TelemetryEvent): Promise<void>;
}

function safeJson(obj: any) {
  try {
    return obj == null ? null : obj;
  } catch {
    return null;
  }
}

function now() {
  return new Date();
}

function isErrorSeverity(sev: string) {
  return sev === "error" || sev === "fatal";
}

function startsWithAny(name: string, prefixes: string[]) {
  return prefixes.some((p) => name.startsWith(p));
}

export function createPostgresSink(prisma: any): TelemetrySink {
  return {
    async write(event: TelemetryEvent) {
      try {
        const name = String(event.name || "");
        const category = String(event.category || "");
        const severity = String(event.severity || "info");

        // 1) LLM tokens/cost → TokenUsage
        if (category === "llm" || startsWithAny(name, ["llm."])) {
          await prisma.tokenUsage.create({
            data: {
              userId: event.userId ?? null,
              conversationId: event.conversationId ?? null,
              messageId: event.messageId ?? null,

              model: event.payload?.model ?? "unknown",
              provider: event.payload?.provider ?? "unknown",
              requestType: event.payload?.requestType ?? "unknown",

              inputTokens: Number(event.payload?.inputTokens ?? 0),
              outputTokens: Number(event.payload?.outputTokens ?? 0),
              totalTokens: Number(event.payload?.totalTokens ?? 0),

              inputCost: Number(event.payload?.inputCost ?? 0),
              outputCost: Number(event.payload?.outputCost ?? 0),
              totalCost: Number(event.payload?.estimatedCostUsd ?? event.payload?.totalCost ?? 0),

              latencyMs: Number(event.payload?.totalMs ?? event.payload?.latencyMs ?? 0),

              success: !isErrorSeverity(severity),
              errorMessage: event.payload?.error?.message ?? null,

              wasCached: Boolean(event.payload?.cached ?? false),
              cacheHit: Boolean(event.payload?.cacheHit ?? false),

              createdAt: now(),
            },
          });

          // Also store a light AnalyticsEvent for general timeline browsing
          await prisma.analyticsEvent.create({
            data: {
              userId: event.userId ?? null,
              eventType: "llm",
              eventName: name,
              category,
              properties: safeJson(event),
              timestamp: now(),
            },
          });

          return;
        }

        // 2) Routing/retrieval pipeline events → QueryTelemetry (if available)
        // If your project uses QueryTelemetry as the canonical pipeline trace table.
        if (
          startsWithAny(name, ["routing.", "retrieval.", "chat.stream.", "chat.message."]) ||
          ["routing", "retrieval", "chat", "rag"].includes(category)
        ) {
          // QueryTelemetry requires a queryId; if not provided, use correlationId/requestId
          const queryId = event.payload?.queryId ?? event.correlationId ?? event.requestId ?? event.id;

          // Best-effort upsert for progressive enrichment
          await prisma.queryTelemetry.upsert({
            where: { queryId },
            create: {
              queryId,
              userId: event.userId ?? "unknown",
              conversationId: event.conversationId ?? null,
              messageId: event.messageId ?? null,
              environment: event.env ?? "dev",
              timestamp: new Date(event.ts),

              // high-level routing
              intent: event.payload?.intent ?? "unknown",
              intentConfidence: Number(event.payload?.confidence ?? 0),
              questionType: event.payload?.questionType ?? null,
              queryScope: event.payload?.queryScope ?? null,
              domain: event.payload?.domain ?? null,
              depth: event.payload?.depth ?? null,
              family: event.payload?.family ?? null,
              subIntent: event.payload?.subIntent ?? null,
              isMultiIntent: Boolean(event.payload?.isMultiIntent ?? false),

              // retrieval
              chunksReturned: Number(event.payload?.chunksReturned ?? 0),
              bm25Results: Number(event.payload?.bm25Results ?? 0),
              vectorResults: Number(event.payload?.vectorResults ?? 0),
              distinctDocs: Number(event.payload?.distinctDocs ?? 0),
              documentIds: event.payload?.documentIds ?? [],

              topRelevanceScore: event.payload?.topRelevanceScore ?? null,
              avgRelevanceScore: event.payload?.avgRelevanceScore ?? null,
              minRelevanceScore: event.payload?.minRelevanceScore ?? null,

              retrievalMethod: event.payload?.retrievalMethod ?? null,
              mergeStrategy: event.payload?.mergeStrategy ?? null,

              // formatting / quality
              formatMode: event.payload?.formatMode ?? null,
              formattingPassed: event.payload?.formattingPassed ?? true,
              formattingViolations: event.payload?.formattingViolations ?? [],
              bannedPhrasesFound: event.payload?.bannedPhrasesFound ?? [],

              // timing
              ttft: event.payload?.ttftMs ?? null,
              retrievalMs: event.payload?.retrievalMs ?? null,
              llmMs: event.payload?.llmMs ?? null,
              totalMs: event.payload?.totalMs ?? null,

              // streaming health
              streamStarted: Boolean(event.payload?.streamStarted ?? false),
              firstTokenReceived: Boolean(event.payload?.firstTokenReceived ?? false),
              streamEnded: Boolean(event.payload?.streamEnded ?? false),
              clientDisconnected: Boolean(event.payload?.clientDisconnected ?? false),
              sseErrors: event.payload?.sseErrors ?? [],
              chunksSent: Number(event.payload?.chunksSent ?? 0),
              wasAborted: Boolean(event.payload?.wasAborted ?? false),

              // misc
              isUseful: event.payload?.isUseful ?? true,
              failureCategory: event.payload?.failureCategory ?? null,
              hadFallback: Boolean(event.payload?.hadFallback ?? false),
              fallbackScenario: event.payload?.fallbackScenario ?? null,

              // store raw event envelope for drilldown
              warnings: event.payload?.warnings ?? [],
              hasErrors: isErrorSeverity(severity),
              errors: safeJson(event.payload?.error ? [event.payload.error] : null),
            },
            update: {
              // Merge key fields without overwriting good values with nulls.
              timestamp: new Date(event.ts),

              intent: event.payload?.intent ?? undefined,
              intentConfidence: event.payload?.confidence ?? undefined,
              domain: event.payload?.domain ?? undefined,
              family: event.payload?.family ?? undefined,
              subIntent: event.payload?.subIntent ?? undefined,

              chunksReturned: event.payload?.chunksReturned ?? undefined,
              bm25Results: event.payload?.bm25Results ?? undefined,
              vectorResults: event.payload?.vectorResults ?? undefined,
              distinctDocs: event.payload?.distinctDocs ?? undefined,
              documentIds: event.payload?.documentIds ?? undefined,

              retrievalMethod: event.payload?.retrievalMethod ?? undefined,
              mergeStrategy: event.payload?.mergeStrategy ?? undefined,

              formatMode: event.payload?.formatMode ?? undefined,
              formattingPassed: event.payload?.formattingPassed ?? undefined,
              formattingViolations: event.payload?.formattingViolations ?? undefined,
              bannedPhrasesFound: event.payload?.bannedPhrasesFound ?? undefined,

              ttft: event.payload?.ttftMs ?? undefined,
              retrievalMs: event.payload?.retrievalMs ?? undefined,
              llmMs: event.payload?.llmMs ?? undefined,
              totalMs: event.payload?.totalMs ?? undefined,

              streamStarted: event.payload?.streamStarted ?? undefined,
              firstTokenReceived: event.payload?.firstTokenReceived ?? undefined,
              streamEnded: event.payload?.streamEnded ?? undefined,
              clientDisconnected: event.payload?.clientDisconnected ?? undefined,
              sseErrors: event.payload?.sseErrors ?? undefined,
              chunksSent: event.payload?.chunksSent ?? undefined,
              wasAborted: event.payload?.wasAborted ?? undefined,

              isUseful: event.payload?.isUseful ?? undefined,
              failureCategory: event.payload?.failureCategory ?? undefined,
              hadFallback: event.payload?.hadFallback ?? undefined,
              fallbackScenario: event.payload?.fallbackScenario ?? undefined,

              hasErrors: isErrorSeverity(severity) ? true : undefined,
              errors: event.payload?.error
                ? safeJson([event.payload.error])
                : undefined,
            },
          });

          return;
        }

        // 3) Error/fatal → ErrorLog
        if (isErrorSeverity(severity)) {
          await prisma.errorLog.create({
            data: {
              userId: event.userId ?? null,
              service: event.payload?.service ?? "telemetry",
              errorType: event.payload?.errorType ?? category ?? "error",
              errorMessage: event.payload?.error?.message ?? safeString(event.payload?.message) ?? "error",
              errorStack: null, // stacks are optional; keep null unless dev setting in sink
              severity,
              resolved: false,
              conversationId: event.conversationId ?? null,
              requestPath: event.payload?.route ?? null,
              httpMethod: event.payload?.method ?? null,
              statusCode: event.payload?.statusCode ?? null,
              metadata: safeJson(event),
              createdAt: now(),
            },
          });
          return;
        }

        // 4) Default: store in AnalyticsEvent
        await prisma.analyticsEvent.create({
          data: {
            userId: event.userId ?? null,
            eventType: category || "telemetry",
            eventName: name || "unknown",
            category,
            properties: safeJson(event),
            timestamp: new Date(event.ts),
            duration: event.payload?.ms ?? event.payload?.durationMs ?? null,
          },
        });
      } catch {
        // never throw
      }
    },
  };
}

function safeString(x: any): string | null {
  if (x == null) return null;
  if (typeof x === "string") return x;
  try {
    return String(x);
  } catch {
    return null;
  }
}

export default createPostgresSink;
