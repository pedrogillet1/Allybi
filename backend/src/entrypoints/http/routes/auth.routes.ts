// src/routes/auth.routes.ts
//
// Clean auth routes for Koda (Express).
// - Thin router: no business logic here
// - Controllers/services handle validation + persistence + security
// - No user-facing microcopy hardcoded here (return reason codes / structured errors)

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import passport from "../../../config/passport";

import {
  authenticateToken,
  optionalAuth,
} from "../../../middleware/auth.middleware";

import {
  authLimiter,
  twoFactorLimiter,
} from "../../../middleware/rateLimit.middleware";

import {
  AuthController,
  createAuthController,
  mapServiceError,
} from "../../../controllers/auth.controller";
import { validate } from "../../../middleware/validate.middleware";
import {
  authRegisterSchema,
  authLoginSchema,
  authRefreshSchema,
} from "../../../schemas/request.schemas";

import prisma from "../../../platform/db/prismaClient";
import { config } from "../../../config/env";
import { generateAccessToken, generateRefreshToken } from "../../../utils/jwt";
import {
  setAuthCookies,
  clearAuthCookies,
  setTwoFactorChallengeCookie,
  clearTwoFactorChallengeCookie,
  TWO_FACTOR_CHALLENGE_COOKIE,
} from "../../../utils/authCookies";
import { logger } from "../../../utils/logger";
import {
  issueGoogleOAuthState,
  verifyGoogleOAuthState,
  issueAppleOAuthState,
  verifyAppleOAuthState,
  timingSafeEqualString,
} from "../../../services/authOAuthState.service";
import { verifyAppleIdToken } from "../../../services/appleOidc.service";
import {
  consumeTwoFactorLoginChallenge,
  issueTwoFactorLoginChallenge,
  verifyTwoFactorLoginChallenge,
} from "../../../services/authLoginChallenge.service";

import * as authService from "../../../services/auth.service";
import * as twoFactorController from "../../../controllers/twoFactor.controller";
import * as twoFactorService from "../../../services/twoFactor.service";

const router = Router();

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------

const REFRESH_TOKEN_PEPPER =
  process.env.KODA_REFRESH_PEPPER || process.env.JWT_REFRESH_SECRET || "";
const GOOGLE_OAUTH_STATE_COOKIE = "koda_google_oauth_state";
const APPLE_OAUTH_STATE_COOKIE = "koda_apple_oauth_state";
const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const APPLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const isProduction = process.env.NODE_ENV === "production";

function hmacSha256(input: string): string {
  return crypto
    .createHmac("sha256", REFRESH_TOKEN_PEPPER)
    .update(input)
    .digest("hex");
}

function oauthRedirect(res: Response, code: string): void {
  res.redirect(`${config.FRONTEND_URL}/a/x7k2m9/c3b?error=${code}`);
}

function resolveGoogleOAuthStateSecret(): string {
  return String(
    process.env.KODA_OAUTH_STATE_SECRET ||
      process.env.KODA_REFRESH_PEPPER ||
      config.JWT_ACCESS_SECRET ||
      config.JWT_REFRESH_SECRET ||
      "",
  ).trim();
}

function setGoogleOAuthStateCookie(res: Response, stateToken: string): void {
  res.cookie(GOOGLE_OAUTH_STATE_COOKIE, stateToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: GOOGLE_OAUTH_STATE_TTL_MS,
  });
}

function clearGoogleOAuthStateCookie(res: Response): void {
  res.clearCookie(GOOGLE_OAUTH_STATE_COOKIE, { path: "/" });
}

function setAppleOAuthStateCookie(res: Response, stateToken: string): void {
  res.cookie(APPLE_OAUTH_STATE_COOKIE, stateToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: APPLE_OAUTH_STATE_TTL_MS,
  });
}

function clearAppleOAuthStateCookie(res: Response): void {
  res.clearCookie(APPLE_OAUTH_STATE_COOKIE, { path: "/" });
}

