// backend/src/services/profile/profileApp.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ProfileAppService (ChatGPT-parity, production-safe)
 * ---------------------------------------------------
 * Centralizes profile persistence and validation used by:
 *  - profile.controller.ts
 *  - user.controller.ts (optional: set displayName/email on signup)
 *  - chat pipeline (optional: language preference, formatting bias)
 *
 * Storage:
 *  - File-backed JSON at storage/users.json
 *  - Atomic writes + in-process write lock to prevent corruption
 *
 * Guarantees:
 *  - Never returns password hashes or recovery hashes
 *  - Only allows explicit, whitelisted profile fields to be updated
 *  - Deterministic normalization (trim/cap)
 */

import path from "path";
import * as fs from "fs/promises";

export type EnvName = "production" | "staging" | "dev" | "local";
export type LangCode = "any" | "en" | "pt" | "es";
export type Theme = "light" | "dark" | "system";

export type PublicProfile = {
  id: string;
  createdAt: number;
  updatedAt: number;

  displayName: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;

  language: LangCode;
  timezone: string | null;
  theme: Theme;

  preferConcise: boolean;
  preferBullets: boolean;
  preferTables: boolean;
};

type UserRecord = {
  id: string;
  createdAt: number;
  updatedAt: number;

  // auth (server-only)
  passwordHash?: string;
  passwordSalt?: string;
  recoveryPhraseHash?: string;
  recoverySalt?: string;

  // profile
  profile?: {
    displayName?: string;
    email?: string;
    phone?: string;
    avatarUrl?: string;

    language?: LangCode;
    timezone?: string;
    theme?: Theme;

    preferConcise?: boolean;
    preferBullets?: boolean;
    preferTables?: boolean;
  };
};

type UsersFile = {
  version: string;
  users: Record<string, UserRecord>;
};

export class ProfileAppError extends Error {
  status: number;
  code: string;
  details?: any;

  constructor(code: string, message: string, status = 500, details?: any) {
    super(message);
    this.name = "ProfileAppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type ProfilePatch = Partial<{
  displayName: string;
  email: string;
  phone: string;
  avatarUrl: string;

  language: LangCode;
  timezone: string;
  theme: Theme;

  preferConcise: boolean;
  preferBullets: boolean;
  preferTables: boolean;
}>;

export type ProfileAppConfig = {
  env: EnvName;
  usersPath: string;
  maxFieldLengths: {
    displayName: number;
    email: number;
    phone: number;
    avatarUrl: number;
    timezone: number;
  };
};

const DEFAULT_CONFIG: ProfileAppConfig = {
  env: (process.env.NODE_ENV as EnvName) || "dev",
  usersPath: path.resolve(process.cwd(), "storage/users.json"),
  maxFieldLengths: {
    displayName: 60,
    email: 120,
    phone: 40,
    avatarUrl: 400,
    timezone: 80,
  },
};

// ------------------------------
// Helpers
// ------------------------------

function nowTs(): number {
  return Date.now();
}

function safeString(x: any, max: number): string | null {
  if (typeof x !== "string") return null;
  const s = x.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function safeBool(x: any): boolean | null {
  if (typeof x === "boolean") return x;
  return null;
}

function isLang(x: any): x is LangCode {
  return x === "any" || x === "en" || x === "pt" || x === "es";
}

function isTheme(x: any): x is Theme {
  return x === "light" || x === "dark" || x === "system";
}

async function readUsersFile(filePath: string): Promise<UsersFile> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("invalid");
    if (!parsed.users || typeof parsed.users !== "object") parsed.users = {};
    if (!parsed.version || typeof parsed.version !== "string")
      parsed.version = "1.0.0";
    return parsed as UsersFile;
  } catch {
    return { version: "1.0.0", users: {} };
  }
}

async function atomicWriteJson(filePath: string, data: any): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

// In-process mutex to avoid concurrent corruption
let usersWriteLock: Promise<void> = Promise.resolve();
async function withUsersWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = usersWriteLock;
  let release!: () => void;
  usersWriteLock = new Promise<void>((r) => (release = r));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function toPublicProfile(u: UserRecord): PublicProfile {
  const p = u.profile ?? {};
  return {
    id: u.id,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,

    displayName: p.displayName ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    avatarUrl: p.avatarUrl ?? null,

    language: p.language ?? "any",
    timezone: p.timezone ?? null,
    theme: p.theme ?? "system",

    preferConcise: Boolean(p.preferConcise),
    preferBullets: Boolean(p.preferBullets),
    preferTables: Boolean(p.preferTables),
  };
}

