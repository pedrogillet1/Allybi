// src/routes/auth.routes.ts
//
// Clean auth routes for Koda (Express).
// - Thin router: no business logic here
// - Controllers/services handle validation + persistence + security
// - No user-facing microcopy hardcoded here (return reason codes / structured errors)

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import passport from "../config/passport";

import {
  authenticateToken,
  optionalAuth,
} from "../middleware/auth.middleware";

import { authLimiter, twoFactorLimiter } from "../middleware/rateLimit.middleware";

import { AuthController, createAuthController } from "../controllers/auth.controller";
import { validate } from "../middleware/validate.middleware";
import {
  authRegisterSchema,
  authLoginSchema,
  authRefreshSchema,
} from "../schemas/request.schemas";

import prisma from "../config/database";
import { config } from "../config/env";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt";
import { setAuthCookies } from "../utils/authCookies";

import * as authService from "../services/auth.service";
import * as twoFactorController from "../controllers/twoFactor.controller";

const router = Router();

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------

const REFRESH_TOKEN_PEPPER = process.env.KODA_REFRESH_PEPPER || process.env.JWT_REFRESH_SECRET || '';
const AUTH_URL_TOKEN_COMPAT = process.env.AUTH_URL_TOKEN_COMPAT === 'true';

function hmacSha256(input: string): string {
  return crypto.createHmac('sha256', REFRESH_TOKEN_PEPPER).update(input).digest('hex');
}

/**
 * Find or create a user from an OAuth profile, issue session-bound tokens,
 * and redirect to the frontend callback page.
 */
async function handleOAuthUser(
  res: Response,
  profile: { googleId?: string; appleId?: string; email: string; displayName?: string },
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
      if (profile.googleId && !user.googleId) updates.googleId = profile.googleId;
      if (profile.appleId && !user.appleId) updates.appleId = profile.appleId;
      if (!user.isEmailVerified) (updates as any).isEmailVerified = true;
      if (Object.keys(updates).length > 0) {
        await prisma.user.update({ where: { id: user.id }, data: updates });
      }
    } else {
      // Create new user
      const nameParts = (profile.displayName || '').split(' ');
      user = await prisma.user.create({
        data: {
          email,
          firstName: nameParts[0] || null,
          lastName: nameParts.slice(1).join(' ') || null,
          googleId: profile.googleId || null,
          appleId: profile.appleId || null,
          isEmailVerified: true,
          role: 'user',
        },
      });
    }

    // Issue session + tokens (same pattern as authBridge.ts)
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: hmacSha256(refreshToken),
        tokenVersion: 1,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isActive: true,
      },
    });
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      sid: session.id,
      sv: session.tokenVersion,
    });

    // Set HTTP-only cookies (Safari-resilient)
    setAuthCookies(res, accessToken, refreshToken);
    if (AUTH_URL_TOKEN_COMPAT) {
      // Temporary compatibility mode for older frontend builds.
      const params = new URLSearchParams({ accessToken, refreshToken, auth: 'ok' });
      return res.redirect(`${config.FRONTEND_URL}/a/x7k2m9/c3b?${params.toString()}`);
    }
    return res.redirect(`${config.FRONTEND_URL}/a/x7k2m9/c3b?auth=ok`);
  } catch (e: any) {
    console.error('[OAuth] Error handling user:', e?.message || e);
    return res.redirect(`${config.FRONTEND_URL}/a/x7k2m9/c3b?error=oauth_error`);
  }
}

// Lazy controller: resolves AuthService from app.locals on first request
let _ctrl: AuthController | null = null;
function ctrl(req: any): AuthController {
  if (!_ctrl) {
    const svc = req.app?.locals?.services?.auth;
    if (!svc) {
      throw Object.assign(new Error('AuthService not wired'), { statusCode: 503 });
    }
    _ctrl = createAuthController(svc);
  }
  return _ctrl;
}

/**
 * Public (rate-limited with authLimiter — 100/15min, skips successful)
 */
