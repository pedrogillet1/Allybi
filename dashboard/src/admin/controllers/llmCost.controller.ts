// file: src/admin/controllers/llmCost.controller.ts
import type { Request, Response } from "express";
import { createAnalyticsCache } from "../../analytics/cache/analytics.cache";
import { cacheKeys } from "../../analytics/cache/cacheKeys";
import { llmCostService } from "../services/llmCost.service";

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

function parseBool(input: unknown, def: boolean): boolean {
  if (typeof input !== "string") return def;
  if (input === "true") return true;
  if (input === "false") return false;
  return def;
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

/**
 * GET /api/admin/llm-cost?range=7d&provider=openai&model=gpt-5.2-pro&includeErrors=false&limit=50&offset=0
 *
 * Read-only. Returns LLM cost/tokens/latency aggregates and a recent calls table.
 * Must never include prompts, user message text, or document content.
 */
export async function getLlmCost(req: Request, res: Response) {
  const requestId = getRequestId(req);

  try {
    const range = parseRange(req.query.range);

    const limit = parseIntClamped(req.query.limit, 50, 1, 200);
    const offset = parseIntClamped(req.query.offset, 0, 0, 1_000_000);

    const provider = parseOptionalString(req.query.provider, 60);
    const model = parseOptionalString(req.query.model, 120);
    const includeErrors = parseBool(req.query.includeErrors, false);

    const filters = { provider, model, includeErrors, limit, offset };

    const key = cacheKeys.llmCost(range, filters);

    const wrapped = await cache.wrap(
      key,
      30,
      async () => {
        return llmCostService.getLlmCost({
          range,
          provider,
          model,
          includeErrors,
          limit,
          offset,
        });
      },
      {
        staleTtlSeconds: 120,
        allowStaleOnError: true,
      }
    );

    // Defensive sanitization: ensure no raw prompt/response fields leak if service accidentally includes them
    const value: any = wrapped.value ?? {};
    const calls = Array.isArray(value.calls) ? value.calls : [];

    const sanitizedCalls = calls.map((c: any) => {
      const out: any = { ...c };
      delete out.prompt;
      delete out.input;
      delete out.output;
      delete out.response;
      delete out.messages;
      delete out.documentText;
      delete out.extractedText;
      delete out.queryText;
      return out;
    });

    return res.json({
      ok: true,
      range,
      data: {
        ...value,
        calls: sanitizedCalls,
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