function validatePatch(
  cfg: ProfileAppConfig,
  body: any,
): { patch: ProfilePatch; errors: string[] } {
  const errors: string[] = [];
  const patch: ProfilePatch = {};

  const displayName = safeString(
    body?.displayName,
    cfg.maxFieldLengths.displayName,
  );
  if (body?.displayName != null && !displayName)
    errors.push("displayName_invalid");
  if (displayName) patch.displayName = displayName;

  const email = safeString(body?.email, cfg.maxFieldLengths.email);
  if (body?.email != null && !email) errors.push("email_invalid");
  if (email) patch.email = email;

  const phone = safeString(body?.phone, cfg.maxFieldLengths.phone);
  if (body?.phone != null && !phone) errors.push("phone_invalid");
  if (phone) patch.phone = phone;

  const avatarUrl = safeString(body?.avatarUrl, cfg.maxFieldLengths.avatarUrl);
  if (body?.avatarUrl != null && !avatarUrl) errors.push("avatarUrl_invalid");
  if (avatarUrl) patch.avatarUrl = avatarUrl;

  const timezone = safeString(body?.timezone, cfg.maxFieldLengths.timezone);
  if (body?.timezone != null && !timezone) errors.push("timezone_invalid");
  if (timezone) patch.timezone = timezone;

  const language = body?.language;
  if (language != null) {
    if (!isLang(language)) errors.push("language_invalid");
    else patch.language = language;
  }

  const theme = body?.theme;
  if (theme != null) {
    if (!isTheme(theme)) errors.push("theme_invalid");
    else patch.theme = theme;
  }

  const preferConcise = safeBool(body?.preferConcise);
  if (body?.preferConcise != null && preferConcise === null)
    errors.push("preferConcise_invalid");
  if (preferConcise !== null) patch.preferConcise = preferConcise;

  const preferBullets = safeBool(body?.preferBullets);
  if (body?.preferBullets != null && preferBullets === null)
    errors.push("preferBullets_invalid");
  if (preferBullets !== null) patch.preferBullets = preferBullets;

  const preferTables = safeBool(body?.preferTables);
  if (body?.preferTables != null && preferTables === null)
    errors.push("preferTables_invalid");
  if (preferTables !== null) patch.preferTables = preferTables;

  return { patch, errors };
}

// ------------------------------
// Service
// ------------------------------

export class ProfileAppService {
  private cfg: ProfileAppConfig;

  constructor(config: Partial<ProfileAppConfig> = {}) {
    this.cfg = {
      ...DEFAULT_CONFIG,
      ...config,
      maxFieldLengths: {
        ...DEFAULT_CONFIG.maxFieldLengths,
        ...(config.maxFieldLengths || {}),
      },
    };
  }

  /**
   * Get a public profile for a userId.
   */
  async getProfile(userId: string): Promise<PublicProfile> {
    const id = safeString(userId, 120);
    if (!id) throw new ProfileAppError("bad_request", "userId required", 400);

    const db = await readUsersFile(this.cfg.usersPath);
    const u = db.users[id];
    if (!u) throw new ProfileAppError("unauthorized", "Unauthorized", 401);

    return toPublicProfile(u);
  }

  /**
   * Update profile fields with strict validation.
   */
  async updateProfile(userId: string, body: any): Promise<PublicProfile> {
    const id = safeString(userId, 120);
    if (!id) throw new ProfileAppError("bad_request", "userId required", 400);

    const { patch, errors } = validatePatch(this.cfg, body);
    if (errors.length) {
      throw new ProfileAppError(
        "validation_error",
        "Invalid profile fields",
        400,
        { errors },
      );
    }

    const updated = await withUsersWriteLock(async () => {
      const db = await readUsersFile(this.cfg.usersPath);
      const u = db.users[id];
      if (!u) return null;

      const next: UserRecord = {
        ...u,
        updatedAt: nowTs(),
        profile: { ...(u.profile ?? {}), ...patch },
      };

      db.users[id] = next;
      await atomicWriteJson(this.cfg.usersPath, db);
      return next;
    });

    if (!updated)
      throw new ProfileAppError("unauthorized", "Unauthorized", 401);
    return toPublicProfile(updated);
  }

  /**
   * Reset UX preferences to defaults (does not clear identity fields).
   */
  async resetPreferences(userId: string): Promise<PublicProfile> {
    const id = safeString(userId, 120);
    if (!id) throw new ProfileAppError("bad_request", "userId required", 400);

    const updated = await withUsersWriteLock(async () => {
      const db = await readUsersFile(this.cfg.usersPath);
      const u = db.users[id];
      if (!u) return null;

      const p = u.profile ?? {};
      const nextProfile = {
        ...p,
        language: "any" as LangCode,
        theme: "system" as Theme,
        preferConcise: false,
        preferBullets: false,
        preferTables: false,
      };

      const next: UserRecord = {
        ...u,
        updatedAt: nowTs(),
        profile: nextProfile,
      };

      db.users[id] = next;
      await atomicWriteJson(this.cfg.usersPath, db);
      return next;
    });

    if (!updated)
      throw new ProfileAppError("unauthorized", "Unauthorized", 401);
    return toPublicProfile(updated);
  }

  /**
   * Convenience: update language preference only (common in chat).
   */
  async setLanguage(
    userId: string,
    language: LangCode,
  ): Promise<PublicProfile> {
    if (!isLang(language))
      throw new ProfileAppError("validation_error", "Invalid language", 400);

    return this.updateProfile(userId, { language });
  }
}

export default ProfileAppService;
