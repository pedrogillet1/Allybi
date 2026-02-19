// src/services/app/authApp.service.ts
/**
 * AuthAppService
 * Controller-facing auth facade.
 *
 * Goals:
 * - Keep controllers thin (I/O + status codes only)
 * - Centralize auth logic (signup/login/refresh/logout/password reset)
 * - Avoid DB assumptions by using small repository interfaces
 * - Make token rotation + revocation explicit and testable
 */

import bcrypt from "bcryptjs";
import crypto from "crypto";

export type AuthRole = "user" | "admin";

export interface PublicUser {
  id: string;
  email: string;
  name?: string | null;
  role: AuthRole;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

export interface AuthSession {
  user: PublicUser;
  tokens: AuthTokens;
}

export interface SignupInput {
  email: string;
  password: string;
  name?: string;
  // Optional: allow product to enforce email verification before issuing tokens
  requireEmailVerification?: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
  // Optional metadata for auditing / security
  ip?: string;
  userAgent?: string;
}

export interface RefreshInput {
  refreshToken: string;
  ip?: string;
  userAgent?: string;
}

export interface LogoutInput {
  refreshToken: string;
}

export interface RequestPasswordResetInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

export interface VerifyEmailInput {
  token: string;
}

/** -----------------------------
 * Dependencies (repositories + infra)
 * ----------------------------- */

export interface IUserAuthRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  name?: string | null;
  role: AuthRole;
  emailVerified: boolean;
  createdAt: Date;
}

export interface IUserRepository {
  findByEmail(email: string): Promise<IUserAuthRecord | null>;
  findById(userId: string): Promise<IUserAuthRecord | null>;
  createUser(data: {
    email: string;
    passwordHash: string;
    name?: string | null;
    role?: AuthRole;
    emailVerified?: boolean;
  }): Promise<IUserAuthRecord>;
  setPassword(userId: string, passwordHash: string): Promise<void>;
  setEmailVerified(userId: string, emailVerified: boolean): Promise<void>;
}

export interface IRefreshTokenStore {
  /**
   * Create a refresh token record and return the raw token to the caller.
   * Store should hash it internally (never store raw refresh tokens).
   */
  issue(params: {
    userId: string;
    expiresAt: Date;
    ip?: string;
    userAgent?: string;
  }): Promise<{ refreshToken: string; expiresAt: Date }>;

  /**
   * Validate refresh token (by hash) and return associated userId if valid.
   */
  validate(params: {
    refreshToken: string;
    ip?: string;
    userAgent?: string;
  }): Promise<{
    valid: boolean;
    userId?: string;
    expiresAt?: Date;
    reason?: string;
  }>;

  /**
   * Rotate refresh token: revoke old and issue a new one.
   */
  rotate(params: {
    refreshToken: string;
    newExpiresAt: Date;
    ip?: string;
    userAgent?: string;
  }): Promise<{ refreshToken: string; expiresAt: Date; userId: string }>;

  /**
   * Revoke refresh token (logout).
   */
  revoke(params: { refreshToken: string; reason?: string }): Promise<void>;

  /**
   * Revoke all refresh tokens for a user (password reset).
   */
  revokeAllForUser(userId: string, reason?: string): Promise<void>;
}

export interface IVerificationTokenStore {
  issueEmailVerifyToken(params: {
    userId: string;
    expiresAt: Date;
  }): Promise<string>;
  consumeEmailVerifyToken(
    token: string,
  ): Promise<{ ok: boolean; userId?: string }>;

  issuePasswordResetToken(params: {
    userId: string;
    expiresAt: Date;
  }): Promise<string>;
  consumePasswordResetToken(
    token: string,
  ): Promise<{ ok: boolean; userId?: string }>;
}

export interface IEmailSender {
  sendEmailVerification(params: { to: string; token: string }): Promise<void>;
  sendPasswordReset(params: { to: string; token: string }): Promise<void>;
}

export interface IJwtSigner {
  signAccessToken(
    payload: { sub: string; email: string; role: AuthRole },
    expiresInSeconds: number,
  ): string;
}

export interface IClock {
  now(): Date;
}

export interface AuthAppConfig {
  bcryptCost: number; // e.g. 12
  accessTokenTtlSeconds: number; // e.g. 900 (15m)
  refreshTokenTtlSeconds: number; // e.g. 2592000 (30d)
  emailVerifyTtlSeconds: number; // e.g. 86400 (24h)
  passwordResetTtlSeconds: number; // e.g. 1800 (30m)
  allowLoginWithoutEmailVerification: boolean;
}

