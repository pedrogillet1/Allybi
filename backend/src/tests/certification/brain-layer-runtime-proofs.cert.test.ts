import { describe, expect, jest, test } from "@jest/globals";

import { RetrievalEngineService } from "../../services/core/retrieval/retrievalEngine.service";
import { ResponseContractEnforcerService } from "../../services/core/enforcement/responseContractEnforcer.service";
import { validateChatProvenance } from "../../modules/chat/runtime/provenance/ProvenanceValidator";
import { writeCertificationGateReport } from "./reporting";

function bankById(bankId: string): unknown {
  switch (bankId) {
    case "render_policy":
      return {
        config: {
          markdown: { allowCodeBlocks: false, maxConsecutiveNewlines: 2 },
          noJsonOutput: { enabled: true, detectJsonLike: true },
        },
        enforcementRules: {
          rules: [{ id: "RP6_MAX_ONE_QUESTION", then: { maxQuestions: 1 } }],
        },
      };
    case "ui_contracts":
      return { config: { enabled: true } };
    case "banned_phrases":
      return {
        config: { enabled: true, actionOnMatch: "strip_or_replace" },
        categories: {},
        patterns: [],
        sourceLeakage: { patterns: [] },
        robotic: {
          en: ["as an ai language model", "i cannot access the document directly"],
          pt: ["como uma ia"],
          es: [],
        },
      };
    case "truncation_and_limits":
      return {
        globalLimits: {
          maxResponseCharsHard: 12000,
          maxResponseTokensHard: 3500,
        },
      };
    case "bullet_rules":
    case "table_rules":
    case "quote_styles":
    case "citation_styles":
    case "list_styles":
    case "table_styles":
      return { config: { enabled: true } };
    case "answer_style_policy":
      return {
        config: {
          enabled: true,
          globalRules: {
            maxQuestionsPerAnswer: 1,
            forceDoubleNewlineBetweenBlocks: false,
          },
        },
        profiles: {},
      };
    default:
      return { config: { enabled: true } };
  }
}

jest.mock("../../services/core/banks/bankLoader.service", () => ({
  __esModule: true,
  getBank: (bankId: string) => bankById(bankId),
  getOptionalBank: (bankId: string) => bankById(bankId),
}));

function makeRequiredBanks() {
  return {
    semantic_search_config: {
      config: {
        queryExpansionPolicy: { enabled: false },
        hybridPhases: [{ id: "phase_semantic", type: "semantic", enabled: true, k: 10 }],
      },
    },
    retrieval_ranker_config: {
      config: {
        weights: {
          semantic: 1,
          lexical: 0,
          structural: 0,
          titleBoost: 0,
          typeBoost: 0,
          recencyBoost: 0,
        },
        actionsContract: {
          thresholds: {
            minFinalScore: 0,
          },
        },
      },
    },
    retrieval_negatives: {
      config: {
        enabled: true,
        actionsContract: {
          thresholds: {
            minRelevanceScore: 0,
          },
        },
      },
    },
    diversification_rules: {
      config: {
        enabled: true,
        actionsContract: {
          thresholds: {
            maxPerDocHard: 8,
            maxTotalChunksHard: 32,
            maxNearDuplicatesPerDoc: 5,
            nearDuplicateWindowChars: 280,
          },
        },
      },
    },
    evidence_packaging: {
      config: {
        actionsContract: {
          thresholds: {
            maxEvidenceItemsHard: 32,
            maxEvidencePerDocHard: 12,
            minFinalScore: 0,
          },
        },
      },
    },
  };
}

