import { describe, expect, jest, test } from "@jest/globals";

import type { ChatRequest, ChatResult, TurnContext } from "../chat.types";
import { ConnectorTurnHandler } from "./connectorTurn.handler";

function makeBaseResult(): ChatResult {
  return {
    conversationId: "conv-1",
    userMessageId: "msg-user-1",
    assistantMessageId: "msg-assistant-1",
    assistantText: "fallback",
  };
}

function makeRequest(overrides?: Partial<ChatRequest>): ChatRequest {
  return {
    userId: "user-1",
    message: "what is my latest email",
    preferredLanguage: "en",
    connectorContext: {
      activeProvider: "gmail",
      gmail: { connected: true, canSend: true },
      outlook: { connected: false, canSend: false },
      slack: { connected: false, canSend: false },
    },
    meta: { operator: "EMAIL_LATEST", requestId: "req-1" },
    ...overrides,
  };
}

function makeCtx(req: ChatRequest): TurnContext {
  return {
    userId: req.userId,
    conversationId: req.conversationId,
    messageText: req.message,
    locale: "en",
    now: new Date(),
    attachedDocuments: [],
    connectors: {
      activeConnector: (req.connectorContext?.activeProvider as any) || null,
      connected: {
        gmail: Boolean(req.connectorContext?.gmail?.connected),
        outlook: Boolean(req.connectorContext?.outlook?.connected),
        slack: Boolean(req.connectorContext?.slack?.connected),
      },
    },
    request: req,
  } as TurnContext;
}

