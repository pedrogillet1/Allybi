import { afterEach, describe, expect, test } from "@jest/globals";

import { GmailOAuthError, GmailOAuthService } from "./gmailOAuth.service";

const ENV_KEYS = [
  "GOOGLE_GMAIL_CLIENT_ID",
  "GOOGLE_GMAIL_CLIENT_SECRET",
  "GOOGLE_GMAIL_CALLBACK_URL",
  "GOOGLE_GMAIL_CALLBACK_URLS",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALLBACK_URL",
  "CONNECTOR_GMAIL_STRICT_OAUTH_CONFIG",
  "CONNECTOR_GMAIL_ALLOW_GOOGLE_AUTH_FALLBACK",
  "KODA_MASTER_KEY_BASE64",
  "ENCRYPTION_KEY",
] as const;

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (typeof value === "string") process.env[key] = value;
    else delete process.env[key];
  }
});

describe("gmailOAuth.service config isolation", () => {
  test("rejects generic Google OAuth fallback in strict mode", () => {
    process.env.CONNECTOR_GMAIL_STRICT_OAUTH_CONFIG = "true";
    process.env.CONNECTOR_GMAIL_ALLOW_GOOGLE_AUTH_FALLBACK = "false";
    process.env.GOOGLE_CLIENT_ID = "legacy-google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "legacy-google-client-secret";
    process.env.GOOGLE_CALLBACK_URL =
      "https://app.example.com/api/integrations/gmail/callback";
    process.env.GOOGLE_GMAIL_CALLBACK_URLS =
      "https://app.example.com/api/integrations/gmail/callback";
    process.env.ENCRYPTION_KEY = "test-encryption-key";
    delete process.env.GOOGLE_GMAIL_CLIENT_ID;
    delete process.env.GOOGLE_GMAIL_CLIENT_SECRET;
    delete process.env.GOOGLE_GMAIL_CALLBACK_URL;

    const service = new GmailOAuthService();
    expect(() =>
      service.createAuthUrl({
        userId: "user-1",
      }),
    ).toThrow(GmailOAuthError);
    expect(() =>
      service.createAuthUrl({
        userId: "user-1",
      }),
    ).toThrow(/Generic GOOGLE_CLIENT_\* fallback is disabled in strict mode/i);
  });

  test("allows explicit legacy fallback when strict mode is disabled", () => {
    process.env.CONNECTOR_GMAIL_STRICT_OAUTH_CONFIG = "false";
    process.env.CONNECTOR_GMAIL_ALLOW_GOOGLE_AUTH_FALLBACK = "true";
    process.env.GOOGLE_CLIENT_ID = "legacy-google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "legacy-google-client-secret";
    process.env.GOOGLE_CALLBACK_URL =
      "https://app.example.com/api/integrations/gmail/callback";
    process.env.GOOGLE_GMAIL_CALLBACK_URLS =
      "https://app.example.com/api/integrations/gmail/callback";
    process.env.ENCRYPTION_KEY = "test-encryption-key";
    delete process.env.GOOGLE_GMAIL_CLIENT_ID;
    delete process.env.GOOGLE_GMAIL_CLIENT_SECRET;
    delete process.env.GOOGLE_GMAIL_CALLBACK_URL;

    const service = new GmailOAuthService();
    const result = service.createAuthUrl({
      userId: "user-1",
    });
    expect(result.url).toContain("client_id=legacy-google-client-id");
    expect(result.url).toContain(
      encodeURIComponent("https://app.example.com/api/integrations/gmail/callback"),
    );
  });

  test("accepts dedicated Gmail OAuth config in strict mode", () => {
    process.env.CONNECTOR_GMAIL_STRICT_OAUTH_CONFIG = "true";
    process.env.CONNECTOR_GMAIL_ALLOW_GOOGLE_AUTH_FALLBACK = "false";
    process.env.GOOGLE_GMAIL_CLIENT_ID = "gmail-client-id";
    process.env.GOOGLE_GMAIL_CLIENT_SECRET = "gmail-client-secret";
    process.env.GOOGLE_GMAIL_CALLBACK_URL =
      "https://app.example.com/api/integrations/gmail/callback";
    process.env.ENCRYPTION_KEY = "test-encryption-key";
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CALLBACK_URL;

    const service = new GmailOAuthService();
    const result = service.createAuthUrl({
      userId: "user-1",
    });
    expect(result.url).toContain("client_id=gmail-client-id");
    expect(result.url).toContain(
      encodeURIComponent("https://app.example.com/api/integrations/gmail/callback"),
    );
  });

  test("rejects account-login callback path for Gmail connector OAuth", () => {
    process.env.CONNECTOR_GMAIL_STRICT_OAUTH_CONFIG = "true";
    process.env.GOOGLE_GMAIL_CLIENT_ID = "gmail-client-id";
    process.env.GOOGLE_GMAIL_CLIENT_SECRET = "gmail-client-secret";
    process.env.GOOGLE_GMAIL_CALLBACK_URL =
      "https://app.example.com/api/auth/google/callback";
    process.env.GOOGLE_GMAIL_CALLBACK_URLS =
      "https://app.example.com/api/integrations/gmail/callback";
    process.env.ENCRYPTION_KEY = "test-encryption-key";

    const service = new GmailOAuthService();
    expect(() =>
      service.createAuthUrl({
        userId: "user-1",
      }),
    ).toThrow(GmailOAuthError);
    expect(() =>
      service.createAuthUrl({
        userId: "user-1",
      }),
    ).toThrow(/Invalid Gmail callback URL/i);
  });
});
