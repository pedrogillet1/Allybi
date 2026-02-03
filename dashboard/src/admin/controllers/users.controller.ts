// file: src/admin/controllers/users.controller.ts
import type { Request, Response } from "express";
import crypto from "crypto";
import { createAnalyticsCache } from "../../analytics/cache/analytics.cache";
import { cacheKeys } from "../../analytics/cache/cacheKeys";
import { usersService } from "../services/users.service";

type Range = "24h" | "7d" | "30d" | "90d";

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
 * GET /api/admin/users?range=7d&search=...&tier=...&limit=50&offset=0
 *
 * Read-only. Returns users list with masked identifiers (no raw emails).
 * If your frontend currently expects full emails, you should update it to use:
 * - emailMasked (display)
 * - emailHash (identifier)
 */
export async function getUsers(req: Request, res: Response) {
  const requestId = getRequestId(req);

  try {
    const range = parseRange(req.query.range);
    const limit = parseIntClamped(req.query.limit, 50, 1, 200);
    const offset = parseIntClamped(req.query.offset, 0, 0, 1_000_000);

    const search = parseOptionalString(req.query.search, 120);
    const tier = parseOptionalString(req.query.tier, 50);

    const filters = {
      search,
      tier,
      limit,
      offset,
    };

    const key = cacheKeys.users(range, filters);

    const wrapped = await cache.wrap(
      key,
      30, // ttl seconds
      async () => {
        // Expected service return shape (flexible):
        // { users: [...], total: number, charts?: {...} }
        return usersService.listUsers({
          range,
          search,
          tier,
          limit,
          offset,
        });
      },
      {
        staleTtlSeconds: 120,
        allowStaleOnError: true,
      }
    );

    // Enforce response hygiene: mask emails if present
    const value: any = wrapped.value ?? {};
    const users = Array.isArray(value.users) ? value.users : [];

    const sanitizedUsers = users.map((u: any) => {
      const email = typeof u.email === "string" ? u.email : null;
      const out: any = { ...u };

      if (email) {
        out.emailMasked = maskEmail(email);
        out.emailHash = hashStable(email.toLowerCase());
        delete out.email; // remove raw email
      } else {
        out.emailMasked = null;
        out.emailHash = null;
      }

      // Ensure no plaintext sensitive fields leak:
      delete out.password;
      delete out.phone;
      delete out.recoveryPhrase;
      delete out.recoveryKey;
      delete out.verificationCode;

      return out;
    });

    const responseData = {
      ...value,
      users: sanitizedUsers,
    };

    return res.json({
      ok: true,
      range,
      data: responseData,
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