function getGoogleOAuthStateFromQuery(req: Request): string {
  const raw = req.query?.state;
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim();
  return "";
}

function getAppleOAuthState(req: Request): string {
  const queryRaw = req.query?.state;
  if (typeof queryRaw === "string" && queryRaw.trim()) return queryRaw.trim();
  if (Array.isArray(queryRaw) && typeof queryRaw[0] === "string") {
    return queryRaw[0].trim();
  }
  const bodyRaw = (req.body as any)?.state;
  if (typeof bodyRaw === "string" && bodyRaw.trim()) return bodyRaw.trim();
  return "";
}

function routeErr(
  res: Response,
  code: string,
  message: string,
  status = 400,
): Response {
  return res.status(status).json({
    ok: false,
    error: { code, message },
  });
}

async function issueSessionTokensForUser(userId: string, email: string) {
  const refreshToken = generateRefreshToken({
    userId,
    email,
  });
  const session = await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: hmacSha256(refreshToken),
      tokenVersion: 1,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      isActive: true,
    },
  });
  const accessToken = generateAccessToken({
    userId,
    email,
    sid: session.id,
    sv: session.tokenVersion,
  });
  return { accessToken, refreshToken };
}

function toPublicUser(
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string | null;
    profileImage: string | null;
    isEmailVerified: boolean;
    isPhoneVerified: boolean;
    googleId: string | null;
    appleId: string | null;
    subscriptionTier: string | null;
    createdAt: Date;
  },
) {
  return {
    id: user.id,
    email: user.email,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
    firstName: user.firstName,
    lastName: user.lastName,
    phoneNumber: user.phoneNumber,
    profileImage: user.profileImage,
    isEmailVerified: user.isEmailVerified,
    isPhoneVerified: user.isPhoneVerified,
    isOAuth: !!(user.googleId || user.appleId),
    subscriptionTier: user.subscriptionTier,
    createdAt: user.createdAt.toISOString(),
  };
}

export function startGoogleOAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    const secret = resolveGoogleOAuthStateSecret();
    if (!secret) {
      logger.error("[OAuth] Google state secret is missing.");
      clearGoogleOAuthStateCookie(res);
      oauthRedirect(res, "oauth_failed");
      return;
    }

    const stateToken = issueGoogleOAuthState({ secret });
    setGoogleOAuthStateCookie(res, stateToken);

    passport.authenticate("google", {
      scope: ["profile", "email"],
      session: false,
      state: stateToken,
    })(req, res, next);
  } catch (error) {
    logger.error("[OAuth] Failed to start Google OAuth.", {
      error: error instanceof Error ? error.message : String(error),
    });
    clearGoogleOAuthStateCookie(res);
    oauthRedirect(res, "oauth_failed");
  }
}

export function validateGoogleOAuthState(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const stateFromQuery = getGoogleOAuthStateFromQuery(req);
  const stateFromCookie = String(req.cookies?.[GOOGLE_OAUTH_STATE_COOKIE] || "").trim();
  clearGoogleOAuthStateCookie(res);

  if (
    !stateFromQuery ||
    !stateFromCookie ||
    !timingSafeEqualString(stateFromQuery, stateFromCookie)
  ) {
    logger.warn("[OAuth] Google callback state mismatch.");
    oauthRedirect(res, "invalid_state");
    return;
  }

  const secret = resolveGoogleOAuthStateSecret();
  const verification = verifyGoogleOAuthState({
    state: stateFromQuery,
    secret,
    ttlMs: GOOGLE_OAUTH_STATE_TTL_MS,
  });

  if (!verification.ok) {
    logger.warn("[OAuth] Google callback state verification failed.", {
      reason: verification.reason,
    });
    oauthRedirect(res, "invalid_state");
    return;
  }

  next();
}

/**
 * Find or create a user from an OAuth profile, issue session-bound tokens,
 * and redirect to the frontend callback page.
 */
