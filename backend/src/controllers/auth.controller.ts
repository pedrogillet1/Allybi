import type { Request, Response } from "express";
import { setAuthCookies, clearAuthCookies } from "../utils/authCookies";
import prisma from "../config/database";
import { Prisma } from "@prisma/client";

/**
 * Clean, DI-friendly Auth Controller.
 * - No direct DB access here.
 * - No hardcoded auth logic here.
 * - Routes wire a concrete AuthService implementation into this controller.
 */

/**
 * Log a security audit event (fire-and-forget).
 */
function logSecurityEvent(
  action: string,
  details: Record<string, unknown> = {},
): void {
  const ip = (details.ip as string) || "unknown";
  prisma.auditLog
    .create({
      data: {
        action,
        userId: (details.userId as string) || null,
        ipAddress: ip,
        userAgent: (details.userAgent as string) || null,
        status: action.includes("FAILED") ? "failed" : "success",
        details: JSON.stringify(details),
        createdAt: new Date(),
      },
    })
    .catch(() => {}); // fire-and-forget
}

export type AuthLanguage = "en" | "pt" | "es";

export interface PublicUser {
  id: string;
  email: string;
  name?: string | null;
  createdAt?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresInSec?: number;
}

export interface AuthRegisterResult {
  user?: PublicUser;
  tokens?: AuthTokens;
  requiresVerification?: boolean;
  email?: string;
  message?: string;
}

export interface AuthService {
  register(input: {
    email: string;
    password: string;
    name?: string;
    language?: AuthLanguage;
    recoveryKeyHash?: string;
    masterKeyEncrypted?: string;
  }): Promise<AuthRegisterResult>;

  login(input: {
    email: string;
    password: string;
    language?: AuthLanguage;
  }): Promise<{ user: PublicUser; tokens: AuthTokens }>;

  refresh(input: { refreshToken: string }): Promise<{ tokens: AuthTokens }>;

  logout(input: { refreshToken?: string; userId?: string }): Promise<void>;

  me(input: { userId: string }): Promise<{ user: PublicUser }>;
}

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: { code: string; message: string } };

function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ ok: true, data } satisfies ApiOk<T>);
}

