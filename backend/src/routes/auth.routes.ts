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

const router = Router();

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------

const REFRESH_TOKEN_PEPPER = process.env.KODA_REFRESH_PEPPER || process.env.JWT_REFRESH_SECRET || '';

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
      return res.redirect(`${config.FRONTEND_URL}/auth/callback?error=no_email`);
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

    const params = new URLSearchParams({ accessToken, refreshToken });
    return res.redirect(`${config.FRONTEND_URL}/auth/callback?${params.toString()}`);
  } catch (e: any) {
    console.error('[OAuth] Error handling user:', e?.message || e);
    return res.redirect(`${config.FRONTEND_URL}/auth/callback?error=oauth_error`);
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

/**
 * Recovery (public) — stubbed until recovery methods are added to AuthController
 */
router.post("/recovery/start", authLimiter, (_req, res) => res.status(501).json({ ok: false, error: { code: "NOT_IMPLEMENTED", message: "Recovery not implemented" } }));
router.post("/recovery/verify", twoFactorLimiter, (_req, res) => res.status(501).json({ ok: false, error: { code: "NOT_IMPLEMENTED", message: "Recovery not implemented" } }));
router.post("/recovery/reset", authLimiter, (_req, res) => res.status(501).json({ ok: false, error: { code: "NOT_IMPLEMENTED", message: "Recovery not implemented" } }));

/**
 * Session
 */
router.post("/logout", optionalAuth, (req, res) => ctrl(req).logout(req, res));
router.get("/me", authenticateToken, (req, res) => ctrl(req).me(req, res));

/**
 * Google OAuth
 */
router.get("/google", authLimiter, passport.authenticate("google", {
  scope: ["profile", "email"],
  session: false,
}));

router.get("/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: `${config.FRONTEND_URL}/auth/callback?error=oauth_failed` }),
  (req: Request, res: Response) => {
    const profile = req.user as { id: string; email: string; displayName?: string } | undefined;
    if (!profile?.email) {
      return res.redirect(`${config.FRONTEND_URL}/auth/callback?error=no_email`);
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
    return res.redirect(`${config.FRONTEND_URL}/auth/callback?error=apple_not_configured`);
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
      return res.redirect(`${config.FRONTEND_URL}/auth/callback?error=oauth_failed`);
    }

    // Decode the id_token (Apple signs it, payload is base64url-encoded JSON)
    const payloadB64 = id_token.split('.')[1];
    if (!payloadB64) {
      return res.redirect(`${config.FRONTEND_URL}/auth/callback?error=oauth_failed`);
    }
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const appleId = payload.sub as string;
    const email = (payload.email as string) || '';

    if (!email) {
      return res.redirect(`${config.FRONTEND_URL}/auth/callback?error=no_email`);
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
    return res.redirect(`${config.FRONTEND_URL}/auth/callback?error=oauth_error`);
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
