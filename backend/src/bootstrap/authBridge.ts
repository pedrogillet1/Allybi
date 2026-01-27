// src/bootstrap/authBridge.ts
/**
 * Auth Bridge
 *
 * Implements the controller's AuthService interface using Prisma + JWT utils.
 * This bridges the gap between the clean DI-based AuthAppService design
 * and the actual infrastructure (Prisma models, JWT helpers).
 *
 * Once full repository implementations exist, this can delegate to AuthAppService.
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

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          salt,
          firstName: input.name ?? null,
          role: 'user',
          isEmailVerified: false,
        },
      });

      // Generate tokens
      const accessToken = generateAccessToken({ userId: user.id, email: user.email });
      const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

      // Store session with hashed refresh token
      await prisma.session.create({
        data: {
          userId: user.id,
          refreshTokenHash: sha256(refreshToken),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          isActive: true,
        },
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.firstName,
          createdAt: user.createdAt.toISOString(),
        },
        tokens: {
          accessToken,
          refreshToken,
        },
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
      const accessToken = generateAccessToken({ userId: user.id, email: user.email });
      const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

      // Store session
      await prisma.session.create({
        data: {
          userId: user.id,
          refreshTokenHash: sha256(refreshToken),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          isActive: true,
        },
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.firstName,
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

      // Find the active session by hash
      const tokenHash = sha256(input.refreshToken);
      const session = await prisma.session.findFirst({
        where: {
          refreshTokenHash: tokenHash,
          isActive: true,
          expiresAt: { gt: new Date() },
        },
      });

      if (!session) {
        throw new Error('Refresh token invalid or expired');
      }

      // Fetch user
      const user = await prisma.user.findUnique({ where: { id: session.userId } });
      if (!user) {
        throw new Error('User not found');
      }

      // Rotate: deactivate old session, create new one
      const newAccessToken = generateAccessToken({ userId: user.id, email: user.email });
      const newRefreshToken = generateRefreshToken({ userId: user.id, email: user.email });

      await prisma.$transaction([
        prisma.session.update({
          where: { id: session.id },
          data: { isActive: false },
        }),
        prisma.session.create({
          data: {
            userId: user.id,
            refreshTokenHash: sha256(newRefreshToken),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            isActive: true,
          },
        }),
      ]);

      return {
        tokens: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
      };
    },

    async logout(input) {
      if (input.refreshToken) {
        const tokenHash = sha256(input.refreshToken);
        await prisma.session.updateMany({
          where: { refreshTokenHash: tokenHash },
          data: { isActive: false },
        });
      } else if (input.userId) {
        // Revoke all sessions for this user
        await prisma.session.updateMany({
          where: { userId: input.userId },
          data: { isActive: false },
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
          createdAt: user.createdAt.toISOString(),
        },
      };
    },
  };
}