/** -----------------------------
 * Errors (controller can map to HTTP)
 * ----------------------------- */

export class AuthError extends Error {
  public readonly code:
    | "INVALID_CREDENTIALS"
    | "EMAIL_ALREADY_EXISTS"
    | "EMAIL_NOT_VERIFIED"
    | "WEAK_PASSWORD"
    | "INVALID_TOKEN"
    | "USER_NOT_FOUND"
    | "PASSWORD_NOT_SET";
  public readonly status: number;

  constructor(code: AuthError["code"], message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** -----------------------------
 * Service
 * ----------------------------- */

export class AuthAppService {
  constructor(
    private readonly users: IUserRepository,
    private readonly refreshTokens: IRefreshTokenStore,
    private readonly verificationTokens: IVerificationTokenStore,
    private readonly emailSender: IEmailSender,
    private readonly jwt: IJwtSigner,
    private readonly clock: IClock,
    private readonly cfg: AuthAppConfig,
  ) {}

  async signup(input: SignupInput): Promise<AuthSession> {
    const email = normalizeEmail(input.email);
    const password = input.password;

    enforcePasswordPolicy(password);

    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new AuthError(
        "EMAIL_ALREADY_EXISTS",
        "Email is already registered.",
        409,
      );
    }

    const passwordHash = await bcrypt.hash(password, this.cfg.bcryptCost);
    const created = await this.users.createUser({
      email,
      passwordHash,
      name: input.name ?? null,
      role: "user",
      emailVerified: false,
    });

    // Optionally send verification email
    const verifyToken = await this.verificationTokens.issueEmailVerifyToken({
      userId: created.id,
      expiresAt: addSeconds(this.clock.now(), this.cfg.emailVerifyTtlSeconds),
    });

    // Fire and forget is okay *if* you have a queue; here we await for determinism.
    await this.emailSender.sendEmailVerification({
      to: created.email,
      token: verifyToken,
    });

    // If product requires verification, return session without tokens (or limited token).
    const requireVerify =
      input.requireEmailVerification ??
      !this.cfg.allowLoginWithoutEmailVerification;
    if (requireVerify) {
      // Return a "session" with empty tokens to keep the contract stable
      return {
        user: toPublicUser(created),
        tokens: {
          accessToken: "",
          refreshToken: "",
          accessTokenExpiresAt: "",
          refreshTokenExpiresAt: "",
        },
      };
    }

    return this.issueSession(created, { ip: undefined, userAgent: undefined });
  }

  async login(input: LoginInput): Promise<AuthSession> {
    const email = normalizeEmail(input.email);
    const user = await this.users.findByEmail(email);

    // Do not leak whether account exists
    if (!user || !user.passwordHash) {
      throw new AuthError(
        "INVALID_CREDENTIALS",
        "Invalid email or password.",
        401,
      );
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new AuthError(
        "INVALID_CREDENTIALS",
        "Invalid email or password.",
        401,
      );
    }

    if (!user.emailVerified && !this.cfg.allowLoginWithoutEmailVerification) {
      throw new AuthError(
        "EMAIL_NOT_VERIFIED",
        "Email must be verified before logging in.",
        403,
      );
    }

    return this.issueSession(user, {
      ip: input.ip,
      userAgent: input.userAgent,
    });
  }

  async refresh(input: RefreshInput): Promise<AuthSession> {
    const validation = await this.refreshTokens.validate({
      refreshToken: input.refreshToken,
      ip: input.ip,
      userAgent: input.userAgent,
    });

    if (!validation.valid || !validation.userId) {
      throw new AuthError(
        "INVALID_TOKEN",
        "Refresh token is invalid or expired.",
        401,
      );
    }

    const user = await this.users.findById(validation.userId);
    if (!user) {
      throw new AuthError("USER_NOT_FOUND", "User no longer exists.", 401);
    }

    // Rotate refresh token (ChatGPT-like: refresh gives new access + refresh)
    const rotated = await this.refreshTokens.rotate({
      refreshToken: input.refreshToken,
      newExpiresAt: addSeconds(
        this.clock.now(),
        this.cfg.refreshTokenTtlSeconds,
      ),
      ip: input.ip,
      userAgent: input.userAgent,
    });

    const access = this.jwt.signAccessToken(
      { sub: user.id, email: user.email, role: user.role },
      this.cfg.accessTokenTtlSeconds,
    );

    return {
      user: toPublicUser(user),
      tokens: {
        accessToken: access,
        refreshToken: rotated.refreshToken,
        accessTokenExpiresAt: addSeconds(
          this.clock.now(),
          this.cfg.accessTokenTtlSeconds,
        ).toISOString(),
        refreshTokenExpiresAt: rotated.expiresAt.toISOString(),
      },
    };
  }

  async logout(input: LogoutInput): Promise<{ ok: true }> {
    await this.refreshTokens.revoke({
      refreshToken: input.refreshToken,
      reason: "logout",
    });
    return { ok: true };
  }

  async requestPasswordReset(
    input: RequestPasswordResetInput,
  ): Promise<{ ok: true }> {
    const email = normalizeEmail(input.email);
    const user = await this.users.findByEmail(email);

    // Always return ok to prevent email enumeration
    if (!user) return { ok: true };

    const token = await this.verificationTokens.issuePasswordResetToken({
      userId: user.id,
      expiresAt: addSeconds(this.clock.now(), this.cfg.passwordResetTtlSeconds),
    });

    await this.emailSender.sendPasswordReset({ to: user.email, token });
    return { ok: true };
  }

  async resetPassword(input: ResetPasswordInput): Promise<{ ok: true }> {
    enforcePasswordPolicy(input.newPassword);

    const consumed = await this.verificationTokens.consumePasswordResetToken(
      input.token,
    );
    if (!consumed.ok || !consumed.userId) {
      throw new AuthError(
        "INVALID_TOKEN",
        "Reset token is invalid or expired.",
        400,
      );
    }

    const user = await this.users.findById(consumed.userId);
    if (!user) {
      throw new AuthError("USER_NOT_FOUND", "User no longer exists.", 404);
    }

    const passwordHash = await bcrypt.hash(
      input.newPassword,
      this.cfg.bcryptCost,
    );
    await this.users.setPassword(user.id, passwordHash);

    // Invalidate all sessions after password reset
    await this.refreshTokens.revokeAllForUser(user.id, "password_reset");

    return { ok: true };
  }

  async verifyEmail(input: VerifyEmailInput): Promise<{ ok: true }> {
    const consumed = await this.verificationTokens.consumeEmailVerifyToken(
      input.token,
    );
    if (!consumed.ok || !consumed.userId) {
      throw new AuthError(
        "INVALID_TOKEN",
        "Verification token is invalid or expired.",
        400,
      );
    }

    await this.users.setEmailVerified(consumed.userId, true);
    return { ok: true };
  }

  /** -----------------------------
   * Internals
   * ----------------------------- */

  private async issueSession(
    user: IUserAuthRecord,
    ctx: { ip?: string; userAgent?: string },
  ): Promise<AuthSession> {
    const accessToken = this.jwt.signAccessToken(
      { sub: user.id, email: user.email, role: user.role },
      this.cfg.accessTokenTtlSeconds,
    );

    const refresh = await this.refreshTokens.issue({
      userId: user.id,
      expiresAt: addSeconds(this.clock.now(), this.cfg.refreshTokenTtlSeconds),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return {
      user: toPublicUser(user),
      tokens: {
        accessToken,
        refreshToken: refresh.refreshToken,
        accessTokenExpiresAt: addSeconds(
          this.clock.now(),
          this.cfg.accessTokenTtlSeconds,
        ).toISOString(),
        refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
      },
    };
  }
}

/** -----------------------------
 * Helpers
 * ----------------------------- */

function normalizeEmail(email: string): string {
  return (email || "").trim().toLowerCase();
}

function enforcePasswordPolicy(password: string): void {
  // Keep it strict but not annoying.
  // Adjust rules in one place; controllers should never implement these checks.
  const p = password ?? "";
  const min = 10;

  if (p.length < min) {
    throw new AuthError(
      "WEAK_PASSWORD",
      `Password must be at least ${min} characters.`,
      400,
    );
  }
  const hasLetter = /[A-Za-z]/.test(p);
  const hasNumber = /\d/.test(p);
  const hasSymbol = /[^A-Za-z0-9]/.test(p);

  if (!(hasLetter && hasNumber)) {
    throw new AuthError(
      "WEAK_PASSWORD",
      "Password must include letters and numbers.",
      400,
    );
  }
  // Symbol not required (reduces friction), but encourage via UI.
  // If you want: require hasSymbol as well.
}

function toPublicUser(u: IUserAuthRecord): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? null,
    role: u.role,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt.toISOString(),
  };
}

function addSeconds(d: Date, seconds: number): Date {
  return new Date(d.getTime() + seconds * 1000);
}

/**
 * Optional utility if you need deterministic tokens in a custom store:
 * (Stores should hash refresh tokens; never store raw.)
 */
export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