router.post("/signup", authLimiter, validate(authRegisterSchema), (req, res) => ctrl(req).register(req, res));
router.post("/register", authLimiter, validate(authRegisterSchema), (req, res) => ctrl(req).register(req, res));
router.post("/login", authLimiter, validate(authLoginSchema), (req, res) => ctrl(req).login(req, res));
router.post("/refresh", authLimiter, validate(authRefreshSchema), (req, res) => ctrl(req).refresh(req, res));

// ---------------------------------------------------------------------------
// Pending-user verification (public, rate-limited)
// ---------------------------------------------------------------------------
router.post("/pending/verify-email", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: "Email and code are required" });
    const result = await authService.verifyPendingUserEmail(email, code);
    // Set auth cookies if tokens were returned (registration complete)
    if (result.tokens?.accessToken && result.tokens?.refreshToken) {
      setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken);
    }
    return res.status(200).json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

router.post("/pending/resend-email", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });
    const result = await authService.resendPendingUserEmail(email);
    return res.status(200).json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

router.post("/pending/add-phone", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber } = req.body;
    if (!email || !phoneNumber) return res.status(400).json({ error: "Email and phone number are required" });
    const result = await authService.addPhoneToPendingUser(email, phoneNumber);
    return res.status(200).json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

router.post("/pending/verify-phone", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: "Email and code are required" });
    const result = await authService.verifyPendingUserPhone(email, code);
    // Set auth cookies if tokens were returned (registration complete)
    if (result.tokens?.accessToken && result.tokens?.refreshToken) {
      setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken);
    }
    return res.status(200).json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Authenticated user verification
// ---------------------------------------------------------------------------
router.post("/verify/send-email", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const result = await authService.sendEmailVerificationCode(userId);
    return res.status(200).json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

router.post("/verify/email", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { code } = req.body;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!code) return res.status(400).json({ error: "Code is required" });
    const result = await authService.verifyEmailCode(userId, code);
    return res.status(200).json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

router.post("/verify/send-phone", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { phoneNumber } = req.body;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!phoneNumber) return res.status(400).json({ error: "Phone number is required" });
    const result = await authService.sendPhoneVerificationCode(userId, phoneNumber);
    return res.status(200).json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

router.post("/verify/phone", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { code } = req.body;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!code) return res.status(400).json({ error: "Code is required" });
    const result = await authService.verifyPhoneCode(userId, code);
    return res.status(200).json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// 2FA routes
// ---------------------------------------------------------------------------
router.post("/2fa/enable", authenticateToken, twoFactorController.enable2FA);
router.post("/2fa/verify", authenticateToken, twoFactorController.verify2FA);
router.post("/2fa/verify-login", twoFactorLimiter, twoFactorController.verify2FALogin);
router.post("/2fa/disable", authenticateToken, twoFactorController.disable2FA);
router.get("/2fa/backup-codes", authenticateToken, twoFactorController.getBackupCodes);

// ---------------------------------------------------------------------------
// Password reset (code-based)
// ---------------------------------------------------------------------------
router.post("/forgot-password", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber } = req.body;
    if (!email && !phoneNumber) return res.status(400).json({ error: "Email or phone number is required" });
    const result = await authService.requestPasswordReset({ email, phoneNumber });
    return res.status(200).json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

router.post("/verify-reset-code", twoFactorLimiter, async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber, code } = req.body;
    if (!code) return res.status(400).json({ error: "Code is required" });
    const result = await authService.verifyPasswordResetCode({ email, phoneNumber, code });
    return res.status(200).json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

router.post("/reset-password", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber, code, newPassword } = req.body;
    if (!code || !newPassword) return res.status(400).json({ error: "Code and new password are required" });
    const result = await authService.resetPassword({ email, phoneNumber, code, newPassword });
    return res.status(200).json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Password reset (link-based)
// ---------------------------------------------------------------------------
router.post("/forgot-password-init", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });
    const result = await authService.initiateForgotPassword(email);
    return res.status(200).json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

