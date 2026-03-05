import { afterEach, describe, expect, test } from "@jest/globals";

import {
  buildIntegrationErrorRef,
  buildOAuthCompletionPayload,
  clientSafeIntegrationMessage,
  resolveAllowedFrontendOrigins,
  resolveOAuthPostMessageOrigin,
  verifyOAuthCompletionPayload,
} from "./integrationRuntimePolicy.service";

const ENV_KEYS = [
  "FRONTEND_URL",
  "FRONTEND_URLS",
  "CONNECTOR_OAUTH_CALLBACK_SECRET",
  "CONNECTOR_OAUTH_STATE_SECRET",
  "ENCRYPTION_KEY",
] as const;

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (typeof value === "string") {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
});

describe("integrationRuntimePolicy.service", () => {
  test("resolves frontend origins from FRONTEND_URL and FRONTEND_URLS", () => {
    process.env.FRONTEND_URL = "https://app.example.com/dashboard";
    process.env.FRONTEND_URLS =
      "https://staging.example.com, not-a-url, https://app.example.com";

    const origins = resolveAllowedFrontendOrigins();
    expect(origins).toEqual([
      "https://app.example.com",
      "https://staging.example.com",
    ]);
    expect(resolveOAuthPostMessageOrigin()).toBe("https://app.example.com");
  });

  test("builds signed oauth payload when callback secret is set", () => {
    process.env.CONNECTOR_OAUTH_CALLBACK_SECRET = "test-secret";
    const payload = buildOAuthCompletionPayload("gmail", true, 12345);
    expect(payload.type).toBe("koda_oauth_done");
    expect(payload.provider).toBe("gmail");
    expect(payload.ok).toBe(true);
    expect(payload.t).toBe(12345);
    expect(typeof payload.sig).toBe("string");
    expect(payload.sig).not.toBeNull();
  });

  test("verifies signed oauth payload with bounded timestamp freshness", () => {
    process.env.CONNECTOR_OAUTH_CALLBACK_SECRET = "test-secret";
    const now = 200_000;
    const payload = buildOAuthCompletionPayload("gmail", true, now);
    expect(verifyOAuthCompletionPayload(payload, now + 30_000)).toBe(true);
    expect(verifyOAuthCompletionPayload(payload, now + 6 * 60_000)).toBe(false);
  });

  test("fails closed when signature is missing, malformed, or secret absent", () => {
    process.env.CONNECTOR_OAUTH_CALLBACK_SECRET = "test-secret";
    const payload = buildOAuthCompletionPayload("outlook", false, 55_000);
    expect(verifyOAuthCompletionPayload({ ...payload, sig: null }, 55_500)).toBe(
      false,
    );
    expect(
      verifyOAuthCompletionPayload({ ...payload, sig: "invalid-signature" }, 55_500),
    ).toBe(false);

    delete process.env.CONNECTOR_OAUTH_CALLBACK_SECRET;
    delete process.env.CONNECTOR_OAUTH_STATE_SECRET;
    delete process.env.ENCRYPTION_KEY;
    expect(verifyOAuthCompletionPayload(payload, 55_500)).toBe(false);
  });

  test("returns fallback for server errors and keeps detail for client errors", () => {
    expect(
      clientSafeIntegrationMessage(500, "Failed to fetch connector."),
    ).toBe("Failed to fetch connector.");
    expect(
      clientSafeIntegrationMessage(400, "Failed to fetch connector.", "Bad request."),
    ).toBe("Bad request.");
  });

  test("generates deterministic hash references", () => {
    const a = buildIntegrationErrorRef("seed-1");
    const b = buildIntegrationErrorRef("seed-1");
    const c = buildIntegrationErrorRef("seed-2");
    expect(a).toHaveLength(12);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
