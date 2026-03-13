import { createHash } from "crypto";
import type {
  AnswerMode,
  ChatProvenanceDTO,
  ChatRequest,
  ChatResult,
} from "../domain/chat.contracts";
import type { EvidencePack } from "../../../services/core/retrieval/retrieval.types";
import {
  SEMANTIC_TRUNCATION_DETECTOR_VERSION,
  classifyProviderTruncation,
  classifyVisibleTruncation,
} from "./truncationClassifier";
import type { TurnDebugPacket } from "../../../services/telemetry/traceWriter.service";
import {
  asObject,
  toPositiveInt,
} from "./chatTraceShared";
import type {
  ProvenanceRuntimeTelemetry,
  ResolvedTruncationState,
} from "./chatTrace.types";

export class TurnDebugPacketBuilder {
  resolveTruncationState(params: {
    telemetry?: Record<string, unknown> | null;
    finalText: string;
    enforcementRepairs?: string[] | null;
  }): ResolvedTruncationState {
    const provider = classifyProviderTruncation(params.telemetry || null);
    const semantic = classifyVisibleTruncation({
      finalText: params.finalText,
      enforcementRepairs: params.enforcementRepairs,
      providerTruncation: provider,
    });

    return {
      contractOccurred: semantic.occurred,
      contractReason: semantic.reason,
      providerOccurred: provider.occurred,
      providerReason: provider.reason,
      semanticOccurred: semantic.occurred,
      semanticReason: semantic.reason,
      detectorVersion:
        semantic.detectorVersion || SEMANTIC_TRUNCATION_DETECTOR_VERSION,
    };
  }

  buildTurnDebugPacket(params: {
    traceId: string;
    req: ChatRequest;
    conversationId: string;
    retrievalPack: EvidencePack | null;
    answerMode: AnswerMode;
    status: ChatResult["status"];
    failureCode?: string | null;
    telemetry?: Record<string, unknown> | null;
    enforcement?: { repairs: string[]; warnings: string[] } | null;
    enforcementBlocked?: boolean;
    enforcementReasonCode?: string | null;
    provenance?: ChatProvenanceDTO | null;
    provenanceTelemetry?: ProvenanceRuntimeTelemetry | null;
    truncation?: ResolvedTruncationState | null;
  }): TurnDebugPacket {
    const meta = asObject(params.req.meta);
    const usage = this.extractTelemetryUsage(params.telemetry);
    const requestedMaxOutputTokens = toPositiveInt(
      asObject(params.telemetry).requestedMaxOutputTokens,
    );
    const observedOutputTokens = usage.outputTokens;
    const hardMaxOutputTokens =
      requestedMaxOutputTokens != null
        ? Math.ceil(requestedMaxOutputTokens * 1.25)
        : null;
    const evidenceIds = (params.retrievalPack?.evidence || [])
      .map((item) => `${item.docId}:${item.locationKey}`)
      .slice(0, 24);
    const evidenceMapHash =
      evidenceIds.length > 0
        ? createHash("sha256").update(evidenceIds.join("|")).digest("hex")
        : null;
    const attachedIds = Array.isArray(params.req.attachedDocumentIds)
      ? params.req.attachedDocumentIds
      : [];
    const docScopeMode: "none" | "single_doc" | "docset" =
      attachedIds.length > 1
        ? "docset"
        : attachedIds.length === 1
          ? "single_doc"
          : "none";

    return {
      traceId: params.traceId,
      requestId:
        typeof meta.requestId === "string" ? String(meta.requestId) : null,
      conversationId: params.conversationId || null,
      userIdHash: createHash("sha1")
        .update(String(params.req.userId || ""))
        .digest("hex")
        .slice(0, 16),
      answerMode: String(params.answerMode || "general_answer"),
      docScopeLock: {
        mode: docScopeMode,
        allowedDocumentIdsCount: attachedIds.length,
        activeDocumentId: attachedIds.length === 1 ? attachedIds[0] : null,
      },
      retrieval: {
        candidates: params.retrievalPack?.stats.candidatesConsidered ?? 0,
        selected: params.retrievalPack?.evidence.length ?? 0,
        topScore: params.retrievalPack?.stats.topScore ?? null,
        scopeCandidatesDropped:
          params.retrievalPack?.stats.scopeCandidatesDropped ?? 0,
        evidenceIds,
        documentIds: [
          ...new Set((params.retrievalPack?.evidence || []).map((item) => item.docId)),
        ].slice(0, 24),
      },
      provenance: {
        schemaVersion: "v1",
        evidenceMapHash,
        required: Boolean(params.provenance?.required),
        validated: Boolean(params.provenance?.validated),
        failureCode: params.provenance?.failureCode || null,
        action: params.provenanceTelemetry?.action || null,
        severity: params.provenanceTelemetry?.severity || null,
      },
      budget: {
        requestedMaxOutputTokens,
        hardMaxOutputTokens,
        observedOutputTokens,
      },
      enforcement: {
        blocked: Boolean(params.enforcementBlocked),
        reasonCode: params.enforcementReasonCode || null,
        repairs: params.enforcement?.repairs || [],
        warnings: params.enforcement?.warnings || [],
      },
      output: {
        sourceCount: params.retrievalPack?.evidence.length ?? 0,
        wasTruncated: Boolean(params.truncation?.contractOccurred),
        wasProviderTruncated: Boolean(params.truncation?.providerOccurred),
        wasSemanticallyTruncated: Boolean(params.truncation?.semanticOccurred),
        truncationReason: params.truncation?.contractReason || null,
        providerTruncationReason: params.truncation?.providerReason || null,
        semanticTruncationReason: params.truncation?.semanticReason || null,
        detectorVersion:
          params.truncation?.detectorVersion ||
          SEMANTIC_TRUNCATION_DETECTOR_VERSION,
        status: String(params.status || "success"),
        failureCode: params.failureCode || null,
      },
      createdAt: new Date().toISOString(),
    };
  }

  private extractTelemetryUsage(telemetry?: Record<string, unknown> | null): {
    inputTokens: number | null;
    outputTokens: number | null;
  } {
    const usage = asObject(asObject(telemetry).usage);
    return {
      inputTokens: toPositiveInt(
        usage.inputTokens ??
          usage.promptTokens ??
          usage.input_tokens ??
          usage.prompt_tokens,
      ),
      outputTokens: toPositiveInt(
        usage.outputTokens ??
          usage.completionTokens ??
          usage.output_tokens ??
          usage.completion_tokens,
      ),
    };
  }
}
