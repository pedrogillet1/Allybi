import type { Request, Response } from "express";

/**
 * Clean, DI-friendly Auth Controller.
 * - No direct DB access here.
 * - No hardcoded auth logic here.
 * - Routes wire a concrete AuthService implementation into this controller.
 */

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

export interface AuthService {
  register(input: {
    email: string;
    password: string;
    name?: string;
    language?: AuthLanguage;
  }): Promise<{ user: PublicUser; tokens: AuthTokens }>;

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
  return res.status(status).json({ ok: false, error: { code, message } } satisfies ApiErr);
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

  if (m.includes("invalid credentials") || m.includes("wrong password")) {
    return err(res, "AUTH_INVALID_CREDENTIALS", "Invalid email or password.", 401);
  }

  if (m.includes("email already") || m.includes("already exists")) {
    return err(res, "AUTH_EMAIL_EXISTS", "That email is already registered.", 409);
  }

  if (m.includes("refresh token") && (m.includes("invalid") || m.includes("expired"))) {
    return err(res, "AUTH_REFRESH_INVALID", "Session expired. Please log in again.", 401);
  }

  if (m.includes("unauthorized") || m.includes("forbidden")) {
    return err(res, "AUTH_UNAUTHORIZED", "You're not authorized for this action.", 401);
  }

  return err(res, "AUTH_ERROR", msg || "Authentication error.", 400);
}

export class AuthController {
  constructor(private readonly auth: AuthService) {}

  register = async (req: Request, res: Response) => {
    const email = asString((req.body as any)?.email);
    const password = asString((req.body as any)?.password);
    const name = asString((req.body as any)?.name) ?? undefined;

    if (!email) return err(res, "VALIDATION_EMAIL_REQUIRED", "Email is required.", 400);
    if (!password || password.length < 8)
      return err(res, "VALIDATION_PASSWORD_WEAK", "Password must be at least 8 characters.", 400);

    try {
      const result = await this.auth.register({ email, password, name, language: getLang(req) });
      return ok(res, result, 201);
    } catch (e) {
      return mapServiceError(res, e);
    }
  };

  login = async (req: Request, res: Response) => {
    const email = asString((req.body as any)?.email);
    const password = asString((req.body as any)?.password);

    if (!email) return err(res, "VALIDATION_EMAIL_REQUIRED", "Email is required.", 400);
    if (!password) return err(res, "VALIDATION_PASSWORD_REQUIRED", "Password is required.", 400);

    try {
      const result = await this.auth.login({ email, password, language: getLang(req) });
      return ok(res, result, 200);
    } catch (e) {
      return mapServiceError(res, e);
    }
  };

  refresh = async (req: Request, res: Response) => {
    const refreshToken = asString((req.body as any)?.refreshToken);

    if (!refreshToken) {
      return err(res, "VALIDATION_REFRESH_REQUIRED", "Refresh token is required.", 400);
    }

    try {
      const result = await this.auth.refresh({ refreshToken });
      return ok(res, result, 200);
    } catch (e) {
      return mapServiceError(res, e);
    }
  };

  logout = async (req: Request, res: Response) => {
    const refreshToken = asString((req.body as any)?.refreshToken) ?? undefined;
    const userId = getUserIdFromReq(req) ?? undefined;

    try {
      await this.auth.logout({ refreshToken, userId });
      return ok(res, { success: true }, 200);
    } catch (e) {
      return mapServiceError(res, e);
    }
  };

  me = async (req: Request, res: Response) => {
    const userId = getUserIdFromReq(req);
    if (!userId) return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    try {
      const result = await this.auth.me({ userId });
      return ok(res, result, 200);
    } catch (e) {
      return mapServiceError(res, e);
    }
  };
}

export function createAuthController(authService: AuthService) {
  return new AuthController(authService);
}
