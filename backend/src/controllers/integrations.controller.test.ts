import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../queues/connector.queue", () => ({
  addConnectorSyncJob: jest.fn(async () => ({ id: "job-mock-1" })),
}));

const consumeOAuthCompletionPayloadOnce = jest.fn(async () => true);
jest.mock("../services/connectors/oauthCompletionReplayGuard.service", () => ({
  consumeOAuthCompletionPayloadOnce: (...args: any[]) =>
    consumeOAuthCompletionPayloadOnce(...args),
}));

import { createIntegrationsController } from "./integrations.controller";
import { registerConnector } from "../services/connectors/connectorsRegistry";
import { signEmailSendConfirmationToken } from "../services/connectors/emailSendConfirmation.service";
import { resetEmailSendReplayCacheForTests } from "../services/connectors/emailSendReplayGuard.service";

function makeJsonRes() {
  const state: { body?: any; status?: number } = {};
  const res: any = {
    status: jest.fn().mockImplementation((code: number) => {
      state.status = code;
      return res;
    }),
    json: jest.fn().mockImplementation((body: any) => {
      state.body = body;
      return res;
    }),
    setHeader: jest.fn(),
    removeHeader: jest.fn(),
    type: jest.fn().mockReturnThis(),
    send: jest.fn().mockImplementation((body: any) => {
      state.body = body;
      return res;
    }),
  };
  return { res, state };
}

