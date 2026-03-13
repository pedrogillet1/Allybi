import {
  asObject,
  toPositiveInt,
} from "./chatTraceShared";
import type {
  PersistTraceArtifactsParams,
  TraceWriterPort,
} from "./chatTrace.types";
import { TraceTelemetryProjector } from "./TraceTelemetryProjector";
import { TurnDebugPacketBuilder } from "./TurnDebugPacketBuilder";

export class TracePersistenceWriter {
  constructor(
    private readonly writer: TraceWriterPort,
    private readonly telemetryProjector: TraceTelemetryProjector,
    private readonly debugPacketBuilder: TurnDebugPacketBuilder,
  ) {}

  async persistTraceArtifacts(params: PersistTraceArtifactsParams): Promise<void> {
    const distinctDocIds = [
      ...new Set((params.retrievalPack?.evidence || []).map((item) => item.docId)),
    ];
    const usage = this.telemetryProjector.extractTelemetryUsage(params.telemetry);
    const totalTokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
    const evidenceAction = params.evidenceGateDecision?.suggestedAction ?? "answer";
    const evidenceStrength = this.telemetryProjector.mapEvidenceStrengthToScore(
      params.evidenceGateDecision?.evidenceStrength,
    );
    const meta = asObject(params.req.meta);
    const streamTelemetry = asObject(meta.streamTelemetry);
    const fallbackPolicyMeta = asObject(params.fallbackPolicyMeta);
    const fallbackReasonTelemetryFromPolicy = String(
      fallbackPolicyMeta.reasonCode || "",
    ).trim();
    const fallbackReasonForUser =
      params.failureCode || params.fallbackReasonCode || null;
    const fallbackReasonForTelemetry =
      params.failureCode ||
      params.fallbackReasonCodeTelemetry ||
      fallbackReasonTelemetryFromPolicy ||
      params.fallbackReasonCode ||
      null;
    const retrievalAdequate = (params.retrievalPack?.evidence.length ?? 0) > 0;
    const resolvedOperator =
      typeof meta.operator === "string"
        ? String(meta.operator)
        : retrievalAdequate
          ? "answer_with_sources"
          : "answer";
    const resolvedIntent =
      typeof meta.intentFamily === "string"
        ? String(meta.intentFamily)
        : retrievalAdequate
          ? "documents"
          : "general";
    const resolvedDomain =
      typeof meta.domain === "string"
        ? String(meta.domain)
        : retrievalAdequate
          ? "documents"
          : "general";
    const derivedTruncation = this.debugPacketBuilder.resolveTruncationState({
      telemetry: params.telemetry,
      finalText: params.assistantText,
      enforcementRepairs: params.enforcement?.repairs || [],
    });
    const truncation = params.truncation
      ? {
          contractOccurred: Boolean(params.truncation.occurred),
          contractReason: params.truncation.reason ?? null,
          providerOccurred:
            params.truncation.providerOccurred === undefined
              ? derivedTruncation.providerOccurred
              : Boolean(params.truncation.providerOccurred),
          providerReason:
            params.truncation.providerReason ?? derivedTruncation.providerReason,
          semanticOccurred: derivedTruncation.semanticOccurred,
          semanticReason: derivedTruncation.semanticReason,
          detectorVersion:
            params.truncation.detectorVersion ?? derivedTruncation.detectorVersion,
        }
      : derivedTruncation;

    const warningCodes = [
      fallbackReasonForTelemetry,
      String(params.provenanceTelemetry?.reasonCode || "").trim() || null,
    ].filter(Boolean) as string[];

    this.writer.recordBankUsage({
      traceId: params.traceId,
      bankType: "policy_bank",
      bankId: "memory_policy",
      stageUsed: "retrieval",
    });
    this.writer.recordBankUsage({
      traceId: params.traceId,
      bankType: "policy_bank",
      bankId: "truncation_and_limits.any.json",
      stageUsed: "output_contract",
    });
    this.writer.recordKeywords(
      params.traceId,
      this.telemetryProjector.extractTraceKeywords(params.req.message),
    );
    this.writer.recordEntities(
      params.traceId,
      this.telemetryProjector.extractTraceEntities(params.req, params.retrievalPack),
    );
    this.writer.writeTurnDebugPacket(
      this.debugPacketBuilder.buildTurnDebugPacket({
        traceId: params.traceId,
        req: params.req,
        conversationId: params.conversationId,
        retrievalPack: params.retrievalPack,
        answerMode: params.answerMode,
        status: params.status,
        failureCode: params.failureCode,
        telemetry: params.telemetry,
        enforcement: params.enforcement || null,
        enforcementBlocked: params.enforcementBlocked,
        enforcementReasonCode: params.enforcementReasonCode,
        provenance: params.provenance || null,
        provenanceTelemetry: params.provenanceTelemetry || null,
        truncation,
      }),
    );

    const ruleEvents = Array.isArray(params.retrievalPack?.telemetry?.ruleEvents)
      ? params.retrievalPack?.telemetry?.ruleEvents
      : [];
    const retrievalRuleEventWrites = ruleEvents.map((event) => {
      const payload = asObject(event?.payload);
      const eventName = String(event?.event || "").trim();
      const scoreDeltaSummaryRaw = asObject(payload.scoreDeltaSummary);
      const toFiniteNumberOrNull = (value: unknown): number | null => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const scoreDeltaSummary =
        Object.keys(scoreDeltaSummaryRaw).length > 0
          ? {
              candidateHits: toPositiveInt(scoreDeltaSummaryRaw.candidateHits),
              totalDelta: toFiniteNumberOrNull(scoreDeltaSummaryRaw.totalDelta),
              averageDelta: toFiniteNumberOrNull(scoreDeltaSummaryRaw.averageDelta),
              maxDelta: toFiniteNumberOrNull(scoreDeltaSummaryRaw.maxDelta),
            }
          : null;
      return this.writer.writeRetrievalEvent({
        traceId: params.traceId,
        userId: params.req.userId,
        conversationId: params.conversationId,
        operator:
          typeof payload.operator === "string"
            ? String(payload.operator)
            : resolvedOperator,
        intent:
          typeof payload.intent === "string"
            ? String(payload.intent)
            : resolvedIntent,
        domain:
          typeof payload.domain === "string"
            ? String(payload.domain)
            : resolvedDomain,
        docLockEnabled:
          Boolean(params.retrievalPack?.scope.explicitDocLock) ||
          (params.req.attachedDocumentIds || []).length > 0,
        strategy: "document_intelligence_rule_event",
        candidates: null,
        selected: null,
        evidenceStrength: null,
        refined: undefined,
        wrongDocPrevented: undefined,
        sourcesCount: null,
        navPillsUsed: undefined,
        fallbackReasonCode: null,
        at: new Date(),
        meta: {
          eventType: eventName,
          ruleId:
            typeof payload.ruleId === "string" ? String(payload.ruleId) : null,
          reason:
            typeof payload.reason === "string" ? String(payload.reason) : null,
          variantCount: toPositiveInt(payload.variantCount),
          anchorsCount: toPositiveInt(payload.anchorsCount),
          requiredExplicitDocs: toPositiveInt(payload.requiredExplicitDocs),
          actualExplicitDocs: toPositiveInt(payload.actualExplicitDocs),
          scoreDeltaSummary,
        },
      });
    });

    await Promise.all([
      this.writer.upsertQueryTelemetry({
        traceId: params.traceId,
        userId: params.req.userId,
        conversationId: params.conversationId,
        messageId: params.assistantMessageId || params.userMessageId || null,
        queryText: params.req.message,
        intent: resolvedIntent,
        intentConfidence: retrievalAdequate ? 0.92 : 0.72,
        domain: resolvedDomain,
        answerMode: params.answerMode,
        operatorFamily:
          typeof meta.operatorFamily === "string"
            ? String(meta.operatorFamily)
            : typeof meta.operator === "string"
              ? String(meta.operator)
              : retrievalAdequate
                ? "answer_with_sources"
                : "answer",
        chunksReturned: params.retrievalPack?.evidence.length ?? 0,
        distinctDocs: distinctDocIds.length,
        documentIds: distinctDocIds,
        topRelevanceScore: params.retrievalPack?.stats.topScore ?? null,
        retrievalAdequate,
        evidenceGateAction: evidenceAction,
        evidenceShouldProceed:
          evidenceAction === "answer" || evidenceAction === "hedge",
        hadFallback: Boolean(fallbackReasonForTelemetry),
        fallbackScenario: fallbackReasonForTelemetry,
        answerLength: String(params.assistantText || "").length,
        wasTruncated: truncation.contractOccurred,
        wasProviderTruncated: truncation.providerOccurred,
        truncationDetectorVersion: truncation.detectorVersion,
        truncationReason: truncation.contractReason,
        providerTruncationReason: truncation.providerReason,
        failureCode: params.failureCode || null,
        hasErrors: params.status === "failed" || Boolean(params.failureCode),
        warnings: warningCodes,
        totalMs: params.totalMs,
        ackMs: toPositiveInt(streamTelemetry.ackMs),
        ttft:
          toPositiveInt(asObject(params.telemetry).firstTokenMs) ??
          toPositiveInt(streamTelemetry.firstTokenMs),
        firstUsefulContentMs: toPositiveInt(streamTelemetry.firstUsefulContentMs),
        retrievalMs: params.retrievalMs ?? null,
        llmMs: params.llmMs ?? null,
        streamStarted: Boolean(streamTelemetry.streamStarted),
        firstTokenReceived: Boolean(streamTelemetry.firstTokenReceived),
        streamEnded: Boolean(streamTelemetry.streamEnded),
        clientDisconnected: Boolean(streamTelemetry.clientDisconnected),
        sseErrors: Array.isArray(streamTelemetry.sseErrors)
          ? streamTelemetry.sseErrors
          : [],
        chunksSent: toPositiveInt(streamTelemetry.chunksSent),
        streamDurationMs: toPositiveInt(streamTelemetry.streamDurationMs),
        wasAborted: Boolean(streamTelemetry.wasAborted),
        model:
          typeof params.telemetry?.model === "string"
            ? params.telemetry.model
            : null,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens,
        pipelineSignature: params.stream
          ? "chat_runtime_kernel:stream"
          : "chat_runtime_kernel:chat",
        environment: this.telemetryProjector.getEnvironment(),
        errors: params.failureCode ? { failureCode: params.failureCode } : null,
      }),
      this.writer.writeRetrievalEvent({
        traceId: params.traceId,
        userId: params.req.userId,
        conversationId: params.conversationId,
        operator: resolvedOperator,
        intent: resolvedIntent,
        domain: resolvedDomain,
        docLockEnabled:
          Boolean(params.retrievalPack?.scope.explicitDocLock) ||
          (params.req.attachedDocumentIds || []).length > 0,
        strategy: params.retrievalPack ? "hybrid_keyword_ranked" : "none",
        candidates: params.retrievalPack?.stats.candidatesConsidered ?? 0,
        selected: params.retrievalPack?.evidence.length ?? 0,
        evidenceStrength,
        refined: (params.retrievalPack?.stats.scoreGap ?? 0) > 0.08,
        wrongDocPrevented:
          (params.retrievalPack?.stats.scopeCandidatesDropped ?? 0) > 0,
        sourcesCount: params.retrievalPack?.evidence.length ?? 0,
        navPillsUsed: params.answerMode === "nav_pills",
        fallbackReasonCode: fallbackReasonForTelemetry,
        at: new Date(),
        meta: {
          requestId:
            typeof meta.requestId === "string" ? String(meta.requestId) : null,
          evidenceGateAction: evidenceAction,
          retrievalStats: params.retrievalPack?.stats || null,
          retrievalRuleSummary: params.retrievalPack?.telemetry?.summary || null,
          fallbackPolicy:
            Object.keys(fallbackPolicyMeta).length > 0 ? fallbackPolicyMeta : null,
          fallbackReasonCodeUser: fallbackReasonForUser,
          provenanceTelemetry: params.provenanceTelemetry || null,
        },
      }),
      ...retrievalRuleEventWrites,
    ]);

    await this.writer.flush(params.traceId, {
      status: this.telemetryProjector.toTraceFinalStatus(params.status),
    });
  }
}