router.post("/send-reset-link", authLimiter, async (req: Request, res: Response) => {
  try {
    const { sessionToken, method } = req.body;
    if (!sessionToken || !method) return res.status(400).json({ error: "Session token and method are required" });
    const result = await authService.sendResetLink(sessionToken, method);
    return res.status(200).json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

router.post("/reset-password-with-token", authLimiter, async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: "Token and new password are required" });
    const result = await authService.resetPasswordWithToken(token, newPassword);
    return res.status(200).json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

/**
 * Session
 */
router.post("/logout", optionalAuth, (req, res) => ctrl(req).logout(req, res));
router.get("/me", authenticateToken, (req, res) => ctrl(req).me(req, res));
router.get("/session/bootstrap", authenticateToken, (req, res) => ctrl(req).me(req, res));

/**
 * Google OAuth
 */
router.get("/google", authLimiter, passport.authenticate("google", {
  scope: ["profile", "email"],
  session: false,
}));

router.get("/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: `${config.FRONTEND_URL}/a/x7k2m9/c3b?error=oauth_failed` }),
  (req: Request, res: Response) => {
    const profile = req.user as { id: string; email: string; displayName?: string } | undefined;
    if (!profile?.email) {
      return res.redirect(`${config.FRONTEND_URL}/a/x7k2m9/c3b?error=no_email`);
    }
    return handleOAuthUser(res, {
      googleId: profile.id,
      email: profile.email,
      displayName: profile.displayName,
    });
  }
);

/**
 * Apple OAuth
 * Apple sends a POST to the callback URL (not GET).
 * Uses the `id_token` from Apple's response to extract user info.
 */
router.get("/apple", authLimiter, (_req: Request, res: Response) => {
  if (!config.APPLE_CLIENT_ID) {
    return res.redirect(`${config.FRONTEND_URL}/a/x7k2m9/c3b?error=apple_not_configured`);
  }

  const params = new URLSearchParams({
    client_id: config.APPLE_CLIENT_ID,
    redirect_uri: config.APPLE_CALLBACK_URL,
    response_type: 'code id_token',
    scope: 'name email',
    response_mode: 'form_post',
  });

  return res.redirect(`https://appleid.apple.com/auth/authorize?${params.toString()}`);
});

router.post("/apple/callback", authLimiter, async (req: Request, res: Response) => {
  try {
    const { id_token, user: appleUser } = req.body as { id_token?: string; user?: string; code?: string };

    if (!id_token) {
      return res.redirect(`${config.FRONTEND_URL}/a/x7k2m9/c3b?error=oauth_failed`);
    }

    // Decode the id_token (Apple signs it, payload is base64url-encoded JSON)
    const payloadB64 = id_token.split('.')[1];
    if (!payloadB64) {
      return res.redirect(`${config.FRONTEND_URL}/a/x7k2m9/c3b?error=oauth_failed`);
    }
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const appleId = payload.sub as string;
    const email = (payload.email as string) || '';

    if (!email) {
      return res.redirect(`${config.FRONTEND_URL}/a/x7k2m9/c3b?error=no_email`);
    }

    // Apple only sends the user's name on the FIRST authorization
    let displayName: string | undefined;
    if (appleUser) {
      try {
        const parsed = typeof appleUser === 'string' ? JSON.parse(appleUser) : appleUser;
        const first = parsed?.name?.firstName || '';
        const last = parsed?.name?.lastName || '';
        displayName = [first, last].filter(Boolean).join(' ') || undefined;
      } catch { /* ignore parse errors */ }
    }

    return handleOAuthUser(res, { appleId, email, displayName });
  } catch (e: any) {
    console.error('[Apple OAuth] Error:', e?.message || e);
    return res.redirect(`${config.FRONTEND_URL}/a/x7k2m9/c3b?error=oauth_error`);
  }
});

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
router.use((err: unknown, _req: Request, _res: Response, next: NextFunction) => {
  next(err);
});

export default router;
