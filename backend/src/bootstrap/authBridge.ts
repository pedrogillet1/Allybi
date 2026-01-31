// src/bootstrap/authBridge.ts
/**
 * Auth Bridge
 *
 * Implements the controller's AuthService interface using Prisma + JWT utils.
 * This bridges the gap between the clean DI-based AuthAppService design
 * and the actual infrastructure (Prisma models, JWT helpers).
 *
 * Security hardening:
 * - HMAC-SHA256 with pepper for refresh token hashing (not bare SHA-256)
 * - Session-bound access tokens (sid + sv claims in JWT)
 * - Refresh token reuse detection: if a consumed token is replayed, ALL
 *   sessions for that user are revoked (theft assumption)
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../config/database';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt';
import type { AuthService } from '../controllers/auth.controller';

const BCRYPT_ROUNDS = 12;

/**
 * HMAC-SHA256 with a server-side pepper.
 * The pepper is a separate secret from the JWT signing keys —
 * if the DB is compromised the hashes are still uncrackable without it.
 */
const REFRESH_TOKEN_PEPPER = process.env.KODA_REFRESH_PEPPER || process.env.JWT_REFRESH_SECRET || '';

function hmacSha256(input: string): string {
  return crypto.createHmac('sha256', REFRESH_TOKEN_PEPPER).update(input).digest('hex');
}

