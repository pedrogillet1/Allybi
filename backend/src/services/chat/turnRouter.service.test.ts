import { describe, test, expect, jest } from "@jest/globals";
import { TurnRouterService } from "./turnRouter.service";
import type { TurnContext } from "./chat.types";
import type { IntentDecisionOutput } from "../config/intentConfig.service";

// ---------------------------------------------------------------------------
// Minimal TurnContext factory
// ---------------------------------------------------------------------------

function makeCtx(
  overrides: Partial<TurnContext> & { viewerMode?: boolean } = {},
): TurnContext {
  const { viewerMode, ...rest } = overrides;
  return {
    userId: "user-1",
    messageText: "hello",
    locale: "en",
    now: new Date(),
    attachedDocuments: [],
    connectors: { connected: {} },
    request: {
      userId: "user-1",
      message: "hello",
    },
    ...(viewerMode
      ? {
          viewer: {
            mode: "viewer",
            documentId: "doc-1",
            fileType: "docx",
          },
        }
      : {}),
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// Mock dep factories
// ---------------------------------------------------------------------------

function makeDecisionOutput(intentFamily: string): IntentDecisionOutput {
  return {
    intentId: intentFamily,
    intentFamily,
    operatorId: "extract",
    domainId: "general",
    confidence: 0.8,
    decisionNotes: [],
    persistable: {
      intentId: intentFamily,
      operatorId: "extract",
      intentFamily,
      domainId: "general",
      confidence: 0.8,
    },
  };
}

function makeFileActionBank() {
  return {
    config: {
      operatorDetection: {
        enabled: true,
        useRegex: true,
        caseInsensitive: true,
        stripDiacritics: true,
        collapseWhitespace: true,
        minConfidence: 0.55,
        maxCandidatesPerMessage: 3,
        guards: {
          mustNotContain: {
            en: ["\\bsummarize\\b"],
            pt: [],
          },
          mustNotMatchWholeMessage: {
            en: ["^\\s*hello\\s*$"],
            pt: [],
          },
        },
      },
    },
    detectionRules: [
      {
        id: "DET_OPEN",
        operator: "open",
        priority: 70,
        confidence: 0.78,
        patterns: {
          en: ["\\bopen\\b"],
        },
      },
      {
        id: "DET_FILE_MOVE",
        operator: "file_move",
        priority: 78,
        confidence: 0.74,
        patterns: {
          en: ["\\bmove\\b.{0,120}\\bto\\b"],
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TurnRouterService.decide()", () => {
  // -------------------------------------------------------------------------
  // 1. Connector turn detected in non-viewer mode → CONNECTOR
  // -------------------------------------------------------------------------
  test("returns CONNECTOR when connector turn detected in non-viewer mode", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(true),
    };
    const intentConfig = { decide: jest.fn<() => IntentDecisionOutput>() };

    const router = new TurnRouterService(routePolicy, intentConfig);
    const ctx = makeCtx({ messageText: "check my email" });

    expect(router.decide(ctx)).toBe("CONNECTOR");
  });

  // -------------------------------------------------------------------------
  // 2. Connector turn in viewer mode → CONNECTOR
  // -------------------------------------------------------------------------
  test("returns CONNECTOR when connector intent detected in viewer mode", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(true),
    };
    const intentConfig = { decide: jest.fn<() => IntentDecisionOutput>() };

    const router = new TurnRouterService(routePolicy, intentConfig);
    const ctx = makeCtx({ viewerMode: true, messageText: "send that email" });

    expect(router.decide(ctx)).toBe("CONNECTOR");
  });

  // -------------------------------------------------------------------------
  // 3. Viewer mode without connector intent → KNOWLEDGE (editor route removed)
  // -------------------------------------------------------------------------
  test("returns KNOWLEDGE when in viewer mode (editor route removed)", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = { decide: jest.fn<() => IntentDecisionOutput>() };

    const router = new TurnRouterService(routePolicy, intentConfig);
    const ctx = makeCtx({
      viewerMode: true,
      messageText: "what does this paragraph say?",
    });

    expect(router.decide(ctx)).toBe("KNOWLEDGE");
    // Should NOT consult intentConfig for viewer mode — it short-circuits to KNOWLEDGE
    expect(intentConfig.decide).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 4. Docs available → KNOWLEDGE (via intentConfig returning "documents")
  // -------------------------------------------------------------------------
  test("returns KNOWLEDGE when docs are available and intentConfig maps to documents family", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = {
      decide: jest
        .fn<() => IntentDecisionOutput>()
        .mockReturnValue(makeDecisionOutput("documents")),
    };

    const router = new TurnRouterService(routePolicy, intentConfig);
    const ctx = makeCtx({
      attachedDocuments: [{ id: "doc-1", mime: "application/pdf" }],
      messageText: "summarize the document",
    });

    expect(router.decide(ctx)).toBe("KNOWLEDGE");
  });

  // -------------------------------------------------------------------------
  // 5. Fallback → GENERAL (no docs, no viewer, no connector, intentConfig returns null)
  // -------------------------------------------------------------------------
  test("returns GENERAL as fallback when no docs, no viewer mode, and no connector", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    // Returning null forces the router to fall through to the docsAvailable branch
    const intentConfig = {
      decide: jest.fn(() => {
        throw new Error("intentConfig unavailable");
      }),
    };

    const router = new TurnRouterService(routePolicy, intentConfig);
    // No attachedDocuments, no activeDocument, no viewer, no connector
    const ctx = makeCtx({ messageText: "what is the weather?" });

    expect(router.decide(ctx)).toBe("GENERAL");
  });

  // -------------------------------------------------------------------------
  // 6a. Intent config mapping: "connectors" family → CONNECTOR
  // -------------------------------------------------------------------------
  test("maps intentFamily 'connectors' to CONNECTOR route", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = {
      decide: jest
        .fn<() => IntentDecisionOutput>()
        .mockReturnValue(makeDecisionOutput("connectors")),
    };

    const router = new TurnRouterService(routePolicy, intentConfig);
    const ctx = makeCtx({ messageText: "connect to gmail" });

    expect(router.decide(ctx)).toBe("CONNECTOR");
  });

  // -------------------------------------------------------------------------
  // 6b. Intent config mapping: "email" family → CONNECTOR
  // -------------------------------------------------------------------------
  test("maps intentFamily 'email' to CONNECTOR route", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = {
      decide: jest
        .fn<() => IntentDecisionOutput>()
        .mockReturnValue(makeDecisionOutput("email")),
    };

    const router = new TurnRouterService(routePolicy, intentConfig);
    const ctx = makeCtx({ messageText: "reply to the last email" });

    expect(router.decide(ctx)).toBe("CONNECTOR");
  });

  // -------------------------------------------------------------------------
  // 6c. Intent config mapping: "editing" family → KNOWLEDGE
  // -------------------------------------------------------------------------
  test("maps intentFamily 'editing' to KNOWLEDGE route", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = {
      decide: jest
        .fn<() => IntentDecisionOutput>()
        .mockReturnValue(makeDecisionOutput("editing")),
    };

    const router = new TurnRouterService(routePolicy, intentConfig);
    const ctx = makeCtx({
      attachedDocuments: [
        {
          id: "doc-2",
          mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      ],
      messageText: "bold the heading",
    });

    expect(router.decide(ctx)).toBe("KNOWLEDGE");
  });

  // -------------------------------------------------------------------------
  // 7. activeDocument present (no attachedDocuments) → KNOWLEDGE
  // -------------------------------------------------------------------------
  test("returns KNOWLEDGE when activeDocument is present and no connector", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = {
      decide: jest
        .fn<() => IntentDecisionOutput>()
        .mockReturnValue(makeDecisionOutput("documents")),
    };

    const router = new TurnRouterService(routePolicy, intentConfig);
    const ctx = makeCtx({
      activeDocument: {
        id: "active-doc",
        mime: "application/pdf",
        title: "Report.pdf",
      },
      messageText: "what is the conclusion?",
    });

    expect(router.decide(ctx)).toBe("KNOWLEDGE");
  });

  // -------------------------------------------------------------------------
  // 8. Normal chat never returns EDITOR route
  // -------------------------------------------------------------------------
  test("normal chat never returns EDITOR route", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = {
      decide: jest
        .fn<() => IntentDecisionOutput>()
        .mockReturnValue(makeDecisionOutput("documents")),
    };

    const router = new TurnRouterService(routePolicy, intentConfig);

    // Test various contexts — none should return "EDITOR"
    const contexts = [
      makeCtx({ messageText: "hello" }),
      makeCtx({ viewerMode: true, messageText: "edit this" }),
      makeCtx({
        attachedDocuments: [{ id: "d1", mime: "application/pdf" }],
        messageText: "summarize",
      }),
    ];

    for (const ctx of contexts) {
      const route = router.decide(ctx);
      expect(route).not.toBe("EDITOR");
    }
  });

  test("uses file_action detection rules to emit file_actions candidate operator", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    let capturedCandidates: Array<{
      operatorId?: string;
      intentFamily?: string;
    }> = [];
    const intentConfig = {
      decide: jest.fn(
        (input: {
          candidates: Array<{ operatorId?: string; intentFamily?: string }>;
        }) => {
          capturedCandidates = input.candidates;
          return makeDecisionOutput("file_actions");
        },
      ),
    };
    const bank = makeFileActionBank();
    const router = new TurnRouterService(
      routePolicy,
      intentConfig as any,
      ((bankId: string) =>
        bankId === "file_action_operators" ? bank : null) as any,
    );
    const ctx = makeCtx({ messageText: "move report.pdf to Archive" });

    expect(router.decide(ctx)).toBe("KNOWLEDGE");
    expect(intentConfig.decide).toHaveBeenCalled();
    const fileCandidate = capturedCandidates.find(
      (c) => c.intentFamily === "file_actions",
    );
    expect(fileCandidate?.operatorId).toBe("file_move");
  });

  test("suppresses file_action detection when global mustNotContain guard matches", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    let capturedCandidates: Array<{ intentFamily?: string }> = [];
    const intentConfig = {
      decide: jest.fn((input: { candidates: Array<{ intentFamily?: string }> }) => {
        capturedCandidates = input.candidates;
        return makeDecisionOutput("help");
      }),
    };
    const bank = makeFileActionBank();
    const router = new TurnRouterService(
      routePolicy,
      intentConfig as any,
      ((bankId: string) =>
        bankId === "file_action_operators" ? bank : null) as any,
    );
    const ctx = makeCtx({ messageText: "summarize this and open report.pdf" });

    expect(router.decide(ctx)).toBe("GENERAL");
    expect(intentConfig.decide).toHaveBeenCalled();
    const hasFileActions = capturedCandidates.some(
      (c) => c.intentFamily === "file_actions",
    );
    expect(hasFileActions).toBe(false);
  });

  test("suppresses file_action candidate using operator collision matrix", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    let capturedCandidates: Array<{ intentFamily?: string }> = [];
    const intentConfig = {
      decide: jest.fn((input: { candidates: Array<{ intentFamily?: string }> }) => {
        capturedCandidates = input.candidates;
        return makeDecisionOutput("help");
      }),
    };
    const bank = makeFileActionBank();
    const collisionMatrixBank = {
      config: { enabled: true },
      rules: [
        {
          id: "CM_1",
          when: {
            operators: ["open"],
            queryRegexAny: {
              en: ["\\bwhere\\s+in\\s+the\\s+document\\b"],
            },
          },
        },
      ],
    };
    const router = new TurnRouterService(
      routePolicy,
      intentConfig as any,
      ((bankId: string) =>
        bankId === "file_action_operators" ? bank : null) as any,
      ((bankId: string) =>
        bankId === "operator_collision_matrix"
          ? collisionMatrixBank
          : null) as any,
    );
    const ctx = makeCtx({
      messageText: "open report.pdf where in the document is the clause",
    });

    expect(router.decide(ctx)).toBe("GENERAL");
    expect(intentConfig.decide).toHaveBeenCalled();
    const hasFileActions = capturedCandidates.some(
      (c) => c.intentFamily === "file_actions",
    );
    expect(hasFileActions).toBe(false);
  });

  test("respects caseSensitive file action detection when caseInsensitive=false", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const bank = makeFileActionBank();
    bank.config.operatorDetection.caseInsensitive = false;
    let capturedCandidates: Array<{
      operatorId?: string;
      intentFamily?: string;
    }> = [];
    const intentConfig = {
      decide: jest.fn(
        (input: {
          candidates: Array<{ operatorId?: string; intentFamily?: string }>;
        }) => {
          capturedCandidates = input.candidates;
          return makeDecisionOutput("help");
        },
      ),
    };
    const router = new TurnRouterService(
      routePolicy,
      intentConfig as any,
      ((bankId: string) =>
        bankId === "file_action_operators" ? bank : null) as any,
    );
    const ctx = makeCtx({ messageText: "MOVE report.pdf TO archive" });

    expect(router.decide(ctx)).toBe("GENERAL");
    const fileCandidate = capturedCandidates.find(
      (c) => c.intentFamily === "file_actions",
    );
    expect(fileCandidate).toBeUndefined();
  });

  test("matches uppercase file action message when caseInsensitive=true", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const bank = makeFileActionBank();
    bank.config.operatorDetection.caseInsensitive = true;
    let capturedCandidates: Array<{
      operatorId?: string;
      intentFamily?: string;
    }> = [];
    const intentConfig = {
      decide: jest.fn(
        (input: {
          candidates: Array<{ operatorId?: string; intentFamily?: string }>;
        }) => {
          capturedCandidates = input.candidates;
          return makeDecisionOutput("file_actions");
        },
      ),
    };
    const router = new TurnRouterService(
      routePolicy,
      intentConfig as any,
      ((bankId: string) =>
        bankId === "file_action_operators" ? bank : null) as any,
    );
    const ctx = makeCtx({ messageText: "MOVE report.pdf TO archive" });

    expect(router.decide(ctx)).toBe("KNOWLEDGE");
    const fileCandidate = capturedCandidates.find(
      (c) => c.intentFamily === "file_actions",
    );
    expect(fileCandidate?.operatorId).toBe("file_move");
  });

  test("uses followup_indicators bank when explicit context followup signal is absent", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = {
      decide: jest.fn(
        (input: {
          signals?: { isFollowup?: boolean; followupConfidence?: number };
        }) => {
          expect(input.signals?.isFollowup).toBe(true);
          expect((input.signals?.followupConfidence || 0) >= 0.65).toBe(true);
          return makeDecisionOutput("documents");
        },
      ),
    };
    const followupIndicatorsBank = {
      config: {
        enabled: true,
        actionsContract: { thresholds: { followupScoreMin: 0.65 } },
      },
      rules: [
        {
          id: "continuation_markers",
          triggerPatterns: {
            en: ["\\b(and also|also|now|continue|next|then)\\b"],
          },
          action: { type: "add_followup_score", score: 0.7 },
          reasonCode: "followup_continuation_marker",
        },
      ],
    };
    const router = new TurnRouterService(
      routePolicy,
      intentConfig as any,
      (() => null) as any,
      ((bankId: string) =>
        bankId === "followup_indicators"
          ? followupIndicatorsBank
          : null) as any,
    );
    const ctx = makeCtx({
      messageText: "and also the margin",
      request: {
        userId: "user-1",
        message: "and also the margin",
        context: {
          intentState: {
            lastRoutingDecision: { intentFamily: "documents" },
          },
        },
      },
      attachedDocuments: [{ id: "doc-1", mime: "application/pdf" }],
    });

    expect(router.decide(ctx)).toBe("KNOWLEDGE");
    expect(intentConfig.decide).toHaveBeenCalled();
  });

  test("passes connector context into route policy decision call", () => {
    const routePolicy = {
      resolveConnectorDecision: jest.fn(() => null),
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = {
      decide: jest
        .fn<() => IntentDecisionOutput>()
        .mockReturnValue(makeDecisionOutput("help")),
    };

    const router = new TurnRouterService(routePolicy as any, intentConfig);
    const ctx = makeCtx({
      messageText: "sync gmail",
      connectors: {
        activeConnector: "gmail",
        connected: { gmail: true, outlook: false },
      },
      request: {
        userId: "user-1",
        message: "sync gmail",
        context: { signals: { hasConnectorReadPermission: true } },
      },
    });

    router.decide(ctx);

    expect(routePolicy.resolveConnectorDecision).toHaveBeenCalledWith(
      "sync gmail",
      "en",
      expect.objectContaining({
        activeProvider: "gmail",
        connectedProviders: expect.objectContaining({ gmail: true }),
        hasConnectorReadPermission: true,
      }),
    );
  });
});
