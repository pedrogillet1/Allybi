import { logger as appLogger } from "../../../utils/logger";
import type { ChatEngine, ChatRequest } from "../domain/chat.contracts";
import {
  resolveDocumentReference,
  type DocumentReferenceDoc,
} from "../../../services/core/scope/documentReferenceResolver.service";
import type { RetrievalRequest } from "../../../services/core/retrieval/retrieval.types";
import {
  getRetrievalPlanParser,
  type RetrievalPlan,
} from "../../../services/core/retrieval/retrievalPlanParser.service";

type DocStore = {
  getDocMeta(docId: string): Promise<{
    docId: string;
    title?: string | null;
    filename?: string | null;
  } | null>;
};

function sanitizeTraceId(input: unknown): string | null {
  const candidate = String(input || "").trim();
  if (!candidate) return null;
  if (/^[A-Za-z0-9._:-]{8,64}$/.test(candidate)) return candidate;
  const normalized = candidate.replace(/[^A-Za-z0-9._:-]/g, "");
  return normalized.length >= 8 ? normalized.slice(0, 64) : null;
}

function mkTraceId(): string {
  return `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export class RetrievalPlanResolver {
  private readonly retrievalPlanParser = getRetrievalPlanParser();

  constructor(
    private readonly engine: ChatEngine,
    private readonly plannerTimeoutMs: number,
  ) {}

  async resolveDocNameFromQuery(
    query: string,
    attachedDocIds: string[],
    userId: string,
    docStore: DocStore,
  ): Promise<{
    resolvedDocId: string | null;
    explicitDocRef: boolean;
    matchedDocIds: string[];
    confidence: number;
  }> {
    void userId;
    if (attachedDocIds.length === 0) {
      return {
        resolvedDocId: null,
        explicitDocRef: false,
        matchedDocIds: [],
        confidence: 0,
      };
    }

    const docs: DocumentReferenceDoc[] = [];
    for (const docId of attachedDocIds) {
      const meta = await docStore.getDocMeta(docId);
      if (!meta) continue;
      docs.push({
        docId: meta.docId,
        title: meta.title,
        filename: meta.filename,
      });
    }
    if (docs.length === 0) {
      return {
        resolvedDocId: null,
        explicitDocRef: false,
        matchedDocIds: [],
        confidence: 0,
      };
    }

    const resolution = resolveDocumentReference(query, docs);
    return {
      resolvedDocId: resolution.resolvedDocId,
      explicitDocRef: resolution.explicitDocRef,
      matchedDocIds: resolution.matchedDocIds,
      confidence: resolution.confidence,
    };
  }

  async generateRetrievalPlanForEvidence(params: {
    req: ChatRequest;
    runtimeCtx?: { traceId?: string | null; conversationId?: string | null };
    intentFamily: string;
    operator: string | null;
    answerMode: RetrievalRequest["signals"]["answerMode"];
    docScopeSignals: Pick<
      RetrievalRequest["signals"],
      | "docScopeLock"
      | "explicitDocLock"
      | "activeDocId"
      | "explicitDocRef"
      | "resolvedDocId"
      | "hardScopeActive"
      | "singleDocIntent"
    >;
    semanticSignals: Record<string, boolean>;
    allowGlobalScope: boolean;
    attachedDocumentIds: string[];
    docStore: DocStore;
  }): Promise<RetrievalPlan | null> {
    if (typeof this.engine.generateRetrievalPlan !== "function") return null;

    const meta = asObject(params.req.meta);
    const traceId =
      sanitizeTraceId(params.runtimeCtx?.traceId) ||
      sanitizeTraceId(meta.requestId) ||
      sanitizeTraceId(meta.httpRequestId) ||
      mkTraceId();
    const conversationId = String(
      params.runtimeCtx?.conversationId || params.req.conversationId || "",
    ).trim();

    const knownDocTitles: string[] = [];
    const seenDocTitle = new Set<string>();
    for (const docId of params.attachedDocumentIds.slice(0, 8)) {
      const metaDoc = await params.docStore.getDocMeta(docId);
      const candidates = [metaDoc?.title, metaDoc?.filename];
      for (const candidate of candidates) {
        const text = String(candidate || "").trim();
        if (!text) continue;
        const key = text.toLowerCase();
        if (seenDocTitle.has(key)) continue;
        seenDocTitle.add(key);
        knownDocTitles.push(text);
        if (knownDocTitles.length >= 8) break;
      }
      if (knownDocTitles.length >= 8) break;
    }

    try {
      const generated = await Promise.race([
        this.engine.generateRetrievalPlan({
          traceId,
          userId: params.req.userId,
          conversationId: conversationId || "retrieval_planning",
          messages: [{ role: "user", content: String(params.req.message || "") }],
          context: {
            planner: {
              scope: {
                hard: params.docScopeSignals.hardScopeActive === true,
                explicitDocLock:
                  params.docScopeSignals.explicitDocLock === true,
                activeDocId: params.docScopeSignals.activeDocId ?? null,
                resolvedDocId: params.docScopeSignals.resolvedDocId ?? null,
                allowGlobalScope: params.allowGlobalScope,
              },
              docContext: {
                attachedDocumentIds: params.attachedDocumentIds.slice(0, 16),
                knownDocTitles,
              },
              runtimeSignals: params.semanticSignals,
            },
          },
          meta: {
            intentFamily: params.intentFamily,
            operator: params.operator,
            answerMode: params.answerMode,
            purpose: "retrieval_planning",
            promptMode: "retrieval_plan",
          },
        }),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error("retrieval_plan_timeout")),
            this.plannerTimeoutMs,
          );
        }),
      ]);

      const parsed = this.retrievalPlanParser.tryParse(String(generated.text || ""));
      if (!parsed) {
        appLogger.warn("[retrieval-plan] planner returned invalid JSON plan", {
          traceId,
          userId: params.req.userId,
          conversationId: conversationId || null,
        });
        return null;
      }
      return parsed;
    } catch (error) {
      appLogger.warn("[retrieval-plan] planner invocation failed", {
        traceId,
        userId: params.req.userId,
        conversationId: conversationId || null,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