/** Backward-compatible: plain SHA-256 (for sessions created before HMAC migration) */
function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function createAuthService(): AuthService {
  return {
    async register(input) {
      const email = input.email.trim().toLowerCase();

      // Check for existing user
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        throw new Error('Email already exists');
      }

      // Hash password
      const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
      const passwordHash = await bcrypt.hash(input.password, salt);

      // Parse name into firstName/lastName
      let firstName: string | null = null;
      let lastName: string | null = null;
      if (input.name) {
        const nameParts = input.name.trim().split(/\s+/);
        firstName = nameParts[0] || null;
        lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;
      }

      // Delete any existing pending user with same email
      await prisma.pendingUser.deleteMany({ where: { email } });

      // Generate 6-digit email verification code
      const emailCode = crypto.randomInt(100000, 999999).toString();

      // Create pending user (10-minute code expiry)
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);

      await prisma.pendingUser.create({
        data: {
          email,
          passwordHash,
          salt,
          firstName,
          lastName,
          emailCode,
          expiresAt,
          recoveryKeyHash: input.recoveryKeyHash ?? null,
          masterKeyEncrypted: input.masterKeyEncrypted ?? null,
        },
      });

      console.log(`Pending user created: ${email}`);

      // Send verification email
      try {
        const emailService = await import('../services/email.service');
        await emailService.sendVerificationCodeEmail(email, emailCode);
        console.log(`Verification code sent to ${email}`);
      } catch (error) {
        console.error('Failed to send verification email:', error);
        console.log(`[DEV MODE] Verification code for ${email}: ${emailCode}`);
      }

      // Return requiresVerification (no tokens yet)
      return {
        requiresVerification: true,
        email,
        message: 'Please verify your email to complete registration',
      };
    },

    async login(input) {
      const email = input.email.trim().toLowerCase();

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash) {
        throw new Error('Invalid credentials');
      }

      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        throw new Error('Invalid credentials');
      }

      // Generate tokens
      const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

      // Store session
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

      return {
        user: {
          id: user.id,
          email: user.email,
          name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          profileImage: user.profileImage,
          isEmailVerified: user.isEmailVerified,
          isPhoneVerified: user.isPhoneVerified,
          isOAuth: !!(user.googleId || user.appleId),
          subscriptionTier: user.subscriptionTier,
          createdAt: user.createdAt.toISOString(),
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      };
    },

    async refresh(input) {
      // Verify the refresh token JWT
      let payload;
      try {
        payload = verifyRefreshToken(input.refreshToken);
      } catch {
        throw new Error('Refresh token invalid or expired');
      }

      // Try HMAC hash first (new sessions), then fall back to SHA-256 (legacy)
      const hmacHash = hmacSha256(input.refreshToken);
      const legacyHash = sha256(input.refreshToken);

      let session = await prisma.session.findFirst({
        where: {
          refreshTokenHash: hmacHash,
          isActive: true,
          expiresAt: { gt: new Date() },
        },
      });

      // Fallback: check legacy SHA-256 hash
      if (!session) {
        session = await prisma.session.findFirst({
          where: {
            refreshTokenHash: legacyHash,
            isActive: true,
            expiresAt: { gt: new Date() },
          },
        });
      }

      if (!session) {
        // ── Reuse detection ──────────────────────────────────────────────
        // If the token is valid JWT but no active session matches, it may be
        // a replayed token from a previous rotation. Look for any *inactive*
        // session with this hash — if found, assume token theft and revoke
        // ALL sessions for this user.
        const staleSession = await prisma.session.findFirst({
          where: {
            OR: [
              { refreshTokenHash: hmacHash },
              { refreshTokenHash: legacyHash },
            ],
            isActive: false,
          },
        });

        if (staleSession) {
          // Revoke every session for this user (nuclear option — theft assumed)
          await prisma.session.updateMany({
            where: { userId: staleSession.userId, isActive: true },
            data: { isActive: false, revokedAt: new Date() },
          });
        }

        throw new Error('Refresh token invalid or expired');
      }

      // Fetch user
      const user = await prisma.user.findUnique({ where: { id: session.userId } });
      if (!user) {
        throw new Error('User not found');
      }

      // Rotate: deactivate old session, create new one
      const newRefreshToken = generateRefreshToken({ userId: user.id, email: user.email });

      const [, newSession] = await prisma.$transaction([
        prisma.session.update({
          where: { id: session.id },
          data: { isActive: false },
        }),
        prisma.session.create({
          data: {
            userId: user.id,
            refreshTokenHash: hmacSha256(newRefreshToken),
            tokenVersion: 1,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            isActive: true,
          },
        }),
      ]);

      const newAccessToken = generateAccessToken({
        userId: user.id,
        email: user.email,
        sid: newSession.id,
        sv: newSession.tokenVersion,
      });

      return {
        tokens: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
      };
    },

    async logout(input) {
      if (input.refreshToken) {
        const hmacHash = hmacSha256(input.refreshToken);
        const legacyHash = sha256(input.refreshToken);
        await prisma.session.updateMany({
          where: {
            OR: [
              { refreshTokenHash: hmacHash },
              { refreshTokenHash: legacyHash },
            ],
          },
          data: { isActive: false, revokedAt: new Date() },
        });
      } else if (input.userId) {
        // Revoke all sessions for this user
        await prisma.session.updateMany({
          where: { userId: input.userId },
          data: { isActive: false, revokedAt: new Date() },
        });
      }
    },

    async me(input) {
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
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
        throw new Error('User not found');
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          profileImage: user.profileImage,
          isEmailVerified: user.isEmailVerified,
          isPhoneVerified: user.isPhoneVerified,
          isOAuth: !!(user.googleId || user.appleId),
          subscriptionTier: user.subscriptionTier,
          createdAt: user.createdAt.toISOString(),
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Verification Code Utilities
// ---------------------------------------------------------------------------

/**
 * Issue a verification code: stores SHA-256 hash in DB, returns raw token.
 */
export async function issueVerificationCode(
  userId: string,
  type: string,
  expiresInMs = 15 * 60 * 1000,
): Promise<string> {
  const rawCode = crypto.randomBytes(32).toString('hex');
  const hashedCode = sha256(rawCode);

  await prisma.verificationCode.create({
    data: {
      userId,
      type,
      code: hashedCode,
      expiresAt: new Date(Date.now() + expiresInMs),
    },
  });

  return rawCode;
}

/**
 * Consume a verification code: hashes input, looks up by user/type,
 * uses constant-time comparison, enforces attempt limits.
 */
export async function consumeVerificationCode(
  userId: string,
  type: string,
  rawCode: string,
): Promise<boolean> {
  const hashedCode = sha256(rawCode);

  // Find the most recent active code for this user/type
  const record = await prisma.verificationCode.findFirst({
    where: {
      userId,
      type,
      isUsed: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) return false;

  // Check attempt limit
  if (record.attempts >= record.maxAttempts) {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { isUsed: true },
    });
    return false;
  }

  // Constant-time comparison (defense in depth)
  const expected = Buffer.from(record.code, 'utf-8');
  const provided = Buffer.from(hashedCode, 'utf-8');

  let isValid = false;
  if (expected.length === provided.length) {
    isValid = crypto.timingSafeEqual(expected, provided);
  }

  if (isValid) {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { isUsed: true },
    });
    return true;
  }

  // Increment attempt counter on failure; lock out if max reached
  const newAttempts = record.attempts + 1;
  await prisma.verificationCode.update({
    where: { id: record.id },
    data: {
      attempts: newAttempts,
      ...(newAttempts >= record.maxAttempts ? { isUsed: true } : {}),
    },
  });
  return false;
}