function err(res: Response, code: string, message: string, status = 400) {
  return res
    .status(status)
    .json({ ok: false, error: { code, message } } satisfies ApiErr);
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function getLang(req: Request): AuthLanguage | undefined {
  const h = asString(req.header("x-lang") || req.header("accept-language"));
  if (!h) return undefined;
  if (h.toLowerCase().includes("pt")) return "pt";
  if (h.toLowerCase().includes("es")) return "es";
  return "en";
}

function getUserIdFromReq(req: Request): string | null {
  const anyReq = req as any;
  const userId = anyReq?.user?.id || anyReq?.userId || anyReq?.auth?.userId;
  return typeof userId === "string" && userId.trim() ? userId.trim() : null;
}

function mapServiceError(res: Response, e: unknown) {
  const msg = e instanceof Error ? e.message : "Unknown error";
  const m = msg.toLowerCase();

  // Dependency / infrastructure failures should not be reported as "400 Bad Request".
  // Prisma DB connectivity errors are common in local dev when Postgres isn't running.
  if (
    e instanceof Prisma.PrismaClientInitializationError ||
    m.includes("can't reach database server") ||
    m.includes("could not connect to server") ||
    m.includes("connection refused") ||
    m.includes("econnrefused") ||
    m.includes("etimedout")
  ) {
    return err(
      res,
      "DB_UNAVAILABLE",
      "Database is unavailable. Start local Postgres (docker-compose.dev.yml) or fix DATABASE_URL.",
      503,
    );
  }

  if (m.includes("invalid credentials") || m.includes("wrong password")) {
    return err(
      res,
      "AUTH_INVALID_CREDENTIALS",
      "Invalid email or password.",
      401,
    );
  }

  if (m.includes("email already") || m.includes("already exists")) {
    return err(
      res,
      "AUTH_EMAIL_EXISTS",
      "That email is already registered.",
      409,
    );
  }

  if (
    m.includes("refresh token") &&
    (m.includes("invalid") || m.includes("expired"))
  ) {
    return err(
      res,
      "AUTH_REFRESH_INVALID",
      "Session expired. Please log in again.",
      401,
    );
  }

  if (m.includes("unauthorized") || m.includes("forbidden")) {
    return err(
      res,
      "AUTH_UNAUTHORIZED",
      "You're not authorized for this action.",
      401,
    );
  }

  return err(res, "AUTH_ERROR", msg || "Authentication error.", 400);
}

export class AuthController {
  constructor(private readonly auth: AuthService) {}

  register = async (req: Request, res: Response) => {
    const email = asString((req.body as any)?.email);
    const password = asString((req.body as any)?.password);
    const name = asString((req.body as any)?.name) ?? undefined;
    const recoveryKeyHash =
      asString((req.body as any)?.recoveryKeyHash) ?? undefined;
    const masterKeyEncrypted =
      asString((req.body as any)?.masterKeyEncrypted) ?? undefined;

    if (!email)
      return err(res, "VALIDATION_EMAIL_REQUIRED", "Email is required.", 400);
    if (!password || password.length < 8)
      return err(
        res,
        "VALIDATION_PASSWORD_WEAK",
        "Password must be at least 8 characters.",
        400,
      );

    try {
      const result = await this.auth.register({
        email,
        password,
        name,
        language: getLang(req),
        recoveryKeyHash,
        masterKeyEncrypted,
      });

      // Pending verification flow: return requiresVerification to frontend
      if (result.requiresVerification) {
        return res.status(200).json({
          requiresVerification: true,
          email: result.email,
          message: result.message,
        });
      }

      // Direct registration flow (legacy/fallback): return tokens + set cookies
      if (result.tokens?.accessToken && result.tokens?.refreshToken) {
        setAuthCookies(
          res,
          result.tokens.accessToken,
          result.tokens.refreshToken,
        );
      }
      return res.status(201).json({
        user: result.user,
        accessToken: result.tokens?.accessToken,
        refreshToken: result.tokens?.refreshToken,
      });
    } catch (e) {
      return mapServiceError(res, e);
    }
  };

  login = async (req: Request, res: Response) => {
    const email = asString((req.body as any)?.email);
    const password = asString((req.body as any)?.password);
    const ip =
      req.ip || (req.headers["x-forwarded-for"] as string) || "unknown";
    const userAgent = req.headers["user-agent"] || null;

    if (!email)
      return err(res, "VALIDATION_EMAIL_REQUIRED", "Email is required.", 400);
    if (!password)
      return err(
        res,
        "VALIDATION_PASSWORD_REQUIRED",
        "Password is required.",
        400,
      );

    try {
      const result = await this.auth.login({
        email,
        password,
        language: getLang(req),
      });
      // Log successful login
      logSecurityEvent("LOGIN_SUCCESS", {
        email,
        userId: result.user.id,
        ip,
        userAgent,
      });
      // Flatten: frontend expects { accessToken, refreshToken, user }
      setAuthCookies(
        res,
        result.tokens.accessToken,
        result.tokens.refreshToken!,
      );
      return res.status(200).json({
        user: result.user,
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      });
    } catch (e) {
      // Log failed login attempt
      logSecurityEvent("LOGIN_FAILED", {
        email,
        ip,
        userAgent,
        error: e instanceof Error ? e.message : "Unknown error",
      });
      return mapServiceError(res, e);
    }
  };

  refresh = async (req: Request, res: Response) => {
    // Accept refresh token from body or cookie (Safari fallback)
    const refreshToken =
      asString((req.body as any)?.refreshToken) ||
      (req as any).cookies?.koda_rt ||
      null;

    if (!refreshToken) {
      return err(
        res,
        "VALIDATION_REFRESH_REQUIRED",
        "Refresh token is required.",
        400,
      );
    }

    try {
      const result = await this.auth.refresh({ refreshToken });
      // Set cookies + return JSON
      setAuthCookies(
        res,
        result.tokens.accessToken,
        result.tokens.refreshToken!,
      );
      return res.status(200).json({
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      });
    } catch (e) {
      return mapServiceError(res, e);
    }
  };

  logout = async (req: Request, res: Response) => {
    const refreshToken =
      asString((req.body as any)?.refreshToken) ||
      (req as any).cookies?.koda_rt ||
      undefined;
    const userId = getUserIdFromReq(req) ?? undefined;

    try {
      await this.auth.logout({ refreshToken, userId });
      clearAuthCookies(res);
      return res.status(200).json({ success: true });
    } catch (e) {
      return mapServiceError(res, e);
    }
  };

  me = async (req: Request, res: Response) => {
    const userId = getUserIdFromReq(req);
    if (!userId)
      return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    try {
      const result = await this.auth.me({ userId });
      // Flatten: frontend expects { user }
      return res.status(200).json(result);
    } catch (e) {
      return mapServiceError(res, e);
    }
  };
}

export function createAuthController(authService: AuthService) {
  return new AuthController(authService);
}
