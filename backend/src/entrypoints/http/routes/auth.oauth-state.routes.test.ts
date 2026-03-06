import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

import { issueGoogleOAuthState } from "../../../services/authOAuthState.service";

const passportAuthenticateMock = jest.fn();
const loggerWarnMock = jest.fn();
const loggerErrorMock = jest.fn();

jest.mock("../../../config/passport", () => ({
  __esModule: true,
  default: {
    authenticate: (...args: any[]) => {
      const handler = passportAuthenticateMock(...args);
      if (typeof handler === "function") return handler;
      return (_req: any, _res: any, next: any) => next();
    },
  },
}));

jest.mock("../../../middleware/auth.middleware", () => ({
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  optionalAuth: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../../middleware/rateLimit.middleware", () => ({
  authLimiter: (_req: any, _res: any, next: any) => next(),
  twoFactorLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../../controllers/auth.controller", () => ({
  createAuthController: () => ({
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    me: jest.fn(),
  }),
  mapServiceError: jest.fn((_res: any) => _res),
  AuthController: class {},
}));

jest.mock("../../../middleware/validate.middleware", () => ({
  validate: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../../schemas/request.schemas", () => ({
  authRegisterSchema: {},
  authLoginSchema: {},
  authRefreshSchema: {},
}));

jest.mock("../../../platform/db/prismaClient", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    session: {
      create: jest.fn(),
    },
  },
}));

jest.mock("../../../config/env", () => ({
  config: {
    FRONTEND_URL: "https://frontend.test",
    JWT_ACCESS_SECRET: "jwt-access-secret",
    JWT_REFRESH_SECRET: "jwt-refresh-secret",
    APPLE_CLIENT_ID: "",
    APPLE_CALLBACK_URL: "https://frontend.test/apple/callback",
  },
}));

jest.mock("../../../utils/jwt", () => ({
  generateAccessToken: jest.fn(() => "access"),
  generateRefreshToken: jest.fn(() => "refresh"),
}));

jest.mock("../../../utils/authCookies", () => ({
  setAuthCookies: jest.fn(),
  clearAuthCookies: jest.fn(),
  setTwoFactorChallengeCookie: jest.fn(),
  clearTwoFactorChallengeCookie: jest.fn(),
  TWO_FACTOR_CHALLENGE_COOKIE: "koda_2fa_challenge",
}));

jest.mock("../../../services/auth.service", () => ({
  verifyPendingUserEmail: jest.fn(),
  resendPendingUserEmail: jest.fn(),
  addPhoneToPendingUser: jest.fn(),
  verifyPendingUserPhone: jest.fn(),
  sendEmailVerificationCode: jest.fn(),
  verifyEmailCode: jest.fn(),
  sendPhoneVerificationCode: jest.fn(),
  verifyPhoneCode: jest.fn(),
  requestPasswordReset: jest.fn(),
  verifyPasswordResetCode: jest.fn(),
  resetPassword: jest.fn(),
  initiateForgotPassword: jest.fn(),
  sendResetLink: jest.fn(),
  resetPasswordWithToken: jest.fn(),
}));

jest.mock("../../../controllers/twoFactor.controller", () => ({
  enable2FA: jest.fn(),
  verify2FA: jest.fn(),
  verify2FALogin: jest.fn(),
  disable2FA: jest.fn(),
  getBackupCodes: jest.fn(),
}));

jest.mock("../../../services/twoFactor.service", () => ({
  verify2FALogin: jest.fn(),
}));

jest.mock("../../../services/authLoginChallenge.service", () => ({
  issueTwoFactorLoginChallenge: jest.fn(),
  verifyTwoFactorLoginChallenge: jest.fn(),
  consumeTwoFactorLoginChallenge: jest.fn(),
}));

jest.mock("../../../utils/logger", () => ({
  logger: {
    warn: (...args: any[]) => loggerWarnMock(...args),
    error: (...args: any[]) => loggerErrorMock(...args),
  },
}));

import {
  startGoogleOAuth,
  validateGoogleOAuthState,
} from "./auth.routes";

describe("auth.routes Google OAuth state guards", () => {
  beforeEach(() => {
    passportAuthenticateMock.mockReset();
    loggerWarnMock.mockReset();
    loggerErrorMock.mockReset();
  });

  test("startGoogleOAuth issues signed state, sets cookie, and forwards to passport", () => {
    const authMiddleware = jest.fn((_req: any, _res: any, next: any) => next());
    passportAuthenticateMock.mockReturnValue(authMiddleware);

    const req: any = {};
    const res: any = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      redirect: jest.fn(),
    };
    const next = jest.fn();

    startGoogleOAuth(req, res, next);

    expect(passportAuthenticateMock).toHaveBeenCalledWith(
      "google",
      expect.objectContaining({
        scope: ["profile", "email"],
        session: false,
        state: expect.any(String),
      }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      "koda_google_oauth_state",
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
      }),
    );
    expect(authMiddleware).toHaveBeenCalledWith(req, res, next);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  test("validateGoogleOAuthState accepts matching and valid signed state", () => {
    const state = issueGoogleOAuthState({
      secret: "jwt-access-secret",
      nowMs: Date.now(),
      nonce: "nonce-ok",
    });
    const req: any = {
      query: { state },
      cookies: { koda_google_oauth_state: state },
    };
    const res: any = {
      clearCookie: jest.fn(),
      redirect: jest.fn(),
    };
    const next = jest.fn();

    validateGoogleOAuthState(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledWith("koda_google_oauth_state", {
      path: "/",
    });
  });

  test("validateGoogleOAuthState rejects state mismatch", () => {
    const queryState = issueGoogleOAuthState({
      secret: "jwt-access-secret",
      nowMs: Date.now(),
      nonce: "nonce-query",
    });
    const cookieState = issueGoogleOAuthState({
      secret: "jwt-access-secret",
      nowMs: Date.now(),
      nonce: "nonce-cookie",
    });

    const req: any = {
      query: { state: queryState },
      cookies: { koda_google_oauth_state: cookieState },
    };
    const res: any = {
      clearCookie: jest.fn(),
      redirect: jest.fn(),
    };
    const next = jest.fn();

    validateGoogleOAuthState(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      "https://frontend.test/a/x7k2m9/c3b?error=invalid_state",
    );
    expect(loggerWarnMock).toHaveBeenCalled();
  });

  test("google callback rejects unverified provider email with explicit code", async () => {
    jest.resetModules();
    passportAuthenticateMock.mockImplementation(
      (_strategy: string, options?: Record<string, unknown>) => {
        if (options?.failureRedirect) {
          return (req: any, _res: any, next: any) => {
            req.user = {
              id: "google-user-1",
              email: "user@example.com",
              emailVerified: false,
              displayName: "User",
            };
            next();
          };
        }
        return (_req: any, _res: any, next: any) => next();
      },
    );

    const state = issueGoogleOAuthState({
      secret: "jwt-access-secret",
      nowMs: Date.now(),
      nonce: "nonce-callback",
    });

    const app = express();
    app.use(cookieParser());
    const { default: authRouter } = await import("./auth.routes");
    app.use("/api/auth", authRouter);

    const response = await request(app)
      .get(`/api/auth/google/callback?state=${encodeURIComponent(state)}`)
      .set("Cookie", [`koda_google_oauth_state=${state}`]);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      "https://frontend.test/a/x7k2m9/c3b?error=email_not_verified",
    );
  });
});
