// file: src/admin/controllers/files.controller.ts
import type { Request, Response } from "express";
import crypto from "crypto";
import { createAnalyticsCache } from "../../analytics/cache/analytics.cache";
import { cacheKeys } from "../../analytics/cache/cacheKeys";
import { filesService } from "../services/files.service";

type Range = "24h" | "7d" | "30d" | "90d";
type FileStatus = "uploaded" | "processing" | "ready" | "failed";
type FileType = "pdf" | "docx" | "pptx" | "xlsx" | "image" | "text" | "other";

const cache = createAnalyticsCache();

function parseRange(input: unknown): Range {
  const v = typeof input === "string" ? input : "7d";
  if (v === "24h" || v === "7d" || v === "30d" || v === "90d") return v;
  return "7d";
}

function parseIntClamped(input: unknown, def: number, min: number, max: number): number {
  const n = typeof input === "string" ? Number(input) : typeof input === "number" ? input : def;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function parseOptionalString(input: unknown, maxLen: number): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function parseEnum<T extends string>(input: unknown, allowed: readonly T[]): T | null {
  if (typeof input !== "string") return null;
  return (allowed as readonly string[]).includes(input) ? (input as T) : null;
}

function getRequestId(req: Request): string | null {
  const h = req.headers["x-request-id"];
  return typeof h === "string" && h.length ? h : null;
}

function badRequest(res: Response, details: string, requestId: string | null) {
  return res.status(400).json({
    ok: false,
    error: "bad_request",
    details,
    requestId,
  });
}

function internalError(res: Response, requestId: string | null) {
  return res.status(500).json({
    ok: false,
    error: "internal_error",
    requestId,
  });
}

function maskEmail(email: string): string {
  const e = email.trim();
  const at = e.indexOf("@");
  if (at <= 0) return "***";
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);

  const localMasked =
    local.length <= 2 ? `${local[0] ?? "*"}*` : `${local.slice(0, 2)}***`;

  const parts = domain.split(".");
  const first = parts[0] ?? "";
  const tld = parts.length > 1 ? parts[parts.length - 1] : "";
  const domainMasked =
    first.length <= 2 ? `${first[0] ?? "*"}*` : `${first.slice(0, 2)}***`;

  return `${localMasked}@${domainMasked}.${tld || "*"}`;
}

function hashStable(input: string): string {
  const pepper = process.env.TELEMETRY_HASH_PEPPER || "";
  return crypto.createHash("sha256").update(`${pepper}${input}`).digest("hex");
}

/**
 * GET /api/admin/files?range=7d&status=ready&type=pdf&search=...&limit=50&offset=0
 *
 * Read-only. Never returns plaintext filenames or raw file paths.
 * If service provides filename, it will be removed and replaced with filenameHash (optional).
 */
export async function getFiles(req: Request, res: Response) {
  const requestId = getRequestId(req);

  try {
    const range = parseRange(req.query.range);
    const limit = parseIntClamped(req.query.limit, 50, 1, 200);
    const offset = parseIntClamped(req.query.offset, 0, 0, 1_000_000);

    const status = parseEnum<FileStatus>(req.query.status, ["uploaded", "processing", "ready", "failed"] as const);
    const type = parseEnum<FileType>(req.query.type, ["pdf", "docx", "pptx", "xlsx", "image", "text", "other"] as const);

    // NOTE: Avoid filename search unless your backend supports hashed search.
    // We allow "search" to match documentId or userId or safe tags; the service decides.
    const search = parseOptionalString(req.query.search, 120);

    const filters = { status, type, search, limit, offset };

    const key = cacheKeys.files(range, filters);

    const wrapped = await cache.wrap(
      key,
      30,
      async () => {
        return filesService.listFiles({
          range,
          status,
          type,
          search,
          limit,
          offset,
        });
      },
      {
        staleTtlSeconds: 120,
        allowStaleOnError: true,
      }
    );

    const value: any = wrapped.value ?? {};
    const files = Array.isArray(value.files) ? value.files : [];

    const sanitizedFiles = files.map((f: any) => {
      const out: any = { ...f };

      // Remove any plaintext filename/path if present
      const filename = typeof out.filename === "string" ? out.filename : null;
      const path = typeof out.path === "string" ? out.path : null;
      delete out.filename;
      delete out.path;
      delete out.filePath;
      delete out.storageKey; // don’t expose storage keys

      if (filename) out.filenameHash = hashStable(filename);
      if (path) out.pathHash = hashStable(path);

      // Ensure safe user identity fields
      const userEmail = typeof out.userEmail === "string" ? out.userEmail : null;
      if (userEmail) {
        out.userEmailMasked = maskEmail(userEmail);
        out.userEmailHash = hashStable(userEmail.toLowerCase());
      } else {
        out.userEmailMasked = null;
        out.userEmailHash = null;
      }
      delete out.userEmail; // remove raw email

      // Defensive: remove any accidental raw text fields
      delete out.extractedText;
      delete out.previewText;
      delete out.renderableContent;

      return out;
    });

    return res.json({
      ok: true,
      range,
      data: {
        ...value,
        files: sanitizedFiles,
      },
      meta: {
        cache: wrapped.cache,
        generatedAt: new Date().toISOString(),
        requestId,
      },
    });
  } catch (err: any) {
    if (err?.code === "BAD_REQUEST") {
      return badRequest(res, err?.message ?? "Invalid request", requestId);
    }
    return internalError(res, requestId);
  }
}
