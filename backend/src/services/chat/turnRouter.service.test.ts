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

  test("uses viewer_assistant_routing qa rule in viewer mode before default fallback", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = { decide: jest.fn<() => IntentDecisionOutput>() };
    const routingBankProvider = jest.fn((bankId: string) => {
      if (bankId !== "viewer_assistant_routing") return null;
      return {
        config: { enabled: true },
        rules: [
          {
            id: "viewer_intent_qa_locked_forces_qa_path",
            priority: 100,
            when: { "meta.viewerIntent": "qa_locked" },
            then: { path: "qa" },
          },
        ],
      };
    });

    const router = new TurnRouterService(
      routePolicy,
      intentConfig,
      (() => null) as any,
      routingBankProvider as any,
    );
    const ctx = makeCtx({
      viewerMode: true,
      messageText: "what does this paragraph say?",
      request: {
        userId: "user-1",
        message: "what does this paragraph say?",
        meta: { viewerIntent: "qa_locked" },
      },
    });

    expect(router.decide(ctx)).toBe("KNOWLEDGE");
    expect(routingBankProvider).toHaveBeenCalledWith("viewer_assistant_routing");
    expect(intentConfig.decide).not.toHaveBeenCalled();
  });

  test("maps viewer_assistant_routing path=general to GENERAL route", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = { decide: jest.fn<() => IntentDecisionOutput>() };
    const routingBankProvider = jest.fn((bankId: string) => {
      if (bankId !== "viewer_assistant_routing") return null;
      return {
        config: { enabled: true },
        rules: [
          {
            id: "viewer_mode_defaults_to_general",
            priority: 100,
            when: { "meta.viewerMode": true },
            then: { path: "general" },
          },
        ],
      };
    });

    const router = new TurnRouterService(
      routePolicy,
      intentConfig,
      (() => null) as any,
      routingBankProvider as any,
    );
    const ctx = makeCtx({
      viewerMode: true,
      messageText: "what does this paragraph say?",
    });

    expect(router.decide(ctx)).toBe("GENERAL");
    expect(intentConfig.decide).not.toHaveBeenCalled();
  });
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
  // 5. Default behavior is fail-closed when intentConfig throws in non-strict env
  // -------------------------------------------------------------------------
  test("throws when intentConfig is unavailable and fail-open flag is disabled", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = {
      decide: jest.fn(() => {
        throw new Error("intentConfig unavailable");
      }),
    };

    const router = new TurnRouterService(routePolicy, intentConfig);
    const ctx = makeCtx({ messageText: "what is the weather?" });

    expect(() => router.decide(ctx)).toThrow("intentConfig unavailable");
  });

  test("returns GENERAL as fallback when fail-open flag is enabled", () => {
    const prev = process.env.TURN_ROUTER_FAIL_OPEN;
    process.env.TURN_ROUTER_FAIL_OPEN = "true";
    try {
      const routePolicy = {
        isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
      };
      const intentConfig = {
        decide: jest.fn(() => {
          throw new Error("intentConfig unavailable");
        }),
      };

      const router = new TurnRouterService(routePolicy, intentConfig);
      const ctx = makeCtx({ messageText: "what is the weather?" });

      expect(router.decide(ctx)).toBe("GENERAL");
    } finally {
      if (typeof prev === "string") process.env.TURN_ROUTER_FAIL_OPEN = prev;
      else delete process.env.TURN_ROUTER_FAIL_OPEN;
    }
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

  test("maps alias intentFamily 'calc' to KNOWLEDGE route", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = {
      decide: jest
        .fn<() => IntentDecisionOutput>()
        .mockReturnValue(makeDecisionOutput("calc")),
    };
    const router = new TurnRouterService(routePolicy, intentConfig);

    expect(
      router.decide(
        makeCtx({
          attachedDocuments: [{ id: "doc-calc", mime: "application/pdf" }],
          messageText: "calculate EBITDA margin for Q4",
        }),
      ),
    ).toBe("KNOWLEDGE");
  });

  test("maps alias intentFamily 'navigation' to KNOWLEDGE route", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = {
      decide: jest
        .fn<() => IntentDecisionOutput>()
        .mockReturnValue(makeDecisionOutput("navigation")),
    };
    const router = new TurnRouterService(routePolicy, intentConfig);

    expect(router.decide(makeCtx({ messageText: "open budget report" }))).toBe(
      "KNOWLEDGE",
    );
  });

  test("maps alias intentFamily 'integrations' to CONNECTOR route", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = {
      decide: jest
        .fn<() => IntentDecisionOutput>()
        .mockReturnValue(makeDecisionOutput("integrations")),
    };
    const router = new TurnRouterService(routePolicy, intentConfig);

    expect(
      router.decide(makeCtx({ messageText: "connect my gmail integration" })),
    ).toBe("CONNECTOR");
  });

  test("maps clarification-required intent decision to CLARIFY route", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = {
      decide: jest.fn<() => IntentDecisionOutput>().mockReturnValue({
        ...makeDecisionOutput("documents"),
        requiresClarification: true,
        clarifyReason: "ambiguous_margin",
      }),
    };
    const router = new TurnRouterService(routePolicy, intentConfig);

    expect(router.decide(makeCtx({ messageText: "can you check it?" }))).toBe(
      "CLARIFY",
    );
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

  test("suppresses intent-pattern candidate using collision matrix signal rule", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    let capturedCandidates: Array<{ intentFamily?: string; operatorId?: string }> = [];
    const intentConfig = {
      decide: jest.fn((input: { candidates: Array<{ intentFamily?: string; operatorId?: string }> }) => {
        capturedCandidates = input.candidates;
        return makeDecisionOutput("help");
      }),
    };
    const routingBankProvider = (bankId: string) => {
      if (bankId === "intent_patterns") {
        return {
          config: { enabled: true, matching: { minConfidenceFallback: 0.5 } },
          operators: {
            compute: {
              intentFamily: "calc",
              priority: 90,
              minConfidence: 0.7,
              patterns: { en: ["\\bsummarize\\b"] },
            },
          },
        };
      }
      if (bankId === "operator_collision_matrix") {
        return {
          config: { enabled: true },
          rules: [
            {
              id: "CM_SIGNAL_ONLY",
              when: {
                operators: ["compute"],
                signals: ["summarize"],
              },
            },
          ],
        };
      }
      return null;
    };

    const router = new TurnRouterService(
      routePolicy,
      intentConfig as any,
      (() => null) as any,
      routingBankProvider as any,
    );
    const ctx = makeCtx({ messageText: "summarize this dataset" });

    expect(router.decide(ctx)).toBe("GENERAL");
    expect(intentConfig.decide).toHaveBeenCalled();
    const hasCalc = capturedCandidates.some(
      (candidate) => candidate.intentFamily === "calc",
    );
    expect(hasCalc).toBe(false);
  });

  test("emits navigation fallback candidate for navigation query", () => {
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
    const router = new TurnRouterService(
      routePolicy,
      intentConfig as any,
      (() => null) as any,
      (() => null) as any,
    );

    router.decide(makeCtx({ messageText: "open budget report" }));
    const hasNavigation = capturedCandidates.some(
      (candidate) => candidate.intentFamily === "navigation",
    );
    expect(hasNavigation).toBe(true);
  });

  test("emits calc/editing/integrations fallback candidates when query indicates those intents", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const capturedFamilies: string[][] = [];
    const intentConfig = {
      decide: jest.fn((input: { candidates: Array<{ intentFamily?: string }> }) => {
        capturedFamilies.push(
          input.candidates
            .map((candidate) => String(candidate.intentFamily || ""))
            .filter(Boolean),
        );
        return makeDecisionOutput("help");
      }),
    };
    const router = new TurnRouterService(
      routePolicy,
      intentConfig as any,
      (() => null) as any,
      (() => null) as any,
    );

    router.decide(makeCtx({ messageText: "calculate total revenue" }));
    router.decide(
      makeCtx({
        messageText: "edit paragraph 2",
        attachedDocuments: [{ id: "doc-1", mime: "application/pdf" }],
      }),
    );
    router.decide(makeCtx({ messageText: "sync gmail inbox now" }));

    expect(capturedFamilies[0]).toContain("calc");
    expect(capturedFamilies[1]).toContain("editing");
    expect(capturedFamilies[2]).toContain("integrations");
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
          signals?: {
            isFollowup?: boolean;
            followupConfidence?: number;
            followupSource?: string;
          };
        }) => {
          expect(input.signals?.isFollowup).toBe(true);
          expect((input.signals?.followupConfidence || 0) >= 0.65).toBe(true);
          expect(input.signals?.followupSource).toBe("followup_indicators");
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

  test("emits routing followup notes in intent decision metadata", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = {
      decide: jest.fn(() => makeDecisionOutput("documents")),
    };
    const router = new TurnRouterService(routePolicy, intentConfig as any);
    const out = router.decideWithIntent(
      makeCtx({
        messageText: "and also this one",
        request: {
          userId: "user-1",
          message: "and also this one",
          context: {
            signals: {
              isFollowup: true,
              followupConfidence: 0.9,
            },
          },
        },
      }),
    );

    expect(out.intentDecision?.decisionNotes).toContain(
      "routing:followup_source:context",
    );
    expect(out.intentDecision?.decisionNotes).toContain("routing:locale:en");
    expect(out.intentDecision?.decisionNotes).toContain(
      "routing:operator_choice:extract",
    );
    expect(out.intentDecision?.decisionNotes).toContain(
      "routing:scope_decision:corpus",
    );
    expect(out.intentDecision?.decisionNotes).toContain(
      "routing:disambiguation:none",
    );
  });

  test("emits structured followup degradation reason when overlay patterns are missing", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = {
      decide: jest.fn(() => makeDecisionOutput("documents")),
    };
    const router = new TurnRouterService(
      routePolicy,
      intentConfig as any,
      (() => null) as any,
      ((bankId: string) => {
        if (bankId === "followup_indicators") {
          return { config: { enabled: false }, rules: [] };
        }
        if (bankId === "intent_patterns") {
          return {
            config: { enabled: true, matching: {} },
            overlays: { followupIndicators: { en: [] } },
            operators: {},
          };
        }
        return null;
      }) as any,
    );

    const out = router.decideWithIntent(
      makeCtx({
        messageText: "and also this one",
      }),
    );

    expect(out.intentDecision?.decisionNotes).toContain(
      "routing:followup_source:none",
    );
    expect(out.intentDecision?.decisionNotes).toContain(
      "routing:followup_reason:followup_overlay_patterns_missing",
    );
    expect(out.intentDecision?.decisionNotes).toContain(
      "routing:followup_reason:followup_overlay_patterns_missing_en",
    );
  });

  test("fails closed in strict env when followup overlay patterns are missing", () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const routePolicy = {
        isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
      };
      const intentConfig = {
        decide: jest.fn(() => makeDecisionOutput("documents")),
      };
      const router = new TurnRouterService(
        routePolicy,
        intentConfig as any,
        (() => null) as any,
        ((bankId: string) => {
          if (bankId === "followup_indicators") {
            return { config: { enabled: false }, rules: [] };
          }
          if (bankId === "intent_patterns") {
            return {
              config: { enabled: true, matching: {} },
              overlays: { followupIndicators: { en: [] } },
              operators: {},
            };
          }
          return null;
        }) as any,
      );

      expect(() =>
        router.decideWithIntent(
          makeCtx({
            messageText: "and also this one",
          }),
        ),
      ).toThrow(/followup detection overlay missing/i);
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  });

  test("does not mark generic 'file' wording as explicit document reference", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = {
      decide: jest.fn(
        (input: { signals?: { hasExplicitDocRef?: boolean } }) => {
          expect(input.signals?.hasExplicitDocRef).toBe(false);
          return makeDecisionOutput("help");
        },
      ),
    };
    const router = new TurnRouterService(routePolicy, intentConfig as any);

    expect(
      router.decide(makeCtx({ messageText: "how to open file menu in excel?" })),
    ).toBe("GENERAL");
  });

  test("marks explicit filename mention as explicit document reference", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = {
      decide: jest.fn(
        (input: { signals?: { hasExplicitDocRef?: boolean } }) => {
          expect(input.signals?.hasExplicitDocRef).toBe(true);
          return makeDecisionOutput("documents");
        },
      ),
    };
    const router = new TurnRouterService(routePolicy, intentConfig as any);

    expect(
      router.decide(makeCtx({ messageText: "summarize quarterly_report.pdf" })),
    ).toBe("KNOWLEDGE");
  });

  test("does not classify generic capability question as discovery routing", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = {
      decide: jest.fn((input: any) => {
        expect(input.signals?.discoveryQuery).toBe(false);
        const hasDocumentsCandidate = (input.candidates || []).some(
          (candidate: { intentFamily?: string }) =>
            candidate.intentFamily === "documents",
        );
        expect(hasDocumentsCandidate).toBe(false);
        return makeDecisionOutput("help");
      }),
    };
    const router = new TurnRouterService(routePolicy, intentConfig as any);

    expect(
      router.decide(makeCtx({ messageText: "which integrations do you support?" })),
    ).toBe("GENERAL");
  });

  test("classifies document-locating question as discovery when document context exists", () => {
    const routePolicy = {
      isConnectorTurn: jest.fn<() => boolean>().mockReturnValue(false),
    };
    const intentConfig = {
      decide: jest.fn((input: any) => {
        expect(input.signals?.discoveryQuery).toBe(true);
        const docCandidate = (input.candidates || []).find(
          (candidate: { intentFamily?: string; operatorId?: string }) =>
            candidate.intentFamily === "documents",
        );
        expect(docCandidate?.operatorId).toBe("locate_docs");
        return makeDecisionOutput("documents");
      }),
    };
    const router = new TurnRouterService(routePolicy, intentConfig as any);

    expect(
      router.decide(
        makeCtx({
          messageText: "where in the document is clause 4?",
          attachedDocuments: [{ id: "doc-4", mime: "application/pdf" }],
        }),
      ),
    ).toBe("KNOWLEDGE");
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

  // -------------------------------------------------------------------------
  // P0-4: Connector permission default-deny in buildConnectorDecisionContext
  // -------------------------------------------------------------------------
  describe("P0-4: hasConnectorReadPermission default-deny", () => {
    test("hasConnectorReadPermission undefined → passes false to route policy", () => {
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
          connected: { gmail: true },
        },
        request: {
          userId: "user-1",
          message: "sync gmail",
          // signals present but hasConnectorReadPermission is undefined
          context: { signals: {} },
        },
      });

      router.decide(ctx);

      expect(routePolicy.resolveConnectorDecision).toHaveBeenCalledWith(
        "sync gmail",
        "en",
        expect.objectContaining({
          hasConnectorReadPermission: false,
        }),
      );
    });

    test("hasConnectorReadPermission true → passes true to route policy", () => {
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
          connected: { gmail: true },
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
          hasConnectorReadPermission: true,
        }),
      );
    });

    test("hasConnectorReadPermission false → passes false to route policy", () => {
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
          connected: { gmail: true },
        },
        request: {
          userId: "user-1",
          message: "sync gmail",
          context: { signals: { hasConnectorReadPermission: false } },
        },
      });

      router.decide(ctx);

      expect(routePolicy.resolveConnectorDecision).toHaveBeenCalledWith(
        "sync gmail",
        "en",
        expect.objectContaining({
          hasConnectorReadPermission: false,
        }),
      );
    });

    test("no signals object at all → passes false to route policy", () => {
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
          connected: { gmail: true },
        },
        request: {
          userId: "user-1",
          message: "sync gmail",
          // no context at all
        },
      });

      router.decide(ctx);

      expect(routePolicy.resolveConnectorDecision).toHaveBeenCalledWith(
        "sync gmail",
        "en",
        expect.objectContaining({
          hasConnectorReadPermission: false,
        }),
      );
    });
  });
});

