import fs from "fs";
import path from "path";
import { describe, expect, test, jest, beforeEach } from "@jest/globals";
import jwt from "jsonwebtoken";

import { config } from "../../config/env";
import { writeCertificationGateReport } from "./reporting";

// ── Mock Prisma before importing auth middleware ─────────────────────────
const mockPrismaSession = {
  findUnique: jest.fn(),
};
const mockPrismaUser = {
  findUnique: jest.fn(),
};

jest.mock("../../config/database", () => ({
  __esModule: true,
  default: {
    session: mockPrismaSession,
    user: mockPrismaUser,
  },
}));

// Import after mock is set up
import { authenticateToken } from "../../middleware/auth.middleware";

function makeRes() {
  const state: { status?: number; body?: unknown } = {};
  const res: any = {
    status(code: number) {
      state.status = code;
      return this;
    },
    json(payload: unknown) {
      state.body = payload;
      return this;
    },
  };
  return { res, state };
}

describe("Certification: security auth hardening", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("auth middleware rejects missing tokens and avoids x-user-id trust", async () => {
    const missingTokenReq: any = {
      headers: {},
      cookies: {},
    };
    const { res: missingTokenRes, state: missingTokenResState } = makeRes();
    let missingTokenNextCalled = false;

    await authenticateToken(
      missingTokenReq as any,
      missingTokenRes as any,
      (() => {
        missingTokenNextCalled = true;
      }) as any,
    );

    const forgedHeaderReq: any = {
      headers: {
        authorization: "Bearer forged.invalid.token",
        "x-user-id": "attacker-user-id",
      },
      cookies: {},
    };
    const { res: forgedHeaderRes, state: forgedHeaderResState } = makeRes();
    let forgedHeaderNextCalled = false;

    await authenticateToken(
      forgedHeaderReq as any,
      forgedHeaderRes as any,
      (() => {
        forgedHeaderNextCalled = true;
      }) as any,
    );

    const middlewarePath = path.resolve(
      process.cwd(),
      "src/middleware/auth.middleware.ts",
    );
    const middlewareSource = fs.readFileSync(middlewarePath, "utf8");
    const failures: string[] = [];

    if (missingTokenNextCalled) failures.push("MISSING_TOKEN_DID_NOT_REJECT");
    if (missingTokenResState.status !== 401)
      failures.push("MISSING_TOKEN_STATUS_NOT_401");
    if (forgedHeaderNextCalled) failures.push("FORGED_TOKEN_DID_NOT_REJECT");
    if (forgedHeaderResState.status !== 401)
      failures.push("FORGED_TOKEN_STATUS_NOT_401");
    if (forgedHeaderReq.user != null)
      failures.push("FORGED_TOKEN_SET_AUTH_CONTEXT");
    if (/x-user-id/i.test(middlewareSource))
      failures.push("HEADER_TRUST_PATH_PRESENT");
    if (!/verifyAccessToken\(/.test(middlewareSource)) {
      failures.push("JWT_VERIFICATION_NOT_USED");
    }

    // ── Expired token rejection ──────────────────────────────────────────
    const expiredToken = jwt.sign(
      { userId: "cert-user", email: "cert@test.com" },
      config.JWT_ACCESS_SECRET,
      { expiresIn: "0s" },
    );
    const expiredReq: any = {
      headers: { authorization: "Bearer " + expiredToken },
      cookies: {},
    };
    const { res: expiredRes, state: expiredResState } = makeRes();
    let expiredNextCalled = false;
    await authenticateToken(expiredReq, expiredRes, (() => {
      expiredNextCalled = true;
    }) as any);

    if (expiredNextCalled || expiredResState.status !== 401)
      failures.push("EXPIRED_TOKEN_NOT_REJECTED");

    // ── Revoked session rejection ────────────────────────────────────────
    const revokedSessionToken = jwt.sign(
      {
        userId: "cert-user",
        email: "cert@test.com",
        sid: "sess-revoked",
        sv: 1,
      },
      config.JWT_ACCESS_SECRET,
      { expiresIn: "1h" },
    );
    mockPrismaSession.findUnique.mockResolvedValueOnce({
      isActive: false,
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600_000),
      tokenVersion: 1,
      userId: "cert-user",
    });
    const revokedReq: any = {
      headers: { authorization: "Bearer " + revokedSessionToken },
      cookies: {},
    };
    const { res: revokedRes, state: revokedResState } = makeRes();
    let revokedNextCalled = false;
    await authenticateToken(revokedReq, revokedRes, (() => {
      revokedNextCalled = true;
    }) as any);

    if (revokedNextCalled || revokedResState.status !== 401)
      failures.push("REVOKED_SESSION_NOT_REJECTED");

    // ── Token version mismatch rejection ─────────────────────────────────
    const versionMismatchToken = jwt.sign(
      {
        userId: "cert-user",
        email: "cert@test.com",
        sid: "sess-version",
        sv: 1,
      },
      config.JWT_ACCESS_SECRET,
      { expiresIn: "1h" },
    );
    mockPrismaSession.findUnique.mockResolvedValueOnce({
      isActive: true,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 3600_000),
      tokenVersion: 2, // mismatch: JWT has sv:1
      userId: "cert-user",
    });
    const versionReq: any = {
      headers: { authorization: "Bearer " + versionMismatchToken },
      cookies: {},
    };
    const { res: versionRes, state: versionResState } = makeRes();
    let versionNextCalled = false;
    await authenticateToken(versionReq, versionRes, (() => {
      versionNextCalled = true;
    }) as any);

    if (versionNextCalled || versionResState.status !== 401)
      failures.push("TOKEN_VERSION_MISMATCH_NOT_REJECTED");

    // ── Cross-user session rejection ─────────────────────────────────────
    const crossUserToken = jwt.sign(
      {
        userId: "user-A",
        email: "a@test.com",
        sid: "sess-cross",
        sv: 1,
      },
      config.JWT_ACCESS_SECRET,
      { expiresIn: "1h" },
    );
    mockPrismaSession.findUnique.mockResolvedValueOnce({
      isActive: true,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 3600_000),
      tokenVersion: 1,
      userId: "user-B", // different from JWT's user-A
    });
    const crossReq: any = {
      headers: { authorization: "Bearer " + crossUserToken },
      cookies: {},
    };
    const { res: crossRes, state: crossResState } = makeRes();
    let crossNextCalled = false;
    await authenticateToken(crossReq, crossRes, (() => {
      crossNextCalled = true;
    }) as any);

    if (crossNextCalled || crossResState.status !== 401)
      failures.push("CROSS_USER_SESSION_NOT_REJECTED");

    // ── Static analysis: dev-mode verification code logging guarded ──────
    const authBridgePath = path.resolve(
      process.cwd(),
      "src/bootstrap/authBridge.ts",
    );
    const authBridgeSource = fs.readFileSync(authBridgePath, "utf8");
    const authServicePath = path.resolve(
      process.cwd(),
      "src/services/auth.service.ts",
    );
    const authServiceSource = fs.readFileSync(authServicePath, "utf8");

    const nodeEnvGuardPattern =
      /if\s*\(\s*process\.env\.NODE_ENV\s*!==\s*["']production["']\s*\)/;

    let unguardedDevCodeLogging = false;
    for (const source of [authBridgeSource, authServiceSource]) {
      const lines = source.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/\[DEV MODE\]/.test(lines[i])) {
          const contextWindow = lines
            .slice(Math.max(0, i - 3), i + 1)
            .join("\n");
          if (!nodeEnvGuardPattern.test(contextWindow)) {
            unguardedDevCodeLogging = true;
          }
        }
      }
    }
    if (unguardedDevCodeLogging) failures.push("UNGUARDED_DEV_CODE_LOGGING");

    // ── Static analysis: no unmasked phone numbers in log lines ──────────
    let unmaskedPhoneLogging = false;
    const phoneLogPattern =
      /console\.\w+\(.*(?:phoneNumber|formattedPhone|result\.phoneNumber)(?!.*(?:mask|slice|replace)).*\)/i;
    for (const source of [authServiceSource]) {
      if (phoneLogPattern.test(source)) {
        unmaskedPhoneLogging = true;
      }
    }
    if (unmaskedPhoneLogging) failures.push("UNMASKED_PHONE_LOGGING");

    // -- Static analysis: OAuth callback must not redirect with tokens in URL --
    const authRoutesPath = path.resolve(
      process.cwd(),
      "src/entrypoints/http/routes/auth.routes.ts",
    );
    const gmailOAuthPath = path.resolve(
      process.cwd(),
      "src/services/connectors/gmail/gmailOAuth.service.ts",
    );
    const passportConfigPath = path.resolve(
      process.cwd(),
      "src/config/passport.ts",
    );
    const authRoutesSource = fs.readFileSync(authRoutesPath, "utf8");
    const gmailOAuthSource = fs.readFileSync(gmailOAuthPath, "utf8");
    const passportConfigSource = fs.readFileSync(passportConfigPath, "utf8");
    const hasUrlTokenCompatFlag = /AUTH_URL_TOKEN_COMPAT/.test(authRoutesSource);
    const hasTokenQueryRedirect =
      /URLSearchParams\s*\(\s*\{[\s\S]*accessToken[\s\S]*refreshToken[\s\S]*\}\s*\)/.test(
        authRoutesSource,
      ) || /accessToken=.*refreshToken=/.test(authRoutesSource);
    const hasGoogleStateIssue = /issueGoogleOAuthState\s*\(/.test(
      authRoutesSource,
    );
    const hasGoogleStateVerify = /verifyGoogleOAuthState\s*\(/.test(
      authRoutesSource,
    );
    const hasGoogleStateCookie = /koda_google_oauth_state/.test(authRoutesSource);
    const hasGoogleStateValidatorMiddleware = /validateGoogleOAuthState/.test(
      authRoutesSource,
    );
    const hasGooglePassportStateOption = /state:\s*stateToken/.test(
      authRoutesSource,
    );
    const hasGoogleAuthCallbackEnvUsage =
      /GOOGLE_AUTH_CALLBACK_URL/.test(passportConfigSource) &&
      /callbackURL:\s*googleCallbackUrl/.test(passportConfigSource);
    const hasGoogleEmailVerifiedGuard = /email_not_verified/.test(
      authRoutesSource,
    );
    const hasAppleStateIssue = /issueAppleOAuthState\s*\(/.test(authRoutesSource);
    const hasAppleStateVerify = /verifyAppleOAuthState\s*\(/.test(authRoutesSource);
    const hasAppleStateCookie = /koda_apple_oauth_state/.test(authRoutesSource);
    const hasAppleNonceParam = /nonce:\s*nonce/.test(authRoutesSource);
    const hasAppleIdTokenVerifier = /verifyAppleIdToken\s*\(/.test(
      authRoutesSource,
    );
    const hasTwoFactorChallengeIssue = /issueTwoFactorLoginChallenge\s*\(/.test(
      authRoutesSource,
    );
    const hasTwoFactorChallengeVerify =
      /verifyTwoFactorLoginChallenge\s*\(/.test(authRoutesSource) &&
      /consumeTwoFactorLoginChallenge\s*\(/.test(authRoutesSource);
    const hasTwoFactorChallengeCookie = /koda_2fa_challenge/.test(
      authRoutesSource,
    );
    const hasOAuthTwoFactorAuthCookieClear =
      /clearAuthCookies\(res\)\s*;\s*setTwoFactorChallengeCookie\(res,\s*challengeToken\)/.test(
        authRoutesSource,
      );
    const hasGmailConnectorCallbackPath =
      /\/api\/integrations\/gmail\/callback/.test(gmailOAuthSource);
    const hasGoogleLoginCallbackPath =
      /\/google\/callback/.test(authRoutesSource);
    const usesGenericGoogleFallbackInGmailOauth =
      /process\.env\.GOOGLE_CLIENT_ID/.test(gmailOAuthSource) ||
      /process\.env\.GOOGLE_CLIENT_SECRET/.test(gmailOAuthSource) ||
      /process\.env\.GOOGLE_CALLBACK_URL/.test(gmailOAuthSource);
    const hasGmailLegacyFallbackGuardFlag =
      /CONNECTOR_GMAIL_ALLOW_GOOGLE_AUTH_FALLBACK/.test(gmailOAuthSource) &&
      /CONNECTOR_GMAIL_STRICT_OAUTH_CONFIG/.test(gmailOAuthSource);
    const unguardedGmailGenericFallback =
      usesGenericGoogleFallbackInGmailOauth &&
      !hasGmailLegacyFallbackGuardFlag;
    if (hasUrlTokenCompatFlag) failures.push("AUTH_URL_TOKEN_COMPAT_PRESENT");
    if (hasTokenQueryRedirect) failures.push("AUTH_TOKEN_QUERY_REDIRECT_PRESENT");
    if (!hasGoogleStateIssue) failures.push("GOOGLE_OAUTH_STATE_ISSUE_MISSING");
    if (!hasGoogleStateVerify) failures.push("GOOGLE_OAUTH_STATE_VERIFY_MISSING");
    if (!hasGoogleStateCookie) failures.push("GOOGLE_OAUTH_STATE_COOKIE_MISSING");
    if (!hasGoogleStateValidatorMiddleware)
      failures.push("GOOGLE_OAUTH_STATE_VALIDATOR_NOT_WIRED");
    if (!hasGooglePassportStateOption)
      failures.push("GOOGLE_OAUTH_PASSPORT_STATE_OPTION_MISSING");
    if (!hasGoogleAuthCallbackEnvUsage)
      failures.push("GOOGLE_OAUTH_CALLBACK_ENV_USAGE_MISSING");
    if (!hasGoogleEmailVerifiedGuard)
      failures.push("GOOGLE_OAUTH_EMAIL_VERIFIED_GUARD_MISSING");
    if (!hasAppleStateIssue) failures.push("APPLE_OAUTH_STATE_ISSUE_MISSING");
    if (!hasAppleStateVerify) failures.push("APPLE_OAUTH_STATE_VERIFY_MISSING");
    if (!hasAppleStateCookie) failures.push("APPLE_OAUTH_STATE_COOKIE_MISSING");
    if (!hasAppleNonceParam) failures.push("APPLE_OAUTH_NONCE_PARAM_MISSING");
    if (!hasAppleIdTokenVerifier)
      failures.push("APPLE_OAUTH_IDTOKEN_VERIFY_MISSING");
    if (!hasTwoFactorChallengeIssue)
      failures.push("AUTH_2FA_CHALLENGE_ISSUE_MISSING");
    if (!hasTwoFactorChallengeVerify)
      failures.push("AUTH_2FA_CHALLENGE_VERIFY_MISSING");
    if (!hasTwoFactorChallengeCookie)
      failures.push("AUTH_2FA_CHALLENGE_COOKIE_MISSING");
    if (!hasOAuthTwoFactorAuthCookieClear)
      failures.push("AUTH_OAUTH_2FA_COOKIE_CLEAR_MISSING");
    if (!hasGmailConnectorCallbackPath)
      failures.push("GMAIL_CONNECTOR_CALLBACK_PATH_MISSING");
    if (!hasGoogleLoginCallbackPath)
      failures.push("GOOGLE_LOGIN_CALLBACK_PATH_MISSING");
    if (unguardedGmailGenericFallback) {
      failures.push("GMAIL_OAUTH_GENERIC_FALLBACK_UNGUARDED");
    }

    // -- Static analysis: browser clients must not read auth tokens from localStorage
    // and dashboard code must not keep API keys in JS runtime state. --
    const frontendRootCandidates = [
      path.resolve(process.cwd(), "..", "frontend", "src"),
      path.resolve(process.cwd(), "frontend", "src"),
    ];
    const dashboardRootCandidates = [
      path.resolve(process.cwd(), "..", "dashboard", "client", "src"),
      path.resolve(process.cwd(), "dashboard", "client", "src"),
    ];
    const frontendRoot = frontendRootCandidates.find((candidate) =>
      fs.existsSync(candidate),
    );
    const dashboardRoot = dashboardRootCandidates.find((candidate) =>
      fs.existsSync(candidate),
    );
    let frontendTokenReadPatterns = 0;
    let frontendCompatFlagPatterns = 0;
    let dashboardApiKeyPatterns = 0;
    const walk = (dir: string, appId: "frontend" | "dashboard"): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.toLowerCase() === "nul") continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, appId);
          continue;
        }
        if (!/\.(js|jsx|ts|tsx)$/.test(entry.name)) continue;
        const src = fs.readFileSync(fullPath, "utf8");
        if (/AUTH_LOCALSTORAGE_COMPAT/.test(src)) {
          frontendCompatFlagPatterns++;
        }
        if (
          /localStorage\.getItem\(["']token["']\)/.test(src) ||
          /localStorage\.getItem\(["']accessToken["']\)/.test(src) ||
          /localStorage\.getItem\(["']refreshToken["']\)/.test(src) ||
          /localStorage\.setItem\(["']token["']/.test(src) ||
          /localStorage\.setItem\(["']accessToken["']/.test(src) ||
          /localStorage\.setItem\(["']refreshToken["']/.test(src) ||
          /sessionStorage\.setItem\(["']token["']/.test(src) ||
          /sessionStorage\.setItem\(["']accessToken["']/.test(src) ||
          /sessionStorage\.setItem\(["']refreshToken["']/.test(src)
        ) {
          frontendTokenReadPatterns++;
        }
        if (
          appId === "dashboard" &&
          (/X-Admin-Key/.test(src) ||
            /loginWithApiKey/.test(src) ||
            /adminApiKey/i.test(src))
        ) {
          dashboardApiKeyPatterns++;
        }
      }
    };
    if (frontendRoot) {
      walk(frontendRoot, "frontend");
    } else {
      failures.push("FRONTEND_SRC_NOT_FOUND_FOR_SECURITY_SCAN");
    }
    if (dashboardRoot) {
      walk(dashboardRoot, "dashboard");
    } else {
      failures.push("DASHBOARD_SRC_NOT_FOUND_FOR_SECURITY_SCAN");
    }
    if (frontendCompatFlagPatterns > 0) {
      failures.push("FRONTEND_AUTH_LOCALSTORAGE_COMPAT_PRESENT");
    }
    if (frontendTokenReadPatterns > 0) {
      failures.push("FRONTEND_TOKEN_LOCALSTORAGE_READ_PRESENT");
    }
    if (dashboardApiKeyPatterns > 0) {
      failures.push("DASHBOARD_JS_APIKEY_AUTH_PRESENT");
    }

    // ── Static analysis: no plaintext extractedText writes ───────────────
    const servicesDir = path.resolve(process.cwd(), "src/services");
    let plaintextWritePathCount = 0;

    // Only flag direct Prisma writes to Document.extractedText with non-null values.
    // Pattern: `extractedText:` followed by a non-null, non-conditional value inside a
    // prisma.document.create/update data block. Exclude DocumentMetadata, reads, and
    // local variable assignments (`extractedText =` or conditional null writes).
    function scanForPlaintextWrites(dir: string): void {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanForPlaintextWrites(fullPath);
          continue;
        }
        if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts"))
          continue;
        const src = fs.readFileSync(fullPath, "utf8");
        // Match "extractedText:" that is NOT followed by null/Encrypted/conditional
        // and IS near a prisma.document write (not prisma.documentMetadata)
        const lines = src.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Only match property assignments (colon syntax in data objects)
          if (!/extractedText\s*:/.test(line)) continue;
          // Skip if the value is encrypted, null, or conditionally null
          if (
            /extractedTextEncrypted|:\s*null|encryptDocumentText\s*\?\s*null|\?\.\s*extractedText/.test(
              line,
            )
          )
            continue;
          // Skip reads (accessing .extractedText on an object)
          if (/\.\s*extractedText\s*[?.]/.test(line)) continue;
          // Check context: is this inside a prisma.document (not documentMetadata) write?
          const context = lines.slice(Math.max(0, i - 10), i + 1).join("\n");
          if (
            /prisma\.document\.(create|update)\b/.test(context) &&
            !/prisma\.documentMetadata/.test(context)
          ) {
            plaintextWritePathCount++;
          }
        }
      }
    }
    scanForPlaintextWrites(servicesDir);
    if (plaintextWritePathCount > 0)
      failures.push("PLAINTEXT_EXTRACTEDTEXT_WRITE_FOUND");

    writeCertificationGateReport("security-auth", {
      passed: failures.length === 0,
      metrics: {
        missingTokenRejected:
          !missingTokenNextCalled && missingTokenResState.status === 401,
        forgedHeaderRejected:
          !forgedHeaderNextCalled && forgedHeaderResState.status === 401,
        forgedHeaderDidNotSetUser: forgedHeaderReq.user == null,
        headerTrustPathPresent: /x-user-id/i.test(middlewareSource),
        jwtVerificationUsed: /verifyAccessToken\(/.test(middlewareSource),
        expiredTokenRejected:
          !expiredNextCalled && expiredResState.status === 401,
        revokedSessionRejected:
          !revokedNextCalled && revokedResState.status === 401,
        tokenVersionMismatchRejected:
          !versionNextCalled && versionResState.status === 401,
        crossUserSessionRejected:
          !crossNextCalled && crossResState.status === 401,
        unguardedDevCodeLogging,
        unmaskedPhoneLogging,
        hasUrlTokenCompatFlag,
        hasTokenQueryRedirect,
        hasGoogleStateIssue,
        hasGoogleStateVerify,
        hasGoogleStateCookie,
        hasGoogleStateValidatorMiddleware,
        hasGooglePassportStateOption,
        hasGoogleAuthCallbackEnvUsage,
        hasGoogleEmailVerifiedGuard,
        hasGmailConnectorCallbackPath,
        hasGoogleLoginCallbackPath,
        hasOAuthTwoFactorAuthCookieClear,
        usesGenericGoogleFallbackInGmailOauth,
        hasGmailLegacyFallbackGuardFlag,
        unguardedGmailGenericFallback,
        frontendCompatFlagPatterns,
        frontendTokenReadPatterns,
        dashboardApiKeyPatterns,
        plaintextWritePathCount,
      },
      thresholds: {
        missingTokenRejected: true,
        forgedHeaderRejected: true,
        forgedHeaderDidNotSetUser: true,
        headerTrustPathPresent: false,
        jwtVerificationUsed: true,
        expiredTokenRejected: true,
        revokedSessionRejected: true,
        tokenVersionMismatchRejected: true,
        crossUserSessionRejected: true,
        unguardedDevCodeLogging: false,
        unmaskedPhoneLogging: false,
        hasUrlTokenCompatFlag: false,
        hasTokenQueryRedirect: false,
        hasGoogleStateIssue: true,
        hasGoogleStateVerify: true,
        hasGoogleStateCookie: true,
        hasGoogleStateValidatorMiddleware: true,
        hasGooglePassportStateOption: true,
        hasGoogleAuthCallbackEnvUsage: true,
        hasGoogleEmailVerifiedGuard: true,
        hasGmailConnectorCallbackPath: true,
        hasGoogleLoginCallbackPath: true,
        hasOAuthTwoFactorAuthCookieClear: true,
        unguardedGmailGenericFallback: false,
        maxFrontendCompatFlagPatterns: 0,
        maxFrontendTokenReadPatterns: 0,
        maxDashboardApiKeyPatterns: 0,
        maxPlaintextWritePathCount: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
