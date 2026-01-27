import express, { Request, Response } from "express";
import path from "path";
import * as fs from "fs/promises";

type EnvName = "production" | "staging" | "dev" | "local";
type LangCode = "any" | "en" | "pt" | "es";

type UserRecord = {
  id: string;
  createdAt: number;
  updatedAt: number;
  passwordHash?: string;
  recoveryPhraseHash?: string;
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
};

type UsersFile = {
  version: string;
  users: Record<string, UserRecord>;
};

type AuthenticatedRequest = Request & {
  user?: { id: string };
};

const DEFAULT_USERS_PATH = path.resolve(process.cwd(), "storage/users.json");

function isLang(x: any): x is LangCode {
  return x === "any" || x === "en" || x === "pt" || x === "es";
}

function clampString(s: any, max: number): string | undefined {
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
}

function safeBool(x: any): boolean | undefined {
  if (typeof x === "boolean") return x;
  return undefined;
}

function nowTs(): number {
  return Date.now();
}

async function readUsersFile(filePath: string): Promise<UsersFile> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid users file");
    if (!parsed.users || typeof parsed.users !== "object") parsed.users = {};
    if (!parsed.version || typeof parsed.version !== "string") parsed.version = "1.0.0";
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

function requireAuth(req: AuthenticatedRequest, res: Response): string | null {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ ok: false, error: { code: "unauthorized", message: "Unauthorized" } });
    return null;
  }
  return userId;
}

function publicProfile(u: UserRecord) {
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

function validateProfilePatch(body: any): { patch: Partial<UserRecord["profile"]>; errors: string[] } {
  const errors: string[] = [];
  const patch: Partial<UserRecord["profile"]> = {};

  const displayName = clampString(body?.displayName, 60);
  if (body?.displayName != null && !displayName) errors.push("displayName_invalid");
  if (displayName) patch.displayName = displayName;

  const email = clampString(body?.email, 120);
  if (body?.email != null && !email) errors.push("email_invalid");
  if (email) patch.email = email;

  const phone = clampString(body?.phone, 40);
  if (body?.phone != null && !phone) errors.push("phone_invalid");
  if (phone) patch.phone = phone;

  const avatarUrl = clampString(body?.avatarUrl, 400);
  if (body?.avatarUrl != null && !avatarUrl) errors.push("avatarUrl_invalid");
  if (avatarUrl) patch.avatarUrl = avatarUrl;

  const timezone = clampString(body?.timezone, 80);
  if (body?.timezone != null && !timezone) errors.push("timezone_invalid");
  if (timezone) patch.timezone = timezone;

  const language = body?.language;
  if (language != null) {
    if (!isLang(language)) errors.push("language_invalid");
    else patch.language = language;
  }

  const theme = body?.theme;
  if (theme != null) {
    const ok = theme === "light" || theme === "dark" || theme === "system";
    if (!ok) errors.push("theme_invalid");
    else patch.theme = theme;
  }

  const preferConcise = safeBool(body?.preferConcise);
  if (body?.preferConcise != null && preferConcise === undefined) errors.push("preferConcise_invalid");
  if (preferConcise !== undefined) patch.preferConcise = preferConcise;

  const preferBullets = safeBool(body?.preferBullets);
  if (body?.preferBullets != null && preferBullets === undefined) errors.push("preferBullets_invalid");
  if (preferBullets !== undefined) patch.preferBullets = preferBullets;

  const preferTables = safeBool(body?.preferTables);
  if (body?.preferTables != null && preferTables === undefined) errors.push("preferTables_invalid");
  if (preferTables !== undefined) patch.preferTables = preferTables;

  return { patch, errors };
}

export function createProfileRouter(opts?: {
  usersPath?: string;
  env?: EnvName;
}) {
  const router = express.Router();
  router.use(express.json({ limit: "1mb" }));

  const usersPath = opts?.usersPath ?? DEFAULT_USERS_PATH;

  router.get("/", async (req: AuthenticatedRequest, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const db = await readUsersFile(usersPath);
    const user = db.users[userId];
    if (!user) {
      return res.status(401).json({ ok: false, error: { code: "unauthorized", message: "Unauthorized" } });
    }

    return res.json({ ok: true, profile: publicProfile(user) });
  });

  router.put("/", async (req: AuthenticatedRequest, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { patch, errors } = validateProfilePatch(req.body);
    if (errors.length) {
      return res.status(400).json({
        ok: false,
        error: { code: "validation_error", message: "Invalid profile fields", details: errors },
      });
    }

    const updated = await withUsersWriteLock(async () => {
      const db = await readUsersFile(usersPath);
      const user = db.users[userId];
      if (!user) return null;

      const next: UserRecord = {
        ...user,
        updatedAt: nowTs(),
        profile: { ...(user.profile ?? {}), ...patch },
      };

      db.users[userId] = next;
      await atomicWriteJson(usersPath, db);
      return next;
    });

    if (!updated) {
      return res.status(401).json({ ok: false, error: { code: "unauthorized", message: "Unauthorized" } });
    }

    return res.json({ ok: true, profile: publicProfile(updated) });
  });

  router.post("/reset-preferences", async (req: AuthenticatedRequest, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const updated = await withUsersWriteLock(async () => {
      const db = await readUsersFile(usersPath);
      const user = db.users[userId];
      if (!user) return null;

      const p = user.profile ?? {};
      const nextProfile = {
        ...p,
        language: "any" as LangCode,
        timezone: p.timezone ?? null,
        theme: "system" as const,
        preferConcise: false,
        preferBullets: false,
        preferTables: false,
      };

      const next: UserRecord = {
        ...user,
        updatedAt: nowTs(),
        profile: nextProfile,
      };

      db.users[userId] = next;
      await atomicWriteJson(usersPath, db);
      return next;
    });

    if (!updated) {
      return res.status(401).json({ ok: false, error: { code: "unauthorized", message: "Unauthorized" } });
    }

    return res.json({ ok: true, profile: publicProfile(updated) });
  });

  return router;
}

export default createProfileRouter;
