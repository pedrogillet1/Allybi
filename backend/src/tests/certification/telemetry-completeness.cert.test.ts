import "reflect-metadata";
import path from "path";
import { beforeAll, describe, expect, jest, test } from "@jest/globals";

import { CentralizedChatRuntimeDelegate as RuntimeDelegateV1 } from "../../modules/chat/runtime/CentralizedChatRuntimeDelegate";
import { CentralizedChatRuntimeDelegate as RuntimeDelegateV2 } from "../../modules/chat/runtime/CentralizedChatRuntimeDelegate.v2";
import type { ChatEngine } from "../../modules/chat/domain/chat.contracts";
import type { EvidencePack } from "../../services/core/retrieval/retrievalEngine.service";
import { initializeBanks } from "../../services/core/banks/bankLoader.service";

import { writeCertificationGateReport } from "./reporting";

function buildRetrievalPack(): EvidencePack {
  return {
    query: {
      original: "summarize attached docs",
      normalized: "summarize attached docs",
    },
    scope: {
      activeDocId: null,
      explicitDocLock: true,
      candidateDocIds: ["doc-a", "doc-b"],
      hardScopeActive: true,
      sheetName: null,
      rangeA1: null,
    },
    stats: {
      candidatesConsidered: 12,
      candidatesAfterNegatives: 9,
      candidatesAfterBoosts: 8,
      candidatesAfterDiversification: 6,
      scopeCandidatesDropped: 1,
      scopeViolationsDetected: 0,
      scopeViolationsThrown: 0,
      evidenceItems: 2,
      uniqueDocsInEvidence: 2,
      topScore: 0.92,
      scoreGap: 0.18,
    },
    evidence: [
      {
        evidenceType: "text",
        docId: "doc-a",
        title: "A",
        filename: "a.pdf",
        location: { page: 1 },
        locationKey: "doc-a:p1",
        snippet: "contract amount and owner",
        score: { finalScore: 0.92, semanticScore: 0.92 },
      },
      {
        evidenceType: "text",
        docId: "doc-b",
        title: "B",
        filename: "b.pdf",
        location: { page: 2 },
        locationKey: "doc-b:p2",
        snippet: "payment terms and schedule",
        score: { finalScore: 0.81, semanticScore: 0.81 },
      },
    ],
    telemetry: {
      ruleEvents: [],
      summary: {
        matchedBoostRuleIds: ["BOOST_FINANCE"],
        appliedBoostRuleIds: ["BOOST_FINANCE"],
        rewriteRuleIds: ["REWRITE_FINANCE"],
        selectedSectionRuleId: "finance_summary",
        crossDocGatedReason: null,
        classifiedDomain: "finance",
        classifiedDocTypeId: "variance_report",
        classificationReasons: ["keyword_match"],
        candidateDecisionDigest: [],
      },
    },
  };
}

function makeTraceWriterMock() {
  return {
    recordBankUsage: jest.fn(),
    recordKeywords: jest.fn(),
    recordEntities: jest.fn(),
    writeTurnDebugPacket: jest.fn(),
    upsertQueryTelemetry: jest.fn().mockResolvedValue(undefined),
    writeRetrievalEvent: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
  };
}

