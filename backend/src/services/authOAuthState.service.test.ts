import crypto from "crypto";
import { describe, expect, test } from "@jest/globals";

import {
  issueGoogleOAuthState,
  verifyGoogleOAuthState,
  issueAppleOAuthState,
  verifyAppleOAuthState,
  timingSafeEqualString,
} from "./authOAuthState.service";

function buildSignedState(payload: Record<string, unknown>, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

describe("authOAuthState.service", () => {
  const secret = "state-secret-123";

  test("issues and verifies Google OAuth state with stable payload", () => {
    const nowMs = 1_700_000_000_000;
    const token = issueGoogleOAuthState({
      secret,
      nowMs,
      nonce: "nonce-1",
    });

    const verification = verifyGoogleOAuthState({
      state: token,
      secret,
      nowMs: nowMs + 30_000,
      ttlMs: 60_000,
    });

    expect(verification).toEqual({
      ok: true,
      payload: {
        v: 1,
        provider: "google_auth",
        nonce: "nonce-1",
        iat: Math.floor(nowMs / 1000),
      },
    });
  });

  test("rejects state with tampered signature", () => {
    const token = issueGoogleOAuthState({
      secret,
      nowMs: 1_700_000_000_000,
      nonce: "nonce-2",
    });
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");

    const verification = verifyGoogleOAuthState({
      state: tampered,
      secret,
      nowMs: 1_700_000_010_000,
      ttlMs: 60_000,
    });

    expect(verification).toEqual({
      ok: false,
      reason: "STATE_SIGNATURE_MISMATCH",
    });
  });

  test("rejects expired and future-issued state", () => {
    const nowMs = 1_700_000_000_000;
    const issued = issueGoogleOAuthState({
      secret,
      nowMs,
      nonce: "nonce-3",
    });

    expect(
      verifyGoogleOAuthState({
        state: issued,
        secret,
        nowMs: nowMs + 61_000,
        ttlMs: 60_000,
      }),
    ).toEqual({ ok: false, reason: "STATE_EXPIRED" });

    expect(
      verifyGoogleOAuthState({
        state: issued,
        secret,
        nowMs: nowMs - 1000,
        ttlMs: 60_000,
      }),
    ).toEqual({ ok: false, reason: "STATE_EXPIRED" });
  });

  test("rejects state payload with wrong provider", () => {
    const nowMs = 1_700_000_000_000;
    const token = buildSignedState(
      {
        v: 1,
        provider: "gmail",
        nonce: "nonce-4",
        iat: Math.floor(nowMs / 1000),
      },
      secret,
    );

    const verification = verifyGoogleOAuthState({
      state: token,
      secret,
      nowMs: nowMs + 5000,
      ttlMs: 60_000,
    });

    expect(verification).toEqual({
      ok: false,
      reason: "STATE_INVALID_PAYLOAD",
    });
  });

  test("timingSafeEqualString checks exact value equality", () => {
    expect(timingSafeEqualString("abc", "abc")).toBe(true);
    expect(timingSafeEqualString("abc", "abd")).toBe(false);
    expect(timingSafeEqualString("abc", "ab")).toBe(false);
  });

  test("issues and verifies Apple OAuth state with provider binding", () => {
    const nowMs = 1_700_000_000_000;
    const token = issueAppleOAuthState({
      secret,
      nowMs,
      nonce: "nonce-apple-1",
    });

    const verification = verifyAppleOAuthState({
      state: token,
      secret,
      nowMs: nowMs + 1_000,
      ttlMs: 60_000,
    });

    expect(verification).toEqual({
      ok: true,
      payload: {
        v: 1,
        provider: "apple_auth",
        nonce: "nonce-apple-1",
        iat: Math.floor(nowMs / 1000),
      },
    });
  });
});
