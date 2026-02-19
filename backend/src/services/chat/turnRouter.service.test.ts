import { beforeEach, describe, expect, test } from "@jest/globals";
import { TurnRouterService } from "./turnRouter.service";
import type { TurnContext } from "./chat.types";

const mockGetOptionalBank = jest.fn();

jest.mock("../core/banks/bankLoader.service", () => ({
  getOptionalBank: (bankId: string) => mockGetOptionalBank(bankId),
}));

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
  beforeEach(() => {
    mockGetOptionalBank.mockImplementation((bankId: string) => {
      const routingBank = {
        config: {
          enabled: true,
          matching: {
            caseSensitive: false,
            stripDiacriticsForMatching: true,
            collapseWhitespace: true,
          },
        },
        rules: [
          {
            when: {
              any: [
                {
                  type: "regex",
                  locale: "en",
                  patterns: [
                    "\\b(send|draft|compose|write)\\b.{0,12}\\b(email|message)\\b",
                  ],
                },
              ],
            },
          },
        ],
      };
      if (bankId === "email_routing") return routingBank;
      if (bankId === "connectors_routing") return routingBank;
      return null;
    });
  });

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

  test("does not force editor route from edit keywords outside viewer mode", () => {
    const router = new TurnRouterService();
    const ctx = baseContext({
      messageText: "make the heading blue",
      attachedDocuments: [
        {
          id: "d1",
          mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      ],
    });

    expect(router.decide(ctx)).toBe("KNOWLEDGE");
  });
});
