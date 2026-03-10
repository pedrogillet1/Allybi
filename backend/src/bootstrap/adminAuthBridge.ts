import bcrypt from "bcrypt";
import crypto from "crypto";
import prisma from "../config/database";
import {
  generateAdminAccessToken,
  generateAdminRefreshToken,
  verifyAdminRefreshToken,
} from "../utils/adminJwt";
import type { AdminJWTPayload } from "../utils/adminJwt";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function makePayload(admin: {
  id: string;
  username: string;
  role: string;
}): AdminJWTPayload {
  return {
    adminId: admin.id,
    username: admin.username,
    role: admin.role,
    isAdmin: true,
  };
}

export interface AdminAuthService {
  login(input: { username: string; password: string }): Promise<{
    admin: { id: string; username: string; name: string | null; role: string };
    tokens: { accessToken: string; refreshToken: string };
  }>;
  refresh(input: { refreshToken: string }): Promise<{
    tokens: { accessToken: string; refreshToken: string };
  }>;
  logout(input: { refreshToken?: string; adminId?: string }): Promise<void>;
}

export function createAdminAuthService(): AdminAuthService {
  return {
    async login(input) {
      const username = input.username.trim().toLowerCase();
      console.log("[AdminAuth] Login attempt for:", username);

      const admin = await prisma.admin.findUnique({ where: { username } });
      console.log("[AdminAuth] Admin found:", !!admin, admin?.id);
      if (!admin || !admin.passwordHash) {
        console.log("[AdminAuth] No admin or no password hash");
        throw new Error("Invalid credentials");
      }
      if (!admin.isActive) {
        console.log("[AdminAuth] Account disabled");
        throw new Error("Account disabled");
      }

      console.log("[AdminAuth] Comparing password...");
      const valid = await bcrypt.compare(input.password, admin.passwordHash);
      console.log("[AdminAuth] Password valid:", valid);
      if (!valid) {
        throw new Error("Invalid credentials");
      }

      const payload = makePayload(admin);
      const accessToken = generateAdminAccessToken(payload);
      const refreshToken = generateAdminRefreshToken(payload);

      await prisma.$transaction([
        prisma.adminSession.create({
          data: {
            adminId: admin.id,
            refreshTokenHash: sha256(refreshToken),
            expiresAt: new Date(Date.now() + SESSION_TTL_MS),
            isActive: true,
          },
        }),
        prisma.admin.update({
          where: { id: admin.id },
          data: { lastLoginAt: new Date() },
        }),
      ]);

      return {
        admin: {
          id: admin.id,
          username: admin.username,
          name: admin.name,
          role: admin.role,
        },
        tokens: { accessToken, refreshToken },
      };
    },

    async refresh(input) {
      let payload: AdminJWTPayload;
      try {
        payload = verifyAdminRefreshToken(input.refreshToken);
      } catch {
        throw new Error("Refresh token invalid or expired");
      }

      const tokenHash = sha256(input.refreshToken);
      const session = await prisma.adminSession.findFirst({
        where: {
          refreshTokenHash: tokenHash,
          isActive: true,
          expiresAt: { gt: new Date() },
        },
      });

      if (!session) {
        throw new Error("Refresh token invalid or expired");
      }

      const admin = await prisma.admin.findUnique({
        where: { id: session.adminId },
      });
      if (!admin || !admin.isActive) {
        throw new Error("Admin not found or disabled");
      }

      const newPayload = makePayload(admin);
      const newAccessToken = generateAdminAccessToken(newPayload);
      const newRefreshToken = generateAdminRefreshToken(newPayload);

      await prisma.$transaction([
        prisma.adminSession.update({
          where: { id: session.id },
          data: { isActive: false },
        }),
        prisma.adminSession.create({
          data: {
            adminId: admin.id,
            refreshTokenHash: sha256(newRefreshToken),
            expiresAt: new Date(Date.now() + SESSION_TTL_MS),
            isActive: true,
          },
        }),
      ]);

      return {
        tokens: { accessToken: newAccessToken, refreshToken: newRefreshToken },
      };
    },

    async logout(input) {
      if (input.refreshToken) {
        const tokenHash = sha256(input.refreshToken);
        await prisma.adminSession.updateMany({
          where: { refreshTokenHash: tokenHash },
          data: { isActive: false },
        });
      } else if (input.adminId) {
        await prisma.adminSession.updateMany({
          where: { adminId: input.adminId },
          data: { isActive: false },
        });
      }
    },
  };
}
