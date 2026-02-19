/**
 * editingDispatch.test.ts
 *
 * NOTE: KodaOrchestratorV3Service is the doc-grounded orchestrator pipeline.
 * Editing + connectors are executed by the chat-layer handler(s), not here.
 *
 * These tests assert:
 * - editing intentFamily does not crash and still returns a response
 * - connectors intentFamily returns a deterministic routing message
 * - creative intentFamily falls through to the normal pipeline (no "coming soon" here)
 */

import {
  describe,
  expect,
  test,
  jest,
  beforeAll,
  afterAll,
} from "@jest/globals";

// Mock the bank loader module so getBank returns safe stubs
jest.mock("../banks/bankLoader.service", () => ({
  getBank: (id: string) => {
    if (id === "editing_microcopy") {
      return {
        copy: {
          preview: { en: { body: "Edit preview ready." } },
          undo: { en: { body: "Edit undone." } },
          error: { en: { body: "Edit failed." } },
        },
      };
    }
    if (id === "connectors_microcopy") {
      return {
        copy: {
          connect: { start: { en: "Connect {{provider}} to continue." } },
          sync: { started: { en: "{{provider}} sync started." } },
        },
      };
    }
    return { _meta: {} };
  },
  getOptionalBank: () => null,
  hasBank: () => false,
  initBankLoader: async () => {},
}));

import {
  KodaOrchestratorV3Service,
  type OrchestratorDeps,
  type ChatTurnRequest,
} from "./kodaOrchestrator.service";

// ---------------------------------------------------------------------------
// Helpers: minimal dep stubs
// ---------------------------------------------------------------------------

function stubDeps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    docIndexService: {
      getSnapshot: async () => ({
        docCount: 5,
        candidates: [],
        lastUpdatedAt: new Date().toISOString(),
      }),
    },
    queryNormalizer: { normalize: (t: string) => t },
    intentEngine: {
      resolve: async () => ({
        intentFamily: "documents" as const,
        operator: "extract",
        confidence: 0.8,
        signals: {},
        constraints: {},
      }),
    },
    queryRewriter: {
      rewrite: async () => ({
        rewrittenText: "",
        hints: { docRefs: { docIds: [], filenames: [] } },
        tokens: { tokensNonStopword: [] },
        signals: {},
      }),
    },
    scopeResolver: { resolve: async () => ({ hard: {}, soft: {} }) },
    candidateFilters: {
      apply: async () => ({
        candidates: [],
        hardConstraintApplied: false,
        hardConstraintEmpty: false,
        filterNotes: [],
      }),
    },
    retrievalEngine: {
      retrieve: async () => ({
        candidatesSearched: [],
        evidence: [],
        topDocs: [],
        stats: { docCountTotal: 0, candidateCount: 0, topScore: 0, margin: 0 },
      }),
    },
    ranker: {
      decide: async () => ({
        candidateCount: 0,
        topScore: 0,
        margin: 0,
        autopick: false,
        ambiguous: false,
      }),
    },
    answerModeRouter: {
      route: async () => ({ mode: "general_answer" as const, reason: "test" }),
    },
    answerEngine: {
      generate: async () => ({ draft: "test answer", attachments: [] }),
    },
    renderPolicy: {
      apply: async ({ text }) => ({ text }),
    },
    docGroundingChecks: {
      check: async () => ({
        verdict: "pass" as const,
        reasons: [],
        recommendedAction: "proceed",
      }),
    },
    qualityGates: {
      run: async () => ({ ok: true, actions: [] }),
    },
    fallbackEngine: {
      emit: async () => ({
        content: "fallback",
        answerMode: "no_docs" as const,
        attachments: [],
      }),
    },
    stateUpdater: {
      apply: async () => ({}),
    },
    answerComposer: {
      finalizeOutput: (draft: string) => ({ content: draft }),
    },
    conversationMessages: {
      reply: async () => "Hello!",
    },
    ...overrides,
  };
}