async function handleOAuthUser(
  res: Response,
  profile: {
    googleId?: string;
    appleId?: string;
    email: string;
    emailVerified?: boolean | null;
    displayName?: string;
  },
) {
  try {
    const email = profile.email.trim().toLowerCase();
    if (!email) {
      return res.redirect(`${config.FRONTEND_URL}/a/x7k2m9/c3b?error=no_email`);
    }

    // Find by provider ID first, then by email
    let user = profile.googleId
      ? await prisma.user.findUnique({ where: { googleId: profile.googleId } })
      : profile.appleId
        ? await prisma.user.findUnique({ where: { appleId: profile.appleId } })
        : null;

    if (!user) {
      user = await prisma.user.findUnique({ where: { email } });
    }

    if (user) {
      // Link provider ID if not already set
      const updates: Record<string, string> = {};
      if (profile.googleId && !user.googleId)
        updates.googleId = profile.googleId;
      if (profile.appleId && !user.appleId) updates.appleId = profile.appleId;
      if (!user.isEmailVerified) (updates as any).isEmailVerified = true;
      if (Object.keys(updates).length > 0) {
        await prisma.user.update({ where: { id: user.id }, data: updates });
      }
    } else {
      // Create new user
      const nameParts = (profile.displayName || "").split(" ");
      user = await prisma.user.create({
        data: {
          email,
          firstName: nameParts[0] || null,
          lastName: nameParts.slice(1).join(" ") || null,
          googleId: profile.googleId || null,
          appleId: profile.appleId || null,
          isEmailVerified: true,
          role: "user",
        },
      });
    }

    const twoFactorState = await prisma.twoFactorAuth.findUnique({
      where: { userId: user.id },
      select: { isEnabled: true },
    });

    if (twoFactorState?.isEnabled) {
      const challengeToken = await issueTwoFactorLoginChallenge({
        userId: user.id,
        email: user.email,
      });
      clearAuthCookies(res);
      setTwoFactorChallengeCookie(res, challengeToken);
      return res.redirect(`${config.FRONTEND_URL}/a/x7k2m9/c3b?auth=2fa_required`);
    }

    const { accessToken, refreshToken } = await issueSessionTokensForUser(
      user.id,
      user.email,
    );

    // Set HTTP-only cookies (Safari-resilient)
    clearTwoFactorChallengeCookie(res);
    setAuthCookies(res, accessToken, refreshToken);
    return res.redirect(`${config.FRONTEND_URL}/a/x7k2m9/c3b?auth=ok`);
  } catch (e: any) {
    logger.error("[OAuth] Error handling user.", {
      error: e?.message || String(e),
    });
    return res.redirect(
      `${config.FRONTEND_URL}/a/x7k2m9/c3b?error=oauth_error`,
    );
  }
}

// Lazy controller: resolves AuthService from app.locals on first request
let _ctrl: AuthController | null = null;
function ctrl(req: any): AuthController {
  if (!_ctrl) {
    const svc = req.app?.locals?.services?.auth;
    if (!svc) {
      throw Object.assign(new Error("Authentication service unavailable"), {
        statusCode: 503,
      });
    }
    _ctrl = createAuthController(svc);
  }
  return _ctrl;
}

/**
 * Public (rate-limited with authLimiter — 100/15min, skips successful)
 */
router.post("/signup", authLimiter, validate(authRegisterSchema), (req, res) =>
  ctrl(req).register(req, res),
);
router.post(
  "/register",
  authLimiter,
  validate(authRegisterSchema),
  (req, res) => ctrl(req).register(req, res),
);
router.post("/login", authLimiter, validate(authLoginSchema), (req, res) =>
  ctrl(req).login(req, res),
);
router.post("/refresh", authLimiter, validate(authRefreshSchema), (req, res) =>
  ctrl(req).refresh(req, res),
);

