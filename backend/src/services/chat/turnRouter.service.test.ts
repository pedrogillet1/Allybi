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
});
