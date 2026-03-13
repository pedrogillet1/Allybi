import type {
  AnswerMode,
  ChatProvenanceDTO,
  ChatRequest,
  ChatResult,
} from "../domain/chat.contracts";
import type { EvidencePack } from "../../../services/core/retrieval/retrieval.types";
import type { EvidenceCheckResult } from "../../../services/core/retrieval/evidenceGate.service";
import type {
  QueryTelemetryWriteInput,
  RetrievalEventWriteInput,
  TurnDebugPacket,
} from "../../../services/telemetry/traceWriter.service";

export type ProvenanceRuntimeTelemetry = {
  action: "allow" | "hedge" | "block";
  reasonCode: string | null;
  severity: "warning" | "error" | null;
  stage: "enforcer" | "revalidation";
};

export type ResolvedTruncationState = {
  contractOccurred: boolean;
  contractReason: string | null;
  providerOccurred: boolean;
  providerReason: string | null;
  semanticOccurred: boolean;
  semanticReason: string | null;
  detectorVersion: string;
};

export type TraceWriterPort = {
  startSpan(
    traceId: string,
    stepName: string,
    metadata?: Record<string, unknown> | null,
  ): string;
  endSpan(
    traceId: string,
    spanId: string,
    params?: {
      status?: "ok" | "error" | "skipped";
      errorCode?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ): void;
  getLatestTurnDebugPacket(traceId: string): TurnDebugPacket | null;
  flush(
    traceId: string,
    result: { status: "success" | "partial" | "clarification_required" | "blocked" | "failed" },
  ): Promise<boolean>;
  recordBankUsage(params: {
    traceId: string;
    bankType: string;
    bankId: string;
    stageUsed: string;
  }): void;
  recordKeywords(
    traceId: string,
    keywords: Array<{ keyword: string; weight: number }>,
  ): void;
  recordEntities(
    traceId: string,
    entities: Array<{ type: string; value: string; confidence: number }>,
  ): void;
  writeTurnDebugPacket(packet: TurnDebugPacket): void;
  upsertQueryTelemetry(input: QueryTelemetryWriteInput): Promise<void>;
  writeRetrievalEvent(input: RetrievalEventWriteInput): Promise<void>;
};

export type TraceRuntimeConfig = {
  environment: "production" | "staging" | "dev" | "local";
};

export type PersistTraceArtifactsParams = {
  traceId: string;
  req: ChatRequest;
  conversationId: string;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
  retrievalPack: EvidencePack | null;
  evidenceGateDecision?: EvidenceCheckResult | null;
  answerMode: AnswerMode;
  status: ChatResult["status"];
  failureCode?: string | null;
  fallbackReasonCode?: string;
  fallbackReasonCodeTelemetry?: string;
  fallbackPolicyMeta?: Record<string, unknown> | null;
  assistantText: string;
  telemetry?: Record<string, unknown> | null;
  totalMs: number;
  retrievalMs?: number | null;
  llmMs?: number | null;
  stream: boolean;
  enforcement?: { repairs: string[]; warnings: string[] } | null;
  enforcementBlocked?: boolean;
  enforcementReasonCode?: string | null;
  provenance?: ChatProvenanceDTO | null;
  provenanceTelemetry?: ProvenanceRuntimeTelemetry | null;
  truncation?: ChatResult["truncation"] | null;
};