function makeProofEngine(): RetrievalEngineService {
  const bankLoader = {
    getBank<T = unknown>(bankId: string): T {
      const banks = makeRequiredBanks() as Record<string, unknown>;
      const resolved = banks[bankId];
      if (!resolved) throw new Error(`missing required bank: ${bankId}`);
      return resolved as T;
    },
  };

  const docStore = {
    async listDocs() {
      return [
        "lease_active",
        "lease_old",
        "att_bill_april",
        "att_bill_march",
        "certidao_nascimento",
        "passport_scan",
      ].map((docId) => ({
        docId,
        title: docId,
        filename: `${docId}.pdf`,
      }));
    },
    async getDocMeta(docId: string) {
      return { docId, title: docId, filename: `${docId}.pdf` };
    },
  };

  const semanticIndex = {
    async search(opts: { query: string }) {
      const query = String(opts.query || "").toLowerCase();
      if (query.includes("tenant")) {
        return [
          {
            docId: "lease_active",
            location: { page: 2 },
            snippet: "tenant_name Avery Stone appears in the active lease",
            score: 0.96,
            locationKey: "d:lease_active|p:2|c:1",
            chunkId: "lease-active-1",
          },
          {
            docId: "lease_old",
            location: { page: 1 },
            snippet: "tenant_name Morgan Reed appears in the expired lease",
            score: 0.4,
            locationKey: "d:lease_old|p:1|c:1",
            chunkId: "lease-old-1",
          },
        ];
      }
      if (query.includes("due date") || query.includes("vencimento")) {
        return [
          {
            docId: "att_bill_april",
            location: { page: 1 },
            snippet: "due_date 2026-04-18 total_amount_due 214.60",
            score: 0.95,
            locationKey: "d:att_bill_april|p:1|c:1",
            chunkId: "att-april-1",
          },
          {
            docId: "att_bill_march",
            location: { page: 1 },
            snippet: "due_date 2026-03-18 total_amount_due 198.10",
            score: 0.42,
            locationKey: "d:att_bill_march|p:1|c:1",
            chunkId: "att-march-1",
          },
        ];
      }
      return [
        {
          docId: "certidao_nascimento",
          location: { page: 1 },
          snippet: "nome_registrado Lucas Almeida data_nascimento 2008-11-03",
          score: 0.94,
          locationKey: "d:certidao_nascimento|p:1|c:1",
          chunkId: "certidao-1",
        },
        {
          docId: "passport_scan",
          location: { page: 1 },
          snippet: "passport holder Lucas A. Almeida",
          score: 0.35,
          locationKey: "d:passport_scan|p:1|c:1",
          chunkId: "passport-1",
        },
      ];
    },
  };

  const lexicalIndex = { async search() { return []; } };
  const structuralIndex = { async search() { return []; } };
  const diBanks = {
    getCrossDocGroundingPolicy: () => null,
    getDocumentIntelligenceDomains: () => [],
    getDocTypeCatalog: () => null,
    getDocTypeSections: () => null,
    getDocTypeTables: () => null,
    getDomainDetectionRules: () => null,
    getLanguageIndicators: () => ({ config: { defaultLanguage: "en" } }),
    getRetrievalBoostRules: () => null,
    getQueryRewriteRules: () => null,
    getSectionPriorityRules: () => null,
  };

  return new RetrievalEngineService(
    bankLoader as any,
    docStore as any,
    semanticIndex as any,
    lexicalIndex as any,
    structuralIndex as any,
    undefined,
    diBanks as any,
  );
}