function chatRequest(
  overrides: Partial<ChatTurnRequest> = {},
): ChatTurnRequest {
  return {
    conversationId: "conv_1",
    turnId: "turn_1",
    userId: "user_1",
    text: "Rewrite paragraph 3 to be more formal",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Orchestrator editing dispatch", () => {
  test("editing intentFamily falls through to normal pipeline and returns a response", async () => {
    const deps = stubDeps({
      intentEngine: {
        resolve: async () => ({
          intentFamily: "editing" as any,
          operator: "edit_paragraph",
          confidence: 0.85,
          signals: {},
          constraints: {},
        }),
      },
    });

    const orchestrator = new KodaOrchestratorV3Service(deps);
    const result = await orchestrator.handleTurn(chatRequest());

    expect(result.answerMode).toBe("general_answer");
    expect(result.content).toBe("test answer");
    expect(result.meta?.intentFamily).toBe("editing");
    expect(result.meta?.operator).toBe("edit_paragraph");
  });

  test("editing intentFamily respects language signal passthrough (pt)", async () => {
    const deps = stubDeps({
      intentEngine: {
        resolve: async () => ({
          intentFamily: "editing" as any,
          operator: "rewrite",
          confidence: 0.8,
          signals: { language: "pt" },
          constraints: {},
        }),
      },
    });

    const orchestrator = new KodaOrchestratorV3Service(deps);
    const result = await orchestrator.handleTurn(
      chatRequest({ text: "reformule isso", userPrefs: { language: "pt" } }),
    );
    expect(result.language).toBe("pt");
  });
});

describe("Orchestrator connector dispatch", () => {
  test("connectors intentFamily returns deterministic routing message (en)", async () => {
    const deps = stubDeps({
      intentEngine: {
        resolve: async () => ({
          intentFamily: "connectors" as any,
          operator: "connect_gmail",
          confidence: 0.9,
          signals: {},
          constraints: {},
        }),
      },
    });

    const orchestrator = new KodaOrchestratorV3Service(deps);
    const result = await orchestrator.handleTurn(
      chatRequest({ text: "connect my gmail" }),
    );

    expect(result.answerMode).toBe("general_answer");
    expect(result.content.toLowerCase()).toContain("connector actions");
    expect(result.content.toLowerCase()).toContain("gmail");
  });

  test("connectors intentFamily respects language (pt)", async () => {
    const deps = stubDeps({
      intentEngine: {
        resolve: async () => ({
          intentFamily: "connectors" as any,
          operator: "search_connector",
          confidence: 0.8,
          signals: { language: "pt" },
          constraints: {},
        }),
      },
    });

    const orchestrator = new KodaOrchestratorV3Service(deps);
    const result = await orchestrator.handleTurn(
      chatRequest({
        text: "conectar meu gmail",
        userPrefs: { language: "pt" },
      }),
    );
    expect(result.language).toBe("pt");
    expect(result.content.toLowerCase()).toContain("conectores");
  });
});

describe("Orchestrator creative dispatch", () => {
  test("creative intentFamily falls through to normal pipeline", async () => {
    const deps = stubDeps({
      intentEngine: {
        resolve: async () => ({
          intentFamily: "creative" as any,
          operator: "generate_slide_visual",
          confidence: 0.8,
          signals: {},
          constraints: {},
        }),
      },
    });

    const orchestrator = new KodaOrchestratorV3Service(deps);
    const result = await orchestrator.handleTurn(
      chatRequest({ text: "create a visual for slide 5" }),
    );

    expect(result.answerMode).toBe("general_answer");
    expect(result.content).toBe("test answer");
  });

  test("creative intentFamily respects language (pt) via userPrefs", async () => {
    const deps = stubDeps({
      intentEngine: {
        resolve: async () => ({
          intentFamily: "creative" as any,
          operator: "generate_diagram",
          confidence: 0.8,
          signals: { language: "pt" },
          constraints: {},
        }),
      },
    });

    const orchestrator = new KodaOrchestratorV3Service(deps);
    const result = await orchestrator.handleTurn(
      chatRequest({
        text: "criar um diagrama",
        userPrefs: { language: "pt" },
      }),
    );

    expect(result.language).toBe("pt");
  });
});
