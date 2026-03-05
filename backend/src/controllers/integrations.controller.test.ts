import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../queues/connector.queue", () => ({
  addConnectorSyncJob: jest.fn(async () => ({ id: "job-mock-1" })),
}));

import { createIntegrationsController } from "./integrations.controller";
import { registerConnector } from "../services/connectors/connectorsRegistry";

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
    expect(html).toContain("\"sig\":");
  });
});
