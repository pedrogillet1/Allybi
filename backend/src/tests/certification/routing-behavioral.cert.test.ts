import { describe, expect, test } from "@jest/globals";
import { TurnRouterService } from "../../services/chat/turnRouter.service";
import type { TurnContext } from "../../services/chat/chat.types";

function makeCtx(messageText: string, overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    userId: "cert-user",
    messageText,
    locale: "en",
    now: new Date("2026-03-05T00:00:00.000Z"),
    attachedDocuments: [],
    connectors: { connected: {} },
    request: {
      userId: "cert-user",
      message: messageText,
      context: {},
    },
    ...overrides,
  };
}

describe("Certification: routing behavioral determinism", () => {
  test("generic capability query does not get forced into document discovery", () => {
    const router = new TurnRouterService({
      isConnectorTurn: () => false,
    });
    const out = router.decideWithIntent(
      makeCtx("which integrations do you support?"),
    );

    expect(out.route).toBe("GENERAL");
    expect(out.intentDecision?.intentFamily).toBe("help");
    expect(out.intentDecision?.operatorId).toBe("capabilities");
  });

  test("document-location query routes as document discovery with docs attached", () => {
    const router = new TurnRouterService({
      isConnectorTurn: () => false,
    });
    const out = router.decideWithIntent(
      makeCtx("where in the document is clause 4?", {
        attachedDocuments: [{ id: "doc-1", mime: "application/pdf" }],
      }),
    );

    expect(out.route).toBe("KNOWLEDGE");
    expect(out.intentDecision?.intentFamily).toBe("documents");
    expect(out.intentDecision?.operatorId).toBe("locate_docs");
  });

  test("same input stays deterministic over repeated runs", () => {
    const router = new TurnRouterService({
      isConnectorTurn: () => false,
    });
    const ctx = makeCtx("which integrations do you support?");
    const first = router.decideWithIntent(ctx);
    for (let i = 0; i < 24; i += 1) {
      const next = router.decideWithIntent(ctx);
      expect(next).toEqual(first);
    }
  });
});

