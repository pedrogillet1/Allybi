// backend/src/types/auth.types.ts

/**
 * Auth Types (ChatGPT-parity, stable contracts)
 * --------------------------------------------
 * Centralizes all auth-related TypeScript types used across:
 *  - user.controller.ts
 *  - profile.controller.ts
 *  - auth middleware (req.user)
 *  - services that need user identity (chat/doc/storage)
 *
 * Goals:
 *  - Keep server-side secrets out of “public” types
 *  - Provide stable request/response envelopes
 *  - Make auth middleware augmentation explicit
 */

import type { Request } from "express";

export type EnvName = "production" | "staging" | "dev" | "local";
export type LangCode = "any" | "en" | "pt" | "es";

/**
 * Minimal user identity attached to requests by auth middleware.
 */
export interface AuthUser {
  id: string;
  role?: string;
}

/**
 * Express request augmented with auth user.
 */
export type AuthenticatedRequest = Request & {
  user?: AuthUser;
  correlationId?: string;
};

/**
 * Standard JSON envelope for API success.
 */
export type ApiOk<T> = {
  ok: true;
} & T;

/**
 * Standard JSON envelope for API error.
 */
export type ApiErrorEnvelope = {
  ok: false;
  error: {
    code: string;
    message: string;
    correlationId?: string | null;
    details?: any; // non-prod only
  };
};

/**
 * Signup request payload.
 * Your flow: password + recoveryPhrase (backup for recovery).
 */
export interface SignupRequest {
  password: string;
  recoveryPhrase: string;
  displayName?: string;
  email?: string;
}

/**
 * Signup response payload.
 */
export interface SignupResponse {
  user: PublicUser;
  token: string;
}

/**
 * Login request payload.
 */
export interface LoginRequest {
  userId: string;
  password: string;
}

/**
 * Login response payload.
 */
export interface LoginResponse {
  user: PublicUser;
  token: string;
}

/**
 * Recovery verify request payload.
 */
export interface RecoveryVerifyRequest {
  userId: string;
  recoveryPhrase: string;
}

/**
 * Recovery verify response payload.
 */
export interface RecoveryVerifyResponse {
  recoveryToken: string;
}

/**
 * Recovery reset request payload.
 */
export interface RecoveryResetRequest {
  recoveryToken: string;
  newPassword: string;
}

/**
 * Recovery reset response payload.
 */
export interface RecoveryResetResponse {
  user: PublicUser;
  token: string;
}

/**
 * Public user fields returned to clients (never includes hashes).
 */
export interface PublicUser {
  id: string;
  createdAt: number;
  updatedAt: number;
  profile: {
    displayName: string | null;
    email: string | null;
    language: LangCode;
  };
}

/**
 * Internal user record stored server-side (file DB).
 * Do NOT expose this to clients.
 */
export interface UserRecordInternal {
  id: string;
  createdAt: number;
  updatedAt: number;

  passwordHash: string;
  passwordSalt: string;

  recoveryPhraseHash: string;
  recoverySalt: string;

  profile?: {
    displayName?: string;
    email?: string;
    phone?: string;
    avatarUrl?: string;

    language?: LangCode;
    timezone?: string;
    theme?: "light" | "dark" | "system";

    preferConcise?: boolean;
    preferBullets?: boolean;
    preferTables?: boolean;
  };
}

/**
 * Users file format (storage/users.json).
 */
export interface UsersFileInternal {
  version: string;
  users: Record<string, UserRecordInternal>;
}
