import "reflect-metadata";
import path from "path";
import { beforeAll, describe, expect, test } from "@jest/globals";

import type { EvidencePack } from "../../services/core/retrieval/retrievalEngine.service";
import { CentralizedChatRuntimeDelegate } from "../../modules/chat/runtime/CentralizedChatRuntimeDelegate";
import type { ChatEngine } from "../../modules/chat/domain/chat.contracts";
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
      scopeCandidatesDropped: 3,
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
      {
        evidenceType: "table",
        docId: "doc-b",
        title: "B Table",
        filename: "b.pdf",
        location: { page: 3, sectionKey: "variance_analysis" },
        locationKey: "doc-b:p3:t1",
        table: {
          header: ["Metric", "Q1"],
          rows: [["Revenue", 1250]],
          unitAnnotation: {
            unitRaw: "$M",
            unitNormalized: "USD_MILLIONS",
          },
          scaleFactor: "millions",
          footnotes: ["(1) restated"],
        },
        score: { finalScore: 0.79, semanticScore: 0.79 },
      },
    ],
    telemetry: {
      ruleEvents: [],
      summary: {
        matchedBoostRuleIds: ["BOOST_FINANCE_VARIANCE"],
        appliedBoostRuleIds: ["BOOST_FINANCE_VARIANCE"],
        rewriteRuleIds: ["REWRITE_VARIANCE_TERMS"],
        selectedSectionRuleId: "variance_analysis",
        crossDocGatedReason: null,
        classifiedDomain: "finance",
        classifiedDocTypeId: "variance_report",
        classificationReasons: ["keyword_match", "doc_type_hint"],
      },
    },
  };
}

describe("Certification: turn debug packet", () => {
  beforeAll(async () => {
    await initializeBanks({
      rootDir: path.resolve(process.cwd(), "src/data_banks"),
      strict: false,
      validateSchemas: false,
      allowEmptyChecksumsInNonProd: true,
      enableHotReload: false,
    });
  });

  test("runtime emits complete turn debug packet for doc-scoped turns", async () => {
    const engine: ChatEngine = {
      async generate() {
        return { text: "ok" };
      },
      async stream() {
        return { text: "ok", chunks: [] as string[] };
      },
    } as ChatEngine;

    const delegate = new CentralizedChatRuntimeDelegate(engine, {
      conversationMemory: {} as any,
    });

    const traceId = "tr_debug_packet_cert_1";
    const req = {
      userId: "user-1",
      message: "summarize attached docs",
      conversationId: "c1",
      attachedDocumentIds: ["doc-a", "doc-b"],
      preferredLanguage: "en",
      meta: { requestId: "req-debug-1" },
    } as any;

    await (delegate as any).persistTraceArtifacts({
      traceId,
      req,
      conversationId: "c1",
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
      fallbackReasonCode: null,
      assistantText: "Here is your summary.",
      telemetry: {
        requestedMaxOutputTokens: 900,
        usage: {
          inputTokens: 500,
          outputTokens: 320,
        },
      },
      totalMs: 1200,
      retrievalMs: 250,
      llmMs: 650,
      stream: false,
      enforcement: {
        repairs: [],
        warnings: [],
      },
      enforcementBlocked: false,
      enforcementReasonCode: null,
      provenance: {
        mode: "hidden_map",
        required: true,
        validated: true,
        failureCode: null,
        evidenceIdsUsed: ["doc-a:doc-a:p1", "doc-b:doc-b:p2"],
        sourceDocumentIds: ["doc-a", "doc-b"],
        snippetRefs: [],
        coverageScore: 1,
      },
    });

    const packet = (delegate as any).traceWriter.getLatestTurnDebugPacket(
      traceId,
    ) as any;

    const failures: string[] = [];
    if (!packet) failures.push("DEBUG_PACKET_MISSING");
    if (packet?.docScopeLock?.mode !== "docset")
      failures.push("DOC_SCOPE_MODE_INVALID");
    if (packet?.docScopeLock?.allowedDocumentIdsCount !== 2)
      failures.push("DOC_SCOPE_COUNT_INVALID");
    if ((packet?.retrieval?.candidates || 0) < 1)
      failures.push("RETRIEVAL_CANDIDATES_MISSING");
    if ((packet?.retrieval?.selected || 0) < 1)
      failures.push("RETRIEVAL_SELECTED_MISSING");
    if (!packet?.retrieval?.selectionRationale)
      failures.push("RETRIEVAL_SELECTION_RATIONALE_MISSING");
    if (
      packet?.retrieval?.selectionRationale?.selectedSectionRuleId !==
      "variance_analysis"
    ) {
      failures.push("RETRIEVAL_SECTION_RULE_MISSING");
    }
    if ((packet?.retrieval?.tableContextCoverage?.tableEvidenceCount || 0) < 1) {
      failures.push("RETRIEVAL_TABLE_CONTEXT_COVERAGE_MISSING");
    }
    if ((packet?.retrieval?.evidenceSelection?.length || 0) < 1) {
      failures.push("RETRIEVAL_EVIDENCE_SELECTION_MISSING");
    }
    if (!packet?.provenance?.evidenceMapHash)
      failures.push("PROVENANCE_HASH_MISSING");
    if (!packet?.budget?.requestedMaxOutputTokens)
      failures.push("TOKEN_BUDGET_MISSING");
    if (typeof packet?.output?.wasTruncated !== "boolean")
      failures.push("OUTPUT_TRUNCATION_FLAG_MISSING");

    writeCertificationGateReport("turn-debug-packet", {
      passed: failures.length === 0,
      metrics: {
        hasPacket: Boolean(packet),
        docScopeMode: packet?.docScopeLock?.mode || null,
        allowedDocumentIdsCount: packet?.docScopeLock?.allowedDocumentIdsCount,
        retrievalCandidates: packet?.retrieval?.candidates ?? null,
        retrievalSelected: packet?.retrieval?.selected ?? null,
        hasSelectionRationale: Boolean(packet?.retrieval?.selectionRationale),
        selectedSectionRuleId:
          packet?.retrieval?.selectionRationale?.selectedSectionRuleId || null,
        tableEvidenceCount:
          packet?.retrieval?.tableContextCoverage?.tableEvidenceCount ?? null,
        evidenceSelectionCount:
          packet?.retrieval?.evidenceSelection?.length ?? null,
        hasEvidenceMapHash: Boolean(packet?.provenance?.evidenceMapHash),
        hasTokenBudget:
          packet?.budget?.requestedMaxOutputTokens != null &&
          packet?.budget?.hardMaxOutputTokens != null,
      },
      thresholds: {
        hasPacket: true,
        docScopeMode: "docset",
        minAllowedDocumentIdsCount: 2,
        minRetrievalCandidates: 1,
        minRetrievalSelected: 1,
        hasSelectionRationale: true,
        selectedSectionRuleId: "variance_analysis",
        minTableEvidenceCount: 1,
        minEvidenceSelectionCount: 1,
        hasEvidenceMapHash: true,
        hasTokenBudget: true,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