describe("IntegrationsController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetEmailSendReplayCacheForTests();
    consumeOAuthCompletionPayloadOnce.mockReset();
    consumeOAuthCompletionPayloadOnce.mockResolvedValue(true);
  });

  test("sync sanitizes thrown runtime errors and returns a correlation ref", async () => {
    const handler = {
      execute: jest.fn(async () => {
        throw new Error("provider token mismatch at vault layer");
      }),
    };
    const controller = createIntegrationsController(handler as any);
    const { res, state } = makeJsonRes();
    const req: any = {
      params: { provider: "gmail" },
      user: { id: "user-1" },
      headers: { "x-correlation-id": "corr-sync-1" },
      body: {},
    };

    await controller.sync(req, res);

    expect(state.status).toBe(500);
    expect(state.body?.ok).toBe(false);
    expect(state.body?.error?.code).toBe("SYNC_FAILED");
    expect(state.body?.error?.message).toBe("Failed to schedule sync.");
    expect(String(state.body?.error?.message || "")).not.toContain("vault");
    expect(typeof state.body?.error?.details?.ref).toBe("string");
  });

  test("oauth callback html uses allowlisted postMessage origin and no wildcard", async () => {
    process.env.FRONTEND_URL = "https://app.example.com";
    process.env.CONNECTOR_OAUTH_CALLBACK_SECRET = "oauth-callback-test-secret";

    registerConnector("gmail", {
      capabilities: { oauth: true, sync: true, search: true },
      oauthService: {
        handleCallback: async () => ({ connected: true }),
      },
    });

    const controller = createIntegrationsController({
      execute: jest.fn(),
    } as any);
    const { res, state } = makeJsonRes();
    const req: any = {
      params: { provider: "gmail" },
      query: { code: "code-1", state: "state-1" },
      headers: { accept: "text/html" },
      body: {},
    };

    await controller.oauthCallback(req, res);

    expect(state.status).toBe(200);
    const html = String(state.body || "");
    expect(html).toContain("var targetOrigin = 'https://app.example.com';");
    expect(html).toContain("window.opener.postMessage(completion, targetOrigin);");
    expect(html).not.toContain(", '*')");
    expect(html).not.toContain("koda_oauth_complete");
    expect(html).not.toContain("localStorage.setItem(");
    expect(html).toContain("\"sig\":");
    expect(html).toContain("\"n\":");
  });

  test("oauth verify endpoint validates signed completion payload", async () => {
    process.env.CONNECTOR_OAUTH_CALLBACK_SECRET = "oauth-callback-test-secret";
    const controller = createIntegrationsController({
      execute: jest.fn(),
    } as any);
    const { res, state } = makeJsonRes();
    const validPayload = {
      type: "koda_oauth_done",
      provider: "gmail",
      ok: true,
      t: 1000,
      n: "nonce-stub",
      sig: "stub",
    };
    // Generate a real payload via callback HTML so signature generation stays aligned.
    registerConnector("gmail", {
      capabilities: { oauth: true, sync: true, search: true },
      oauthService: {
        handleCallback: async () => ({ connected: true }),
      },
    });
    const { res: htmlRes, state: htmlState } = makeJsonRes();
    await controller.oauthCallback(
      {
        params: { provider: "gmail" },
        query: { code: "code-1", state: "state-1" },
        headers: { accept: "text/html" },
        body: {},
      } as any,
      htmlRes as any,
    );
    const html = String(htmlState.body || "");
    const match = html.match(/var completion = (\{[\s\S]*?\});/);
    expect(match).toBeTruthy();
    const completion = JSON.parse(String(match?.[1] || JSON.stringify(validPayload)));

    await controller.oauthVerify(
      { body: completion, user: { id: "user-1" }, headers: {} } as any,
      res as any,
    );
    expect(state.status).toBe(200);
    expect(state.body?.ok).toBe(true);
    expect(state.body?.data?.valid).toBe(true);
    expect(consumeOAuthCompletionPayloadOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        provider: "gmail",
      }),
    );

    consumeOAuthCompletionPayloadOnce.mockResolvedValueOnce(false);
    const secondReplayRes = makeJsonRes();
    await controller.oauthVerify(
      { body: completion, user: { id: "user-1" }, headers: {} } as any,
      secondReplayRes.res as any,
    );
    expect(secondReplayRes.state.body?.data?.valid).toBe(false);
  });

  test("oauth verify rejects malformed payload without consuming replay token", async () => {
    process.env.CONNECTOR_OAUTH_CALLBACK_SECRET = "oauth-callback-test-secret";
    const controller = createIntegrationsController({
      execute: jest.fn(),
    } as any);
    const { res, state } = makeJsonRes();

    await controller.oauthVerify(
      {
        body: { type: "koda_oauth_done", provider: "gmail", ok: true },
        user: { id: "user-1" },
        headers: {},
      } as any,
      res as any,
    );

    expect(state.status).toBe(200);
    expect(state.body?.ok).toBe(true);
    expect(state.body?.data?.valid).toBe(false);
    expect(consumeOAuthCompletionPayloadOnce).not.toHaveBeenCalled();
  });

  test("oauth verify requires authenticated user context", async () => {
    process.env.CONNECTOR_OAUTH_CALLBACK_SECRET = "oauth-callback-test-secret";
    const controller = createIntegrationsController({
      execute: jest.fn(),
    } as any);
    const { res, state } = makeJsonRes();

    await controller.oauthVerify(
      { body: { type: "koda_oauth_done" }, headers: {} } as any,
      res as any,
    );

    expect(state.status).toBe(401);
    expect(state.body?.error?.code).toBe("AUTH_UNAUTHORIZED");
  });

  test("send returns normalized receipt payload", async () => {
    process.env.CONNECTOR_ACTION_SECRET = "test-action-secret";
    const now = Date.now();
    const confirmationId = signEmailSendConfirmationToken({
      v: 2,
      t: "email_send",
      userId: "user-1",
      provider: "gmail",
      to: "person@example.com",
      subject: "Subject",
      body: "Body",
      attachmentDocumentIds: ["doc-1"],
      iat: now,
      exp: now + 5 * 60 * 1000,
    });

    const handler = {
      execute: jest.fn(async () => ({
        ok: true,
        action: "send",
        provider: "gmail",
        data: {
          sent: true,
          receipt: {
            provider: "gmail",
            providerMessageId: "gmail-msg-1",
            providerThreadId: "thread-1",
            acceptedAt: new Date().toISOString(),
            to: "person@example.com",
            subject: "Subject",
            attachmentCount: 1,
          },
        },
      })),
    };

    const controller = createIntegrationsController(handler as any);
    const { res, state } = makeJsonRes();
    const req: any = {
      params: { provider: "gmail" },
      user: { id: "user-1" },
      headers: {},
      body: { confirmationId },
    };

    await controller.send(req, res);

    expect(state.status).toBe(200);
    expect(state.body?.ok).toBe(true);
    expect(state.body?.data).toEqual(
      expect.objectContaining({
        provider: "gmail",
        sent: true,
        receipt: expect.objectContaining({
          provider: "gmail",
          providerMessageId: "gmail-msg-1",
          to: "person@example.com",
          attachmentCount: 1,
        }),
      }),
    );
  });

  test("status surfaces ingestionEnabled from handler status payload", async () => {
    registerConnector("gmail", {
      capabilities: { oauth: true, sync: true, search: true },
      oauthService: {},
    });

    const handler = {
      execute: jest.fn(async ({ provider, action }: { provider: string; action: string }) => ({
        ok: true,
        action,
        provider,
        data: {
          connected: true,
          ingestionEnabled: true,
          indexedDocuments: 3,
          providerAccountId: "acct-1",
        },
      })),
    };
    const controller = createIntegrationsController(handler as any);
    const { res, state } = makeJsonRes();
    const req: any = {
      user: { id: "user-1" },
      headers: {},
      body: {},
    };

    await controller.status(req, res);

    expect(state.status).toBe(200);
    const providers = state.body?.data?.providers || [];
    const gmail = providers.find((p: any) => p.provider === "gmail");
    expect(gmail?.status?.ingestionEnabled).toBe(true);
    expect(gmail?.status?.indexedDocuments).toBe(3);
  });

  test("send rejects replayed confirmation token", async () => {
    process.env.CONNECTOR_ACTION_SECRET = "test-action-secret";
    const now = Date.now();
    const confirmationId = signEmailSendConfirmationToken({
      v: 2,
      t: "email_send",
      userId: "user-1",
      provider: "gmail",
      to: "person@example.com",
      subject: "Subject",
      body: "Body",
      attachmentDocumentIds: [],
      iat: now,
      exp: now + 5 * 60 * 1000,
    });

    const handler = {
      execute: jest.fn(async () => ({
        ok: true,
        action: "send",
        provider: "gmail",
        data: { sent: true, receipt: {} },
      })),
    };

    const controller = createIntegrationsController(handler as any);
    const first = makeJsonRes();
    const second = makeJsonRes();
    const req: any = {
      params: { provider: "gmail" },
      user: { id: "user-1" },
      headers: {},
      body: { confirmationId },
    };

    await controller.send(req, first.res);
    await controller.send(req, second.res);

    expect(first.state.status).toBe(200);
    expect(second.state.status).toBe(409);
    expect(second.state.body?.error?.code).toBe("CONFIRMATION_ALREADY_USED");
    expect(handler.execute).toHaveBeenCalledTimes(1);
  });
});