// ---------------------------------------------------------------------------
// Pending-user verification (public, rate-limited)
// ---------------------------------------------------------------------------
router.post(
  "/pending/verify-email",
  authLimiter,
  async (req: Request, res: Response) => {
    try {
      const { email, code } = req.body;
      if (!email || !code)
        return routeErr(
          res,
          "VALIDATION_EMAIL_CODE_REQUIRED",
          "Email and code are required.",
          400,
        );
      const result = await authService.verifyPendingUserEmail(email, code);
      // Set auth cookies if tokens were returned (registration complete)
      if (result.tokens?.accessToken && result.tokens?.refreshToken) {
        setAuthCookies(
          res,
          result.tokens.accessToken,
          result.tokens.refreshToken,
        );
      }
      return res.status(200).json(result);
    } catch (e) {
      return mapServiceError(res, e);
    }
  },
);

router.post(
  "/pending/resend-email",
  authLimiter,
  async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email)
        return routeErr(
          res,
          "VALIDATION_EMAIL_REQUIRED",
          "Email is required.",
          400,
        );
      const result = await authService.resendPendingUserEmail(email);
      return res.status(200).json(result);
    } catch (e) {
      return mapServiceError(res, e);
    }
  },
);

router.post(
  "/pending/add-phone",
  authLimiter,
  async (req: Request, res: Response) => {
    try {
      const { email, phoneNumber } = req.body;
      if (!email || !phoneNumber)
        return routeErr(
          res,
          "VALIDATION_EMAIL_PHONE_REQUIRED",
          "Email and phone number are required.",
          400,
        );
      const result = await authService.addPhoneToPendingUser(
        email,
        phoneNumber,
      );
      return res.status(200).json(result);
    } catch (e) {
      return mapServiceError(res, e);
    }
  },
);

router.post(
  "/pending/verify-phone",
  authLimiter,
  async (req: Request, res: Response) => {
    try {
      const { email, code } = req.body;
      if (!email || !code)
        return routeErr(
          res,
          "VALIDATION_EMAIL_CODE_REQUIRED",
          "Email and code are required.",
          400,
        );
      const result = await authService.verifyPendingUserPhone(email, code);
      // Set auth cookies if tokens were returned (registration complete)
      if (result.tokens?.accessToken && result.tokens?.refreshToken) {
        setAuthCookies(
          res,
          result.tokens.accessToken,
          result.tokens.refreshToken,
        );
      }
      return res.status(200).json(result);
    } catch (e) {
      return mapServiceError(res, e);
    }
  },
);

// ---------------------------------------------------------------------------
// Authenticated user verification
// ---------------------------------------------------------------------------
router.post(
  "/verify/send-email",
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId)
        return routeErr(res, "AUTH_UNAUTHORIZED", "Unauthorized.", 401);
      const result = await authService.sendEmailVerificationCode(userId);
      return res.status(200).json(result);
    } catch (e) {
      return mapServiceError(res, e);
    }
  },
);

router.post(
  "/verify/email",
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const { code } = req.body;
      if (!userId)
        return routeErr(res, "AUTH_UNAUTHORIZED", "Unauthorized.", 401);
      if (!code)
        return routeErr(
          res,
          "VALIDATION_CODE_REQUIRED",
          "Code is required.",
          400,
        );
      const result = await authService.verifyEmailCode(userId, code);
      return res.status(200).json(result);
    } catch (e) {
      return mapServiceError(res, e);
    }
  },
);

router.post(
  "/verify/send-phone",
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const { phoneNumber } = req.body;
      if (!userId)
        return routeErr(res, "AUTH_UNAUTHORIZED", "Unauthorized.", 401);
      if (!phoneNumber)
        return routeErr(
          res,
          "VALIDATION_PHONE_REQUIRED",
          "Phone number is required.",
          400,
        );
      const result = await authService.sendPhoneVerificationCode(
        userId,
        phoneNumber,
      );
      return res.status(200).json(result);
    } catch (e) {
      return mapServiceError(res, e);
    }
  },
);

