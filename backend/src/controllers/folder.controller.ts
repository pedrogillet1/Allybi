import type { Request, Response } from "express";

/**
 * Clean, DI-friendly Folder Controller.
 *
 * Goals:
 * - No DB logic here, no websocket logic here.
 * - Folder behaviors go through FolderService (list/create/update/delete/move).
 * - Keep responses consistent: { ok: true, data } / { ok: false, error }.
 */

export type FolderId = string;

export interface FolderRecord {
  id: FolderId;
  name: string;
  parentId?: FolderId | null;
  parentFolderId?: FolderId | null; // backward-compat alias used by frontend
  path?: string | null;
  createdAt: string;
  updatedAt?: string;
  counts?: { docs?: number; subfolders?: number };
  _count?: { documents?: number; subfolders?: number; totalDocuments?: number };
}

export interface FolderTreeNode extends FolderRecord {
  children?: FolderTreeNode[];
}

export interface FolderService {
  list(input: { userId: string; parentId?: string | null; q?: string; limit?: number; cursor?: string }):
    Promise<{ items: FolderRecord[]; nextCursor?: string }>;

  tree(input: { userId: string }): Promise<FolderTreeNode[]>;

  get(input: { userId: string; folderId: string }): Promise<FolderRecord | null>;

  create(input: { userId: string; name: string; parentId?: string | null }): Promise<FolderRecord>;

  rename(input: { userId: string; folderId: string; name: string }): Promise<FolderRecord>;

  move(input: { userId: string; folderId: string; newParentId?: string | null }): Promise<FolderRecord>;

  delete(input: { userId: string; folderId: string; mode?: "soft" | "hard" }):
    Promise<{ deleted: true; movedDocs?: number; movedToFolderId?: string }>;
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

function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim()) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getUserId(req: Request): string | null {
  const anyReq = req as any;
  const userId = anyReq?.user?.id || anyReq?.userId || anyReq?.auth?.userId;
  return typeof userId === "string" && userId.trim() ? userId.trim() : null;
}

function mapError(e: unknown): { code: string; message: string; status: number } {
  const msg = e instanceof Error ? e.message : "Unknown error";
  const m = msg.toLowerCase();

  if (m.includes("unauthorized") || m.includes("not authenticated")) {
    return { code: "AUTH_UNAUTHORIZED", message: "Not authenticated.", status: 401 };
  }
  if (m.includes("not found")) {
    return { code: "FOLDER_NOT_FOUND", message: "Folder not found.", status: 404 };
  }
  if (m.includes("already exists") || m.includes("duplicate")) {
    return { code: "FOLDER_NAME_CONFLICT", message: "A folder with this name already exists here.", status: 409 };
  }
  if (m.includes("invalid") || m.includes("validation")) {
    return { code: "VALIDATION_ERROR", message: msg, status: 400 };
  }
  return { code: "FOLDER_ERROR", message: msg || "Folder error.", status: 400 };
}

export class FolderController {
  constructor(private readonly folders: FolderService) {}

  list = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const includeAll = req.query.includeAll === "true";
    const parentId = includeAll ? undefined : (asString(req.query.parentId) ?? null);
    const q = asString(req.query.q) ?? undefined;
    const limit = Math.min(Math.max(asInt(req.query.limit) ?? 50, 1), 200);
    const cursor = asString(req.query.cursor) ?? undefined;

    try {
      const out = await this.folders.list({ userId, parentId, q, limit, cursor });
      return ok(res, out, 200);
    } catch (e) {
      const mapped = mapError(e);
      return err(res, mapped.code, mapped.message, mapped.status);
    }
  };

  tree = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    try {
      const out = await this.folders.tree({ userId });
      return ok(res, out, 200);
    } catch (e) {
      const mapped = mapError(e);
      return err(res, mapped.code, mapped.message, mapped.status);
    }
  };

  get = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const folderId = asString(req.params.id);
    if (!folderId) return err(res, "VALIDATION_FOLDER_ID_REQUIRED", "Folder id is required.", 400);

    try {
      const folder = await this.folders.get({ userId, folderId });
      if (!folder) return err(res, "FOLDER_NOT_FOUND", "Folder not found.", 404);
      return ok(res, folder, 200);
    } catch (e) {
      const mapped = mapError(e);
      return err(res, mapped.code, mapped.message, mapped.status);
    }
  };

  create = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const name = asString((req.body as any)?.name);
    const parentId = asString((req.body as any)?.parentId) ?? null;

    if (!name) return err(res, "VALIDATION_NAME_REQUIRED", "Folder name is required.", 400);

    try {
      const created = await this.folders.create({ userId, name, parentId });
      return ok(res, created, 201);
    } catch (e) {
      const mapped = mapError(e);
      return err(res, mapped.code, mapped.message, mapped.status);
    }
  };

  update = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const folderId = asString(req.params.id);
    if (!folderId) return err(res, "VALIDATION_FOLDER_ID_REQUIRED", "Folder id is required.", 400);

    const name = asString((req.body as any)?.name);
    const parentIdRaw = (req.body as any)?.parentId;
    const parentId = parentIdRaw === undefined ? undefined : (asString(parentIdRaw) ?? null);

    if (!name && parentId === undefined) {
      return err(res, "VALIDATION_UPDATE_REQUIRED", "Provide at least one of: name, parentId.", 400);
    }

    try {
      let out: FolderRecord | null = null;

      if (name) {
        out = await this.folders.rename({ userId, folderId, name });
      }

      if (parentId !== undefined) {
        out = await this.folders.move({ userId, folderId, newParentId: parentId });
      }

      if (!out) return err(res, "FOLDER_ERROR", "No update performed.", 400);
      return ok(res, out, 200);
    } catch (e) {
      const mapped = mapError(e);
      return err(res, mapped.code, mapped.message, mapped.status);
    }
  };

  delete = async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return err(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const folderId = asString(req.params.id);
    if (!folderId) return err(res, "VALIDATION_FOLDER_ID_REQUIRED", "Folder id is required.", 400);

    const mode = (asString(req.query.mode) as "soft" | "hard" | null) ?? "soft";

    try {
      const out = await this.folders.delete({ userId, folderId, mode });
      return ok(res, out, 200);
    } catch (e) {
      const mapped = mapError(e);
      return err(res, mapped.code, mapped.message, mapped.status);
    }
  };
}

export function createFolderController(folderService: FolderService) {
  return new FolderController(folderService);
}