describe("Certification: brain-layer runtime proofs", () => {
  test("retrieval, provenance, composition, and parity gates hold for synthetic proof cases", async () => {
    const failures: string[] = [];
    const engine = makeProofEngine();

    const leasePack = await engine.retrieve({
      conversationId: "brain-proof",
      workspaceId: "ws-brain-proof",
      query: "Use only the active lease and extract the tenant name.",
      sourceDocumentIds: [],
      signals: {
        intentFamily: "documents",
        explicitDocLock: true,
        activeDocId: "lease_active",
        allowExpansion: false,
      },
    });
    if (leasePack.evidence[0]?.docId !== "lease_active") failures.push("LEASE_SCOPE_TOP_DOC");
    if (!String(leasePack.evidence[0]?.snippet || "").includes("Avery Stone")) {
      failures.push("LEASE_FIELD_VALUE_MISSING");
    }
    if (leasePack.evidence.some((item) => item.docId !== "lease_active")) {
      failures.push("LEASE_SCOPE_LEAK");
    }

    const attEn = await engine.retrieve({
      conversationId: "brain-proof",
      workspaceId: "ws-brain-proof",
      query: "What is the due date on the ATT bill?",
      sourceDocumentIds: [],
      signals: {},
    });
    const attPt = await engine.retrieve({
      conversationId: "brain-proof",
      workspaceId: "ws-brain-proof",
      query: "Qual e a data de vencimento da fatura da ATT?",
      sourceDocumentIds: [],
      signals: {},
    });
    if (attEn.evidence[0]?.docId !== "att_bill_april") failures.push("ATT_EN_TOP_DOC");
    if (attPt.evidence[0]?.docId !== "att_bill_april") failures.push("ATT_PT_TOP_DOC");
    if (attEn.evidence[0]?.docId !== attPt.evidence[0]?.docId) {
      failures.push("ATT_PARITY_TOP_DOC_MISMATCH");
    }

    const provenanceOk = validateChatProvenance({
      provenance: {
        mode: "hidden_map",
        required: true,
        validated: false,
        failureCode: null,
        evidenceIdsUsed: ["doc-1:p1", "doc-1:p2"],
        sourceDocumentIds: ["doc-1"],
        snippetRefs: [
          {
            evidenceId: "doc-1:p1",
            documentId: "doc-1",
            locationKey: "d:doc-1|p:7|c:1",
            snippetHash: "hash-1",
            coverageScore: 0.82,
          },
          {
            evidenceId: "doc-1:p2",
            documentId: "doc-1",
            locationKey: "d:doc-1|p:9|c:3",
            snippetHash: "hash-2",
            coverageScore: 0.8,
          },
        ],
        coverageScore: 0.81,
        semanticCoverage: 0.81,
      } as any,
      answerMode: "doc_grounded_multi" as any,
      answerClass: "DOCUMENT" as any,
      allowedDocumentIds: ["doc-1"],
    });
    if (!provenanceOk.ok) failures.push("PROVENANCE_RICHNESS_BLOCKED");

    const enforcer = new ResponseContractEnforcerService();
    const enOut = enforcer.enforce(
      {
        content:
          "Based on the cited evidence, this likely reflects a short-term timing issue rather than a confirmed structural decline.",
        attachments: [
          {
            type: "source_buttons",
            buttons: [
              {
                documentId: "doc-1",
                title: "Mayfair_Deck.pdf",
                location: { type: "page", value: 7, label: "Page 7" },
                locationKey: "d:doc-1|p:7|c:1",
                snippet: "Customer concentration remains elevated in the current quarter.",
              },
            ],
          } as any,
        ],
      },
      {
        answerMode: "general_answer",
        language: "en",
        signals: { queryProfile: "analytical" },
      },
    );
    const enContent = String(enOut.content || "").toLowerCase();
    if (!enContent.includes("direct answer:")) failures.push("EN_DIRECT_ANSWER");
    if (!enContent.includes("key evidence:")) failures.push("EN_KEY_EVIDENCE");
    if (!enContent.includes("sources used:")) failures.push("EN_SOURCES_USED");
    if (!enContent.includes("in summary,")) failures.push("EN_SUMMARY_LINE");
    if (!enContent.includes("if you'd like,")) failures.push("EN_FOLLOWUP_LINE");
    if (!enContent.includes("page 7")) failures.push("EN_LOCATION_RICHNESS");
    if (!enContent.includes("likely")) failures.push("EN_UNCERTAINTY_MISSING");
    if (enContent.includes("as an ai language model")) failures.push("EN_ROBOTIC_TONE");

    const ptOut = enforcer.enforce(
      {
        content: "O principal risco e a concentracao de clientes.",
        attachments: [
          {
            type: "source_buttons",
            buttons: [
              {
                documentId: "doc-2",
                title: "SEVIS_RTI.pdf",
                location: { type: "page", value: 3, label: "Page 3" },
                locationKey: "d:doc-2|p:3|c:2",
                snippet: "O cronograma regulatorio segue apertado para a entrega.",
              },
            ],
          } as any,
        ],
      },
      {
        answerMode: "general_answer",
        language: "pt",
        signals: { queryProfile: "analytical" },
      },
    );
    const ptContent = String(ptOut.content || "");
    if (!ptContent.includes("Direct answer:")) failures.push("PT_DIRECT_ANSWER");
    if (!ptContent.includes("Key evidence:")) failures.push("PT_KEY_EVIDENCE");
    if (!ptContent.includes("Sources used:")) failures.push("PT_SOURCES_USED");
    if (!ptContent.includes("Em resumo,")) failures.push("PT_SUMMARY_LINE");
    if (!ptContent.includes("Se quiser,")) failures.push("PT_FOLLOWUP_LINE");

    const weakOut = enforcer.enforce(
      {
        content: "Not enough evidence yet.",
        attachments: [
          {
            type: "source_buttons",
            buttons: [
              {
                documentId: "doc-3",
                title: "TRABALHO_FINAL.png",
                location: { type: "page", value: 1, label: "Page 1" },
                locationKey: "d:doc-3|p:1|c:1",
                snippet: "Image OCR confidence low.",
              },
            ],
          } as any,
        ],
      },
      {
        answerMode: "general_answer",
        language: "en",
        signals: { queryProfile: "analytical" },
      },
    );
    const weakContent = String(weakOut.content || "");
    if (!weakContent.includes("Key evidence:")) failures.push("WEAK_RECOVERY_EVIDENCE_BLOCK");
    if (!weakContent.includes("Sources used:")) failures.push("WEAK_RECOVERY_SOURCE_BLOCK");

    writeCertificationGateReport("brain-layer-runtime-proofs", {
      passed: failures.length === 0,
      metrics: {
        retrievalCasesChecked: 3,
        multilingualParityPairsChecked: 1,
        compositionLanguagesChecked: 2,
        provenanceRichnessAccepted: provenanceOk.ok,
        weakAnswerRecoveryStructured: weakContent.includes("Sources used:"),
      },
      thresholds: {
        retrievalCasesChecked: 3,
        multilingualParityPairsChecked: 1,
        compositionLanguagesChecked: 2,
        provenanceRichnessAccepted: true,
        weakAnswerRecoveryStructured: true,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