router.post(
  "/verify/phone",
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const { code } = req.body;
      if (!userId)
        return routeErr(res, "AUTH_UNAUTHORIZED", "Unauthorized.", 401);
      if (!code)
        return routeErr(
          res,
          "VALIDATION_CODE_REQUIRED",
          "Code is required.",
          400,
        );
      const result = await authService.verifyPhoneCode(userId, code);
      return res.status(200).json(result);
    } catch (e) {
      return mapServiceError(res, e);
    }
  },
);

// ---------------------------------------------------------------------------
// 2FA routes
// ---------------------------------------------------------------------------
router.post("/2fa/enable", authenticateToken, twoFactorController.enable2FA);
router.post("/2fa/verify", authenticateToken, twoFactorController.verify2FA);
router.post(
  "/2fa/verify-login",
  twoFactorLimiter,
  async (req: Request, res: Response) => {
    try {
      const twoFactorToken = String((req.body as any)?.token || "").trim();
      const challengeToken = String(
        (req.body as any)?.challengeToken ||
          req.cookies?.koda_2fa_challenge ||
          req.cookies?.[TWO_FACTOR_CHALLENGE_COOKIE] ||
          "",
      ).trim();

      if (!twoFactorToken) {
        return routeErr(
          res,
          "VALIDATION_2FA_TOKEN_REQUIRED",
          "2FA token is required.",
          400,
        );
      }
      if (!challengeToken) {
        return routeErr(
          res,
          "AUTH_2FA_CHALLENGE_REQUIRED",
          "Two-factor challenge is required.",
          401,
        );
      }

      const challenge = await verifyTwoFactorLoginChallenge(challengeToken);
      const verification = await twoFactorService.verify2FALogin(
        challenge.userId,
        twoFactorToken,
      );
      await consumeTwoFactorLoginChallenge(challengeToken);

      const user = await prisma.user.findUnique({
        where: { id: challenge.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
          profileImage: true,
          isEmailVerified: true,
          isPhoneVerified: true,
          googleId: true,
          appleId: true,
          subscriptionTier: true,
          createdAt: true,
        },
      });

      if (!user) {
        throw new Error("User not found");
      }

      const tokens = await issueSessionTokensForUser(user.id, user.email);
      clearTwoFactorChallengeCookie(res);
      setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

      return res.status(200).json({
        user: toPublicUser(user),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        usedBackupCode: Boolean((verification as any)?.usedBackupCode),
      });
    } catch (e) {
      const message =
        e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
      if (message.includes("2fa challenge") || message.includes("challenge")) {
        clearTwoFactorChallengeCookie(res);
      }
      return mapServiceError(res, e);
    }
  },
);
router.post("/2fa/disable", authenticateToken, twoFactorController.disable2FA);
router.get(
  "/2fa/backup-codes",
  authenticateToken,
  twoFactorController.getBackupCodes,
);

// ---------------------------------------------------------------------------
// Password reset (code-based)
// ---------------------------------------------------------------------------
router.post(
  "/forgot-password",
  authLimiter,
  async (req: Request, res: Response) => {
    try {
      const { email, phoneNumber } = req.body;
      if (!email && !phoneNumber)
        return routeErr(
          res,
          "VALIDATION_EMAIL_OR_PHONE_REQUIRED",
          "Email or phone number is required.",
          400,
        );
      const result = await authService.requestPasswordReset({
        email,
        phoneNumber,
      });
      return res.status(200).json(result);
    } catch (e) {
      return mapServiceError(res, e);
    }
  },
);

router.post(
  "/verify-reset-code",
  twoFactorLimiter,
  async (req: Request, res: Response) => {
    try {
      const { email, phoneNumber, code } = req.body;
      if (!code)
        return routeErr(
          res,
          "VALIDATION_CODE_REQUIRED",
          "Code is required.",
          400,
        );
      const result = await authService.verifyPasswordResetCode({
        email,
        phoneNumber,
        code,
      });
      return res.status(200).json(result);
    } catch (e) {
      return mapServiceError(res, e);
    }
  },
);

