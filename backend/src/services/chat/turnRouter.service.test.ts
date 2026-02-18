import { describe, expect, test } from "@jest/globals";
import { TurnRouterService } from "./turnRouter.service";
import type { TurnContext } from "./chat.types";

function baseContext(overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    userId: "u1",
    conversationId: "c1",
    messageText: "hello",
    locale: "en",
    now: new Date(),
    attachedDocuments: [],
    connectors: { activeConnector: null, connected: {} },
    request: {
      userId: "u1",
      conversationId: "c1",
      message: "hello",
    },
    ...overrides,
  };
}

describe("TurnRouterService", () => {
  test("forces editor route in viewer mode by default", () => {
    const router = new TurnRouterService();
    const ctx = baseContext({
      messageText: "make this red",
      viewer: {
        mode: "editor",
        documentId: "d1",
        fileType: "docx",
        selection: { isFrozen: false, ranges: [{ paragraphId: "p1" }] },
      },
    });

    expect(router.decide(ctx)).toBe("EDITOR");
  });

  test("allows connector route in viewer mode when explicit connector intent exists", () => {
    const router = new TurnRouterService();
    const ctx = baseContext({
      messageText: "send email to pedro",
      viewer: {
        mode: "editor",
        documentId: "d1",
        fileType: "docx",
        selection: { isFrozen: false, ranges: [{ paragraphId: "p1" }] },
      },
    });

    expect(router.decide(ctx)).toBe("CONNECTOR");
  });

  test("routes to knowledge when there are attachments and no explicit edit", () => {
    const router = new TurnRouterService();
    const ctx = baseContext({
      messageText: "what does this file cover",
      attachedDocuments: [{ id: "d1", mime: "application/pdf" }],
    });

    expect(router.decide(ctx)).toBe("KNOWLEDGE");
  });
});