describe("Certification: telemetry completeness", () => {
  beforeAll(async () => {
    await initializeBanks({
      rootDir: path.resolve(process.cwd(), "src/data_banks"),
      strict: false,
      validateSchemas: false,
      allowEmptyChecksumsInNonProd: true,
      enableHotReload: false,
    });
  });

  test("runtime delegates v1/v2 persist intent/evidence/cost/latency telemetry fields with strict fallback wiring", async () => {
    const engine: ChatEngine = {
      async generate() {
        return { text: "ok" };
      },
      async stream() {
        return { text: "ok", chunks: [] as string[] };
      },
    } as ChatEngine;
    const delegates = [
      {
        key: "v1",
        instance: new RuntimeDelegateV1(engine, { conversationMemory: {} as any }),
      },
      {
        key: "v2",
        instance: new RuntimeDelegateV2(engine, { conversationMemory: {} as any }),
      },
    ] as const;

    const failures: string[] = [];
    const wiringCoverage: Record<string, boolean> = {};
    const negativeFixtureCoverage: Record<string, boolean> = {};
    const intentCoverage: Record<string, boolean> = {};
    const evidenceCoverage: Record<string, boolean> = {};
    const costCoverage: Record<string, boolean> = {};
    const latencyCoverage: Record<string, boolean> = {};
    const negativeLatencyNullCoverage: Record<string, boolean> = {};
    const negativeCostNullCoverage: Record<string, boolean> = {};

    for (const { key, instance } of delegates) {
      const traceWriter = makeTraceWriterMock();
      (instance as any).traceWriter = traceWriter;

      await (instance as any).persistTraceArtifacts({
        traceId: `tr_cert_telemetry_${key}_full`,
        req: {
          userId: `user_${key}`,
          message: "Summarize my attached docs",
          conversationId: `conv_${key}`,
          attachedDocumentIds: ["doc-a", "doc-b"],
          preferredLanguage: "en",
          meta: {
            requestId: `req_${key}`,
            operator: "extract",
            intentFamily: "answer",
            domain: "finance",
            routingDecision: {
              operatorChoice: "extract",
              scopeDecision: "attached_only",
              disambiguation: "none",
            },
          },
        },
        conversationId: `conv_${key}`,
        userMessageId: "u1",
        assistantMessageId: "a1",
        retrievalPack: buildRetrievalPack(),
        evidenceGateDecision: {
          evidenceStrength: "strong",
          suggestedAction: "answer",
          summary: "sufficient evidence",
        },
        answerMode: "doc_grounded_multi",
        status: "success",
        failureCode: null,
        fallbackReasonCode: undefined,
        fallbackReasonCodeTelemetry: undefined,
        assistantText: "Here is your summary.",
        telemetry: {
          model: "gpt-4o-mini",
          firstTokenMs: 120,
          costUsd: 0.018,
          requestedMaxOutputTokens: 900,
          usage: {
            inputTokens: 330,
            outputTokens: 220,
          },
        },
        totalMs: 900,
        retrievalMs: 210,
        llmMs: 510,
        stream: false,
        enforcement: { repairs: [], warnings: [] },
        enforcementBlocked: false,
        enforcementReasonCode: null,
        provenance: null,
        provenanceTelemetry: null,
      });

      const upsertPayload = traceWriter.upsertQueryTelemetry.mock.calls[0]?.[0];
      const retrievalPayload =
        traceWriter.writeRetrievalEvent.mock.calls[0]?.[0] ?? null;
      if (!upsertPayload) {
        failures.push(`${key}:UPSERT_NOT_CALLED`);
      }
      if (!retrievalPayload) {
        failures.push(`${key}:RETRIEVAL_EVENT_NOT_CALLED`);
      }
      if (upsertPayload?.intent !== "answer") failures.push(`${key}:INTENT_MISSING`);
      if (upsertPayload?.evidenceGateAction !== "answer") {
        failures.push(`${key}:EVIDENCE_ACTION_MISSING`);
      }
      if (upsertPayload?.scopeDecision !== "attached_only") {
        failures.push(`${key}:SCOPE_DECISION_MISSING`);
      }
      if (upsertPayload?.disambiguation !== "none") {
        failures.push(`${key}:DISAMBIGUATION_MISSING`);
      }
      if (upsertPayload?.totalMs !== 900) failures.push(`${key}:TOTAL_MS_MISSING`);
      if (upsertPayload?.retrievalMs !== 210) {
        failures.push(`${key}:RETRIEVAL_MS_MISSING`);
      }
      if (upsertPayload?.llmMs !== 510) failures.push(`${key}:LLM_MS_MISSING`);
      if (upsertPayload?.inputTokens !== 330) {
        failures.push(`${key}:INPUT_TOKENS_MISSING`);
      }
      if (upsertPayload?.outputTokens !== 220) {
        failures.push(`${key}:OUTPUT_TOKENS_MISSING`);
      }
      if (upsertPayload?.totalTokens !== 550) {
        failures.push(`${key}:TOTAL_TOKENS_MISSING`);
      }
      if (upsertPayload?.estimatedCostUsd !== 0.018) {
        failures.push(`${key}:ESTIMATED_COST_MISSING`);
      }
      if (retrievalPayload?.evidenceStrength !== 0.9) {
        failures.push(`${key}:EVIDENCE_STRENGTH_MISSING`);
      }
      if (retrievalPayload?.sourcesCount !== 2) {
        failures.push(`${key}:SOURCES_COUNT_MISSING`);
      }
      if (retrievalPayload?.wrongDocPrevented !== true) {
        failures.push(`${key}:WRONG_DOC_SIGNAL_MISSING`);
      }

      wiringCoverage[key] =
        upsertPayload?.intent === "answer" &&
        upsertPayload?.totalMs === 900 &&
        upsertPayload?.retrievalMs === 210 &&
        upsertPayload?.llmMs === 510 &&
        upsertPayload?.estimatedCostUsd === 0.018 &&
        retrievalPayload?.evidenceStrength === 0.9 &&
        retrievalPayload?.sourcesCount === 2;
      intentCoverage[key] =
        upsertPayload?.intent === "answer" &&
        upsertPayload?.evidenceGateAction === "answer" &&
        upsertPayload?.scopeDecision === "attached_only" &&
        upsertPayload?.disambiguation === "none";
      evidenceCoverage[key] =
        retrievalPayload?.evidenceStrength === 0.9 &&
        retrievalPayload?.sourcesCount === 2 &&
        retrievalPayload?.wrongDocPrevented === true;
      costCoverage[key] =
        upsertPayload?.inputTokens === 330 &&
        upsertPayload?.outputTokens === 220 &&
        upsertPayload?.totalTokens === 550 &&
        upsertPayload?.estimatedCostUsd === 0.018;
      latencyCoverage[key] =
        upsertPayload?.totalMs === 900 &&
        upsertPayload?.retrievalMs === 210 &&
        upsertPayload?.llmMs === 510;

      await (instance as any).persistTraceArtifacts({
        traceId: `tr_cert_telemetry_${key}_negative`,
        req: {
          userId: `user_${key}`,
          message: "answer this without enough evidence",
          conversationId: `conv_${key}`,
          attachedDocumentIds: [],
          preferredLanguage: "en",
          meta: {
            requestId: `req_${key}_negative`,
          },
        },
        conversationId: `conv_${key}`,
        userMessageId: "u2",
        assistantMessageId: "a2",
        retrievalPack: null,
        evidenceGateDecision: null,
        answerMode: "help_steps",
        status: "failed",
        failureCode: "missing_provenance",
        fallbackReasonCode: "missing_provenance",
        fallbackReasonCodeTelemetry: "missing_provenance",
        assistantText: "I need more grounded evidence.",
        telemetry: null,
        totalMs: 345,
        stream: true,
        enforcement: { repairs: [], warnings: [] },
        enforcementBlocked: false,
        enforcementReasonCode: null,
        provenance: null,
        provenanceTelemetry: null,
      });

      const negativeUpsert = traceWriter.upsertQueryTelemetry.mock.calls[1]?.[0];
      const negativeRetrieval =
        traceWriter.writeRetrievalEvent.mock.calls[1]?.[0] ?? null;
      if (negativeUpsert?.retrievalMs !== null) {
        failures.push(`${key}:NEGATIVE_RETRIEVAL_MS_NOT_NULL`);
      }
      if (negativeUpsert?.llmMs !== null) {
        failures.push(`${key}:NEGATIVE_LLM_MS_NOT_NULL`);
      }
      if (negativeUpsert?.estimatedCostUsd !== null) {
        failures.push(`${key}:NEGATIVE_COST_NOT_NULL`);
      }
      if (negativeUpsert?.hadFallback !== true) {
        failures.push(`${key}:NEGATIVE_HAD_FALLBACK_MISSING`);
      }
      if (negativeUpsert?.fallbackScenario !== "missing_provenance") {
        failures.push(`${key}:NEGATIVE_FALLBACK_REASON_MISSING`);
      }
      if (negativeRetrieval?.fallbackReasonCode !== "missing_provenance") {
        failures.push(`${key}:NEGATIVE_RETRIEVAL_FALLBACK_MISSING`);
      }
      if (negativeRetrieval?.strategy !== "none") {
        failures.push(`${key}:NEGATIVE_RETRIEVAL_STRATEGY_MISSING`);
      }
      negativeFixtureCoverage[key] =
        negativeUpsert?.retrievalMs === null &&
        negativeUpsert?.llmMs === null &&
        negativeUpsert?.estimatedCostUsd === null &&
        negativeUpsert?.hadFallback === true &&
        negativeUpsert?.fallbackScenario === "missing_provenance" &&
        negativeRetrieval?.fallbackReasonCode === "missing_provenance";
      negativeLatencyNullCoverage[key] =
        negativeUpsert?.retrievalMs === null && negativeUpsert?.llmMs === null;
      negativeCostNullCoverage[key] = negativeUpsert?.estimatedCostUsd === null;
    }

    const delegateCoverageCount = Object.values(wiringCoverage).filter(Boolean).length;
    const negativeCoverageCount = Object.values(negativeFixtureCoverage).filter(
      Boolean,
    ).length;
    const intentCoverageCount = Object.values(intentCoverage).filter(Boolean).length;
    const evidenceCoverageCount = Object.values(evidenceCoverage).filter(
      Boolean,
    ).length;
    const costCoverageCount = Object.values(costCoverage).filter(Boolean).length;
    const latencyCoverageCount = Object.values(latencyCoverage).filter(Boolean).length;
    const negativeLatencyNullCount = Object.values(negativeLatencyNullCoverage).filter(
      Boolean,
    ).length;
    const negativeCostNullCount = Object.values(negativeCostNullCoverage).filter(
      Boolean,
    ).length;

    writeCertificationGateReport("telemetry-completeness", {
      passed: failures.length === 0,
      metrics: {
        delegatesCovered: delegateCoverageCount,
        delegatesExpected: delegates.length,
        negativeFixturesCovered: negativeCoverageCount,
        negativeFixturesExpected: delegates.length,
        intentFieldsCovered: intentCoverageCount,
        intentFieldsExpected: delegates.length,
        evidenceFieldsCovered: evidenceCoverageCount,
        evidenceFieldsExpected: delegates.length,
        costFieldsCovered: costCoverageCount,
        costFieldsExpected: delegates.length,
        latencyFieldsCovered: latencyCoverageCount,
        latencyFieldsExpected: delegates.length,
        negativeLatencyNullCovered: negativeLatencyNullCount,
        negativeLatencyNullExpected: delegates.length,
        negativeCostNullCovered: negativeCostNullCount,
        negativeCostNullExpected: delegates.length,
        intentCoverageRate:
          delegates.length > 0 ? intentCoverageCount / delegates.length : 0,
        evidenceCoverageRate:
          delegates.length > 0 ? evidenceCoverageCount / delegates.length : 0,
        costCoverageRate:
          delegates.length > 0 ? costCoverageCount / delegates.length : 0,
        latencyCoverageRate:
          delegates.length > 0 ? latencyCoverageCount / delegates.length : 0,
      },
      thresholds: {
        delegatesCovered: delegates.length,
        negativeFixturesCovered: delegates.length,
        intentFieldsCovered: delegates.length,
        evidenceFieldsCovered: delegates.length,
        costFieldsCovered: delegates.length,
        latencyFieldsCovered: delegates.length,
        negativeLatencyNullCovered: delegates.length,
        negativeCostNullCovered: delegates.length,
        intentCoverageRateMin: 1,
        evidenceCoverageRateMin: 1,
        costCoverageRateMin: 1,
        latencyCoverageRateMin: 1,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