router.post(
  "/reset-password",
  authLimiter,
  async (req: Request, res: Response) => {
    try {
      const { email, phoneNumber, code, newPassword } = req.body;
      if (!code || !newPassword)
        return routeErr(
          res,
          "VALIDATION_RESET_INPUT_REQUIRED",
          "Code and new password are required.",
          400,
        );
      const result = await authService.resetPassword({
        email,
        phoneNumber,
        code,
        newPassword,
      });
      return res.status(200).json(result);
    } catch (e) {
      return mapServiceError(res, e);
    }
  },
);

// ---------------------------------------------------------------------------
// Password reset (link-based)
// ---------------------------------------------------------------------------
router.post(
  "/forgot-password-init",
  authLimiter,
  async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email)
        return routeErr(
          res,
          "VALIDATION_EMAIL_REQUIRED",
          "Email is required.",
          400,
        );
      const result = await authService.initiateForgotPassword(email);
      return res.status(200).json(result);
    } catch (e) {
      return mapServiceError(res, e);
    }
  },
);

router.post(
  "/send-reset-link",
  authLimiter,
  async (req: Request, res: Response) => {
    try {
      const { sessionToken, method } = req.body;
      if (!sessionToken || !method)
        return routeErr(
          res,
          "VALIDATION_RESET_METHOD_REQUIRED",
          "Session token and method are required.",
          400,
        );
      const result = await authService.sendResetLink(sessionToken, method);
      return res.status(200).json(result);
    } catch (e) {
      return mapServiceError(res, e);
    }
  },
);

router.post(
  "/reset-password-with-token",
  authLimiter,
  async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword)
        return routeErr(
          res,
          "VALIDATION_RESET_TOKEN_REQUIRED",
          "Token and new password are required.",
          400,
        );
      const result = await authService.resetPasswordWithToken(
        token,
        newPassword,
      );
      return res.status(200).json(result);
    } catch (e) {
      return mapServiceError(res, e);
    }
  },
);

/**
 * Session
 */
router.post("/logout", optionalAuth, (req, res) => ctrl(req).logout(req, res));
router.get("/me", authenticateToken, (req, res) => ctrl(req).me(req, res));
router.get("/session/bootstrap", authenticateToken, (req, res) =>
  ctrl(req).me(req, res),
);

/**
 * Google OAuth
 */
router.get(
  "/google",
  authLimiter,
  startGoogleOAuth,
);

router.get(
  "/google/callback",
  validateGoogleOAuthState,
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${config.FRONTEND_URL}/a/x7k2m9/c3b?error=oauth_failed`,
  }),
  (req: Request, res: Response) => {
    const profile = req.user as
      | {
          id: string;
          email: string;
          emailVerified?: boolean | null;
          displayName?: string;
        }
      | undefined;
    if (!profile?.email) {
      return res.redirect(`${config.FRONTEND_URL}/a/x7k2m9/c3b?error=no_email`);
    }
    if (profile.emailVerified === false) {
      return res.redirect(
        `${config.FRONTEND_URL}/a/x7k2m9/c3b?error=email_not_verified`,
      );
    }
    return handleOAuthUser(res, {
      googleId: profile.id,
      email: profile.email,
      emailVerified: profile.emailVerified,
      displayName: profile.displayName,
    });
  },
);

/**
 * Apple OAuth
 * Apple sends a POST to the callback URL (response_mode=form_post).
 */
router.get("/apple", authLimiter, (_req: Request, res: Response) => {
  if (!config.APPLE_CLIENT_ID || !config.APPLE_CALLBACK_URL) {
    return res.redirect(
      `${config.FRONTEND_URL}/a/x7k2m9/c3b?error=apple_not_configured`,
    );
  }

  const stateSecret = resolveGoogleOAuthStateSecret();
  if (!stateSecret) {
    logger.error("[Apple OAuth] State secret is missing.");
    clearAppleOAuthStateCookie(res);
    return res.redirect(`${config.FRONTEND_URL}/a/x7k2m9/c3b?error=oauth_failed`);
  }

  const nonce = crypto.randomUUID();
  const stateToken = issueAppleOAuthState({
    secret: stateSecret,
    nonce,
  });
  setAppleOAuthStateCookie(res, stateToken);

  const params = new URLSearchParams({
    client_id: config.APPLE_CLIENT_ID,
    redirect_uri: config.APPLE_CALLBACK_URL,
    response_type: "code id_token",
    scope: "name email",
    response_mode: "form_post",
    state: stateToken,
    nonce: nonce,
  });

  return res.redirect(
    `https://appleid.apple.com/auth/authorize?${params.toString()}`,
  );
});

