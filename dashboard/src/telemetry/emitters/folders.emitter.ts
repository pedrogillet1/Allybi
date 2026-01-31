import crypto from "crypto";
import { emit } from "../index";

/**
 * Minimal context you can pass from request middleware/controllers.
 * Keep it lightweight and non-PII.
 */
export type TelemetryContext = {
  userId?: string;
  orgId?: string;
  sessionId?: string;
  requestId?: string;
  // If you log IP/UA, only pass hashed versions:
  ipHash?: string;
  userAgentHash?: string;
};

type BaseEvent = {
  ts: string; // ISO
  type: string;
  userId?: string;
  orgId?: string;
  sessionId?: string;
  requestId?: string;
  ipHash?: string;
  userAgentHash?: string;
  entityId?: string; // folderId/documentId/etc.
  payload?: Record<string, any>;
};

function nowIso() {
  return new Date().toISOString();
}

/**
 * Stable hash helper for safe correlation (e.g., folder name, path).
 * Uses optional pepper so hashes are not reversible via rainbow tables.
 */
function safeHash(input: string): string {
  const pepper = process.env.TELEMETRY_HASH_PEPPER || "";
  return crypto.createHash("sha256").update(`${pepper}${input}`).digest("hex");
}

function base(ctx?: TelemetryContext): Omit<BaseEvent, "type"> {
  return {
    ts: nowIso(),
    userId: ctx?.userId,
    orgId: ctx?.orgId,
    sessionId: ctx?.sessionId,
    requestId: ctx?.requestId,
    ipHash: ctx?.ipHash,
    userAgentHash: ctx?.userAgentHash,
  };
}

/**
 * Folder telemetry emitter.
 * IMPORTANT: Do not emit plaintext folder names/paths.
 * Emit hashes instead so you can still aggregate & correlate.
 */
export const foldersEmitter = {
  async created(params: {
    ctx?: TelemetryContext;
    folderId: string;
    parentFolderId?: string | null;
    // Optional raw values; we hash them for telemetry.
    folderName?: string;
    folderPath?: string;
  }) {
    const payload: Record<string, any> = {
      parentFolderId: params.parentFolderId ?? null,
    };

    if (params.folderName) payload.folderNameHash = safeHash(params.folderName);
    if (params.folderPath) payload.folderPathHash = safeHash(params.folderPath);

    await emit({
      ...base(params.ctx),
      type: "folder.created",
      entityId: params.folderId,
      payload,
    } as any);
  },

  async renamed(params: {
    ctx?: TelemetryContext;
    folderId: string;
    // raw values optional; hashed in payload
    oldName?: string;
    newName?: string;
  }) {
    const payload: Record<string, any> = {};
    if (params.oldName) payload.oldNameHash = safeHash(params.oldName);
    if (params.newName) payload.newNameHash = safeHash(params.newName);

    await emit({
      ...base(params.ctx),
      type: "folder.renamed",
      entityId: params.folderId,
      payload,
    } as any);
  },

  async moved(params: {
    ctx?: TelemetryContext;
    folderId: string;
    fromParentFolderId?: string | null;
    toParentFolderId?: string | null;
  }) {
    await emit({
      ...base(params.ctx),
      type: "folder.moved",
      entityId: params.folderId,
      payload: {
        fromParentFolderId: params.fromParentFolderId ?? null,
        toParentFolderId: params.toParentFolderId ?? null,
      },
    } as any);
  },

  async deleted(params: {
    ctx?: TelemetryContext;
    folderId: string;
    // If you have counts, they're safe and useful:
    containedDocumentsCount?: number;
    containedFoldersCount?: number;
  }) {
    await emit({
      ...base(params.ctx),
      type: "folder.deleted",
      entityId: params.folderId,
      payload: {
        containedDocumentsCount: params.containedDocumentsCount ?? null,
        containedFoldersCount: params.containedFoldersCount ?? null,
      },
    } as any);
  },

  async accessDenied(params: {
    ctx?: TelemetryContext;
    folderId?: string;
    reason: "owner_mismatch" | "missing_permission" | "unauthenticated" | "unknown";
  }) {
    await emit({
      ...base(params.ctx),
      type: "folder.access_denied",
      entityId: params.folderId,
      payload: { reason: params.reason },
    } as any);
  },
};
