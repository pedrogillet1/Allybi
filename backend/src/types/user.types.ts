// src/types/user.types.ts

import type { DomainId } from './domains.types';

/**
 * User types for Koda.
 * - Keep this file runtime-free (types only).
 * - Split "public" (frontend-safe) vs "internal" (backend-only) shapes.
 */

export type UserId = string;
export type OrgId = string;
export type WorkspaceId = string;
export type SessionId = string;

// ---------------------------------------------
// RBAC / Roles
// ---------------------------------------------

export type UserRole =
  | 'owner'
  | 'admin'
  | 'member'
  | 'viewer'
  | 'support'; // optional internal role

export type Permission =
  | 'chat:read'
  | 'chat:write'
  | 'docs:read'
  | 'docs:write'
  | 'docs:delete'
  | 'folders:read'
  | 'folders:write'
  | 'billing:read'
  | 'billing:write'
  | 'admin:dashboard'
  | 'admin:manage_users';

export interface RbacContext {
  role: UserRole;
  permissions: Permission[];
  orgId?: OrgId | null;
  workspaceId?: WorkspaceId | null;
}

// ---------------------------------------------
// Auth providers
// ---------------------------------------------

export type AuthProvider = 'password' | 'google' | 'apple' | 'github';

export interface AuthIdentity {
  provider: AuthProvider;
  providerUserId?: string;
  email?: string;
  emailVerified?: boolean;
  phone?: string;
  phoneVerified?: boolean;

  /**
   * Backend only. DO NOT send to client.
   */
  passwordHash?: string;
  passwordUpdatedAt?: string;
}

// ---------------------------------------------
// Plans / limits
// ---------------------------------------------

export type PlanTier = 'free' | 'pro' | 'team' | 'enterprise';

export interface UsageLimits {
  maxDocs: number;
  maxStorageBytes: number;
  maxUploadBytes: number;
  maxMessagesPerDay?: number;
  maxRequestsPerMinute?: number;
  maxConcurrentIngestionJobs?: number;
}

export interface UsageState {
  docCount: number;
  storageBytesUsed: number;
  messagesToday?: number;
  lastResetAt?: string; // ISO
}

export interface PlanInfo {
  tier: PlanTier;
  isTrial?: boolean;
  trialEndsAt?: string | null;
  limits: UsageLimits;
  usage?: UsageState;
}

// ---------------------------------------------
// Preferences (UX / behavior)
// ---------------------------------------------

export type UiTheme = 'light' | 'dark' | 'system';

export interface UserPreferences {
  language?: 'en' | 'pt' | 'es' | string; // allow future locales
  theme?: UiTheme;

  /**
   * Chat behavior preferences.
   */
  defaultDomain?: DomainId | 'general';
  preferShortAnswers?: boolean;
  allowFollowups?: boolean;

  /**
   * Safety / privacy toggles (respect policies).
   */
  redactSensitiveInPreview?: boolean;
  allowQuoteSnippets?: boolean;

  /**
   * UI toggles.
   */
  showSourcesByDefault?: boolean;
  showDebugPanel?: boolean;

  /**
   * Accessibility / UX.
   */
  reducedMotion?: boolean;
  streamResponses?: boolean;
}

// ---------------------------------------------
// User profile (optional enrichment)
// ---------------------------------------------

export interface UserProfile {
  displayName?: string;
  company?: string;
  jobTitle?: string;

  /**
   * Optional: used for better doc routing + context.
   * Keep it light; don’t store sensitive identity attributes here.
   */
  primaryUseCases?: Array<
    | 'personal_docs'
    | 'finance'
    | 'accounting'
    | 'legal'
    | 'medical'
    | 'education'
    | 'operations'
    | 'other'
  >;

  /**
   * Optional: user’s preferred doc conventions (helps disambiguation).
   */
  preferredUnits?: 'metric' | 'imperial' | 'mixed';
  preferredCurrency?: 'USD' | 'BRL' | 'EUR' | string;

  createdAt?: string;
  updatedAt?: string;
}

// ---------------------------------------------
// Canonical User records
// ---------------------------------------------

/**
 * PublicUser - safe to return to frontend.
 * No secrets, no hashes, no recovery phrase.
 */
export interface PublicUser {
  id: UserId;
  email?: string | null;
  phone?: string | null;

  role: UserRole;
  orgId?: OrgId | null;
  workspaceId?: WorkspaceId | null;

  profile?: UserProfile;
  preferences?: UserPreferences;
  plan?: Pick<PlanInfo, 'tier' | 'isTrial' | 'trialEndsAt' | 'limits' | 'usage'>;

  createdAt: string; // ISO
  updatedAt: string; // ISO
}

/**
 * InternalUser - backend-only shape.
 * Includes auth identities and security state.
 */
export interface InternalUser extends PublicUser {
  identities: AuthIdentity[];

  /**
   * Security & account state.
   */
  status: 'active' | 'suspended' | 'deleted';
  lastLoginAt?: string | null;
  twoFactorEnabled?: boolean;

  /**
   * Recovery / backup:
   * store only encrypted/hashed values, never plaintext.
   */
  recoveryPhraseHash?: string | null;
  recoveryPhraseUpdatedAt?: string | null;
}

// ---------------------------------------------
// Sessions (login state)
// ---------------------------------------------

export interface AuthSession {
  sessionId: SessionId;
  userId: UserId;

  /**
   * When using JWT cookies, token fields may be absent.
   */
  accessToken?: string;
  refreshToken?: string;

  createdAt: string; // ISO
  expiresAt: string; // ISO

  /**
   * Request context (optional).
   */
  ip?: string;
  userAgent?: string;
}

// ---------------------------------------------
// API request/response shapes
// ---------------------------------------------

export interface LoginRequest {
  email?: string;
  phone?: string;
  password?: string;

  /**
   * OAuth-based flows may send provider tokens instead.
   */
  provider?: AuthProvider;
  providerToken?: string;
}

export interface LoginResponse {
  user: PublicUser;
  session: AuthSession;
}

export interface LogoutResponse {
  ok: true;
}

export interface UpdatePreferencesRequest {
  preferences: Partial<UserPreferences>;
}

export interface UpdateProfileRequest {
  profile: Partial<UserProfile>;
}

export interface UpdateUserResponse {
  user: PublicUser;
}

// ---------------------------------------------
// Helpers (type utilities)
// ---------------------------------------------

export type UserSafeFields = keyof PublicUser;

export function isPublicUser(u: any): u is PublicUser {
  return (
    u &&
    typeof u.id === 'string' &&
    typeof u.createdAt === 'string' &&
    typeof u.updatedAt === 'string' &&
    typeof u.role === 'string'
  );
}