router.post(
  "/apple/callback",
  authLimiter,
  async (req: Request, res: Response) => {
    try {
      const { id_token, user: appleUser } = req.body as {
        id_token?: string;
        user?: string;
        code?: string;
      };
      const stateFromRequest = getAppleOAuthState(req);
      const stateFromCookie = String(
        req.cookies?.[APPLE_OAUTH_STATE_COOKIE] || "",
      ).trim();
      clearAppleOAuthStateCookie(res);

      if (!id_token) {
        return res.redirect(
          `${config.FRONTEND_URL}/a/x7k2m9/c3b?error=oauth_failed`,
        );
      }

      if (
        !stateFromRequest ||
        !stateFromCookie ||
        !timingSafeEqualString(stateFromRequest, stateFromCookie)
      ) {
        logger.warn("[Apple OAuth] Callback state mismatch.");
        return res.redirect(
          `${config.FRONTEND_URL}/a/x7k2m9/c3b?error=invalid_state`,
        );
      }

      const stateSecret = resolveGoogleOAuthStateSecret();
      const stateVerification = verifyAppleOAuthState({
        state: stateFromRequest,
        secret: stateSecret,
        ttlMs: APPLE_OAUTH_STATE_TTL_MS,
      });
      if (!stateVerification.ok) {
        logger.warn("[Apple OAuth] Callback state verification failed.", {
          reason: stateVerification.reason,
        });
        return res.redirect(
          `${config.FRONTEND_URL}/a/x7k2m9/c3b?error=invalid_state`,
        );
      }

      const claims = await verifyAppleIdToken({
        idToken: id_token,
        clientId: config.APPLE_CLIENT_ID,
        expectedNonce: stateVerification.payload.nonce,
      });

      const appleId = claims.sub;
      const email = String(claims.email || "").trim().toLowerCase();

      if (!email) {
        return res.redirect(
          `${config.FRONTEND_URL}/a/x7k2m9/c3b?error=no_email`,
        );
      }

      // Apple only sends the user's name on the FIRST authorization
      let displayName: string | undefined;
      if (appleUser) {
        try {
          const parsed =
            typeof appleUser === "string" ? JSON.parse(appleUser) : appleUser;
          const first = parsed?.name?.firstName || "";
          const last = parsed?.name?.lastName || "";
          displayName = [first, last].filter(Boolean).join(" ") || undefined;
        } catch {
          /* ignore parse errors */
        }
      }

      return handleOAuthUser(res, { appleId, email, displayName });
    } catch (e: any) {
      logger.error("[Apple OAuth] Error.", {
        error: e?.message || String(e),
      });
      return res.redirect(
        `${config.FRONTEND_URL}/a/x7k2m9/c3b?error=oauth_error`,
      );
    }
  },
);

/**
 * Health / readiness (optional)
 */
router.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

/**
 * Error boundary (router-level)
 * Keep it minimal: forward to global error handler
 */
router.use(
  (err: unknown, _req: Request, _res: Response, next: NextFunction) => {
    next(err);
  },
);

export default router;