describe("ConnectorTurnHandler", () => {
  test("uses stream execution path when stream params are present", async () => {
    const executor = {
      chat: jest.fn(async () => makeBaseResult()),
      streamChat: jest.fn(async () => makeBaseResult()),
    };

    const handler = new ConnectorTurnHandler(executor as any, {
      connectorHandler: {
        execute: jest.fn(async () => ({
          ok: true,
          action: "status",
          provider: "gmail",
          data: { connected: true, indexedDocuments: 2 },
        })),
      } as any,
      tokenVault: { getValidAccessToken: jest.fn(async () => "tok") } as any,
      gmailOAuth: { refreshAccessToken: jest.fn(async () => ({ accessToken: "tok" })) } as any,
      outlookOAuth: { refreshAccessToken: jest.fn(async () => ({ accessToken: "tok" })) } as any,
      slackOAuth: { refreshAccessToken: jest.fn(async () => ({ accessToken: "tok" })) } as any,
      gmailClient: {
        listMessages: jest.fn(async () => ({ messages: [] })),
        getMessage: jest.fn(),
      } as any,
      graphClient: {
        listMessages: jest.fn(async () => ({ value: [] })),
        getMessageText: jest.fn(() => ""),
      } as any,
      slackClient: {
        listConversations: jest.fn(async () => ({ channels: [] })),
        getConversationHistory: jest.fn(async () => ({ messages: [] })),
        extractMessageText: jest.fn(() => ""),
      } as any,
    });

    await handler.handle({
      ctx: makeCtx(
        makeRequest({
          meta: { operator: "CONNECTOR_STATUS" },
          message: "show connectors",
        }),
      ),
      sink: { isOpen: () => true } as any,
      streamingConfig: {} as any,
    });

    expect(executor.streamChat).toHaveBeenCalledTimes(1);
    expect(executor.chat).not.toHaveBeenCalled();
  });

  test("returns connector email attachment for EMAIL_LATEST", async () => {
    const executor = {
      chat: jest.fn(async () => makeBaseResult()),
      streamChat: jest.fn(async () => makeBaseResult()),
    };

    const connectorExecute = jest.fn(async () => ({
      ok: true,
      action: "status",
      provider: "gmail",
      data: { connected: true, indexedDocuments: 7 },
    }));

    const handler = new ConnectorTurnHandler(executor as any, {
      connectorHandler: { execute: connectorExecute } as any,
      tokenVault: { getValidAccessToken: jest.fn(async () => "tok") } as any,
      gmailOAuth: { refreshAccessToken: jest.fn(async () => ({ accessToken: "tok" })) } as any,
      outlookOAuth: { refreshAccessToken: jest.fn(async () => ({ accessToken: "tok" })) } as any,
      slackOAuth: { refreshAccessToken: jest.fn(async () => ({ accessToken: "tok" })) } as any,
      gmailClient: {
        listMessages: jest.fn(async () => ({ messages: [{ id: "gmail-msg-1" }] })),
        getMessage: jest.fn(async () => ({
          payload: {
            headers: [
              { name: "Subject", value: "Quarterly update" },
              { name: "From", value: "ops@example.com" },
              { name: "To", value: "me@example.com" },
              { name: "Date", value: "2026-02-27T12:00:00.000Z" },
            ],
          },
          snippet: "Revenue is up 14 percent.",
        })),
      } as any,
      graphClient: {
        listMessages: jest.fn(async () => ({ value: [] })),
        getMessageText: jest.fn(() => ""),
      } as any,
      slackClient: {
        listConversations: jest.fn(async () => ({ channels: [] })),
        getConversationHistory: jest.fn(async () => ({ messages: [] })),
        extractMessageText: jest.fn(() => ""),
      } as any,
    });

    const result = await handler.handle({ ctx: makeCtx(makeRequest()) });

    expect(result.answerMode).toBe("action_receipt");
    const attachments = Array.isArray(result.attachmentsPayload)
      ? result.attachmentsPayload
      : [];
    expect(attachments).toHaveLength(1);
    expect((attachments[0] as any).type).toBe("connector_email_ref");
    expect((attachments[0] as any).messageId).toBe("gmail-msg-1");
    expect(result.assistantText).toContain("Latest email in Gmail");
  });

  test("returns email draft card attachments for EMAIL_SEND without confirmation token", async () => {
    const executor = {
      chat: jest.fn(async () => makeBaseResult()),
      streamChat: jest.fn(async () => makeBaseResult()),
    };

    const handler = new ConnectorTurnHandler(executor as any, {
      connectorHandler: {
        execute: jest.fn(async () => ({
          ok: true,
          action: "status",
          provider: "gmail",
          data: { connected: true, indexedDocuments: 0 },
        })),
      } as any,
      tokenVault: { getValidAccessToken: jest.fn(async () => "tok") } as any,
      gmailOAuth: { refreshAccessToken: jest.fn(async () => ({ accessToken: "tok" })) } as any,
      outlookOAuth: { refreshAccessToken: jest.fn(async () => ({ accessToken: "tok" })) } as any,
      slackOAuth: { refreshAccessToken: jest.fn(async () => ({ accessToken: "tok" })) } as any,
      gmailClient: {
        listMessages: jest.fn(async () => ({ messages: [] })),
        getMessage: jest.fn(),
      } as any,
      graphClient: {
        listMessages: jest.fn(async () => ({ value: [] })),
        getMessageText: jest.fn(() => ""),
      } as any,
      slackClient: {
        listConversations: jest.fn(async () => ({ channels: [] })),
        getConversationHistory: jest.fn(async () => ({ messages: [] })),
        extractMessageText: jest.fn(() => ""),
      } as any,
    });

    const result = await handler.handle({
      ctx: makeCtx(
        makeRequest({
          message: "send an email to pedrogillet@icloud.com asking how was his day",
          meta: { operator: "EMAIL_SEND", requestId: "req-2" },
          confirmationToken: undefined,
        }),
      ),
    });

    expect(result.answerMode).toBe("action_confirmation");
    const attachments = Array.isArray(result.attachmentsPayload)
      ? result.attachmentsPayload
      : [];
    const kinds = attachments.map((a: any) => a?.type);
    expect(kinds).toContain("action_confirmation");
    expect(kinds).toContain("email_draft_snapshot");
    const draft = attachments.find(
      (a: any) => a?.type === "email_draft_snapshot",
    ) as any;
    expect(draft?.to).toBe("pedrogillet@icloud.com");
    expect(draft?.subject).toBe("How is your day?");
    expect(draft?.body).toBe("How is your day?");
  });

  test("extracts multiple recipients for EMAIL_SEND draft snapshots", async () => {
    const executor = {
      chat: jest.fn(async () => makeBaseResult()),
      streamChat: jest.fn(async () => makeBaseResult()),
    };

    const handler = new ConnectorTurnHandler(executor as any, {
      connectorHandler: {
        execute: jest.fn(async () => ({
          ok: true,
          action: "status",
          provider: "gmail",
          data: { connected: true, indexedDocuments: 0 },
        })),
      } as any,
      tokenVault: { getValidAccessToken: jest.fn(async () => "tok") } as any,
      gmailOAuth: { refreshAccessToken: jest.fn(async () => ({ accessToken: "tok" })) } as any,
      outlookOAuth: { refreshAccessToken: jest.fn(async () => ({ accessToken: "tok" })) } as any,
      slackOAuth: { refreshAccessToken: jest.fn(async () => ({ accessToken: "tok" })) } as any,
      gmailClient: {
        listMessages: jest.fn(async () => ({ messages: [] })),
        getMessage: jest.fn(),
      } as any,
      graphClient: {
        listMessages: jest.fn(async () => ({ value: [] })),
        getMessageText: jest.fn(() => ""),
      } as any,
      slackClient: {
        listConversations: jest.fn(async () => ({ channels: [] })),
        getConversationHistory: jest.fn(async () => ({ messages: [] })),
        extractMessageText: jest.fn(() => ""),
      } as any,
    });

    const result = await handler.handle({
      ctx: makeCtx(
        makeRequest({
          message:
            "send an email to alice@example.com and bob@example.com asking for a quick status update",
          meta: { operator: "EMAIL_SEND", requestId: "req-3" },
          confirmationToken: undefined,
        }),
      ),
    });

    const attachments = Array.isArray(result.attachmentsPayload)
      ? result.attachmentsPayload
      : [];
    const draft = attachments.find(
      (a: any) => a?.type === "email_draft_snapshot",
    ) as any;
    expect(draft?.to).toBe("alice@example.com, bob@example.com");
    expect(draft?.subject).toBe("Quick status update");
  });

  test("maps connector search hits to actionable email cards with messageId", async () => {
    const executor = {
      chat: jest.fn(async () => makeBaseResult()),
      streamChat: jest.fn(async () => makeBaseResult()),
    };

    const execute = jest.fn(async (input: any) => {
      if (String(input?.action) === "search") {
        return {
          ok: true,
          action: "search",
          provider: "gmail",
          hits: [
            {
              documentId: "gmail:msg-123",
              providerMessageId: "msg-123",
              title: "Invoice April",
              snippet: "Please review attached invoice.",
              source: "gmail",
            },
          ],
          data: { count: 1, source: "provider_live" },
        };
      }
      return {
        ok: true,
        action: String(input?.action || "status"),
        provider: "gmail",
        data: { connected: true, indexedDocuments: 0 },
      };
    });

    const handler = new ConnectorTurnHandler(executor as any, {
      connectorHandler: { execute } as any,
      tokenVault: { getValidAccessToken: jest.fn(async () => "tok") } as any,
      gmailOAuth: { refreshAccessToken: jest.fn(async () => ({ accessToken: "tok" })) } as any,
      outlookOAuth: { refreshAccessToken: jest.fn(async () => ({ accessToken: "tok" })) } as any,
      slackOAuth: { refreshAccessToken: jest.fn(async () => ({ accessToken: "tok" })) } as any,
      gmailClient: {
        listMessages: jest.fn(async () => ({ messages: [] })),
        getMessage: jest.fn(),
      } as any,
      graphClient: {
        listMessages: jest.fn(async () => ({ value: [] })),
        getMessageText: jest.fn(() => ""),
      } as any,
      slackClient: {
        listConversations: jest.fn(async () => ({ channels: [] })),
        getConversationHistory: jest.fn(async () => ({ messages: [] })),
        extractMessageText: jest.fn(() => ""),
      } as any,
    });

    const result = await handler.handle({
      ctx: makeCtx(
        makeRequest({
          message: "search gmail invoice",
          meta: { operator: "CONNECTOR_SEARCH", requestId: "req-search-1" },
        }),
      ),
    });

    const attachments = Array.isArray(result.attachmentsPayload)
      ? result.attachmentsPayload
      : [];
    expect(attachments).toHaveLength(1);
    expect((attachments[0] as any).type).toBe("connector_email_ref");
    expect((attachments[0] as any).messageId).toBe("msg-123");
    expect((attachments[0] as any).actionLabel).toBe("Open");
  });

  test("fails fast when email connector status check times out", async () => {
    const previousTimeout = process.env.CONNECTOR_CHAT_OP_TIMEOUT_MS;
    process.env.CONNECTOR_CHAT_OP_TIMEOUT_MS = "5";

    try {
      const executor = {
        chat: jest.fn(async () => makeBaseResult()),
        streamChat: jest.fn(async () => makeBaseResult()),
      };

      const handler = new ConnectorTurnHandler(executor as any, {
        connectorHandler: {
          execute: jest.fn(async (input: any) => {
            if (String(input?.action) === "status") {
              return await new Promise<never>(() => {
                // Never resolves: verifies timeout guard in ConnectorTurnHandler.
              });
            }
            return {
              ok: true,
              action: String(input?.action || "status"),
              provider: "gmail",
              data: { connected: true, indexedDocuments: 0 },
            };
          }),
        } as any,
        tokenVault: { getValidAccessToken: jest.fn(async () => "tok") } as any,
        gmailOAuth: {
          refreshAccessToken: jest.fn(async () => ({ accessToken: "tok" })),
        } as any,
        outlookOAuth: {
          refreshAccessToken: jest.fn(async () => ({ accessToken: "tok" })),
        } as any,
        slackOAuth: {
          refreshAccessToken: jest.fn(async () => ({ accessToken: "tok" })),
        } as any,
        gmailClient: {
          listMessages: jest.fn(async () => ({ messages: [] })),
          getMessage: jest.fn(),
        } as any,
        graphClient: {
          listMessages: jest.fn(async () => ({ value: [] })),
          getMessageText: jest.fn(() => ""),
        } as any,
        slackClient: {
          listConversations: jest.fn(async () => ({ channels: [] })),
          getConversationHistory: jest.fn(async () => ({ messages: [] })),
          extractMessageText: jest.fn(() => ""),
        } as any,
      });

      const result = await handler.handle({ ctx: makeCtx(makeRequest()) });
      expect(result.status).toBe("failed");
      expect(result.failureCode).toBe("CONNECTOR_ACCESS_FAILED");
      expect(String(result.assistantText)).toContain("access Gmail");
    } finally {
      if (previousTimeout === undefined) {
        delete process.env.CONNECTOR_CHAT_OP_TIMEOUT_MS;
      } else {
        process.env.CONNECTOR_CHAT_OP_TIMEOUT_MS = previousTimeout;
      }
    }
  });
});
