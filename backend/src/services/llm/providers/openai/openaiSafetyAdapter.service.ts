// src/services/llm/providers/openai/openaiSafetyAdapter.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * OpenAISafetyAdapterService (Koda, ChatGPT-parity)
 * ------------------------------------------------
 * Purpose:
 *  - Apply Koda safety/privacy policies to OpenAI requests and responses
 *    without hardcoding user-facing copy.
 *
 * In Koda architecture:
 *  - Policies live in data_banks/policies/*
 *  - TrustGate / QualityGate enforce system-level rules
 *  - This adapter is a *provider-specific* safety shim for:
 *      - request-time shaping (prevent unsafe prompt payloads)
 *      - response-time flag normalization
 *
 * What it does:
 *  - Ensures we do not send disallowed content payload shapes to OpenAI
 *    (e.g., images, raw internal IDs, debug dumps) if configured.
 *  - Normalizes any provider safety signals into LlmSafetyReport
 *
 * What it does NOT do:
 *  - Decide refusals (refusal_policy handles that)
 *  - Generate refusal text (microcopy banks do that)
 *  - Leak moderation category details to users
 */

import type {
  LlmRequest,
  LlmResponse,
  LlmSafetyReport,
} from "../../types/llm.types";

export interface BankLoader {
  getBank<T = any>(bankId: string): T;
}

export interface OpenAISafetyAdapterConfig {
  enabled: boolean;

  /**
   * If true, strip any internal ids/debug traces from outgoing prompts.
   * This is defense-in-depth; Koda prompt builders should already avoid it.
   */
  stripInternalIdsFromPrompts: boolean;

  /**
   * If true, strip filesystem-like paths from prompts.
   */
  stripSystemPathsFromPrompts: boolean;

  /**
   * If true, refuse to send image parts to OpenAI in this lane.
   */
  strictNoImages: boolean;

  /**
   * Redaction replacement token.
   */
  replacement: string;
}

const DEFAULT_CONFIG: OpenAISafetyAdapterConfig = {
  enabled: true,
  stripInternalIdsFromPrompts: true,
  stripSystemPathsFromPrompts: true,
  strictNoImages: true,
  replacement: "[redacted]",
};

// Conservative internal id/path patterns
const INTERNAL_ID_RE = /\b(docId|chunkId|internalId|traceId|requestId)\b\s*[:=]\s*[A-Za-z0-9._-]+/gi;
const SYSTEM_PATH_RE = /([A-Z]:\\|\/home\/|\/Users\/)[^\s"]+/g;

export class OpenAISafetyAdapterService {
  private cfg: OpenAISafetyAdapterConfig;

  constructor(private readonly bankLoader?: BankLoader, cfg: Partial<OpenAISafetyAdapterConfig> = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
  }

  /**
   * Apply request-time shaping.
   * Returns a shallow-cloned request if modifications were required.
   */
  shapeRequest(req: LlmRequest): LlmRequest {
    if (!this.cfg.enabled) return req;

    let changed = false;
    const next = { ...req, messages: req.messages.map((m) => ({ ...m })) };

    // 1) No images (OpenAI lane in Koda is text-only)
    if (this.cfg.strictNoImages) {
      for (const m of next.messages) {
        if (Array.isArray((m as any).parts)) {
          const before = (m as any).parts.length;
          (m as any).parts = (m as any).parts.filter((p: any) => p?.type !== "image_url");
          if ((m as any).parts.length !== before) changed = true;
        }
      }
    }

    // 2) Strip internal ids/paths from content
    for (const m of next.messages) {
      const text = typeof m.content === "string" ? m.content : null;
      if (!text) continue;

      let out = text;

      if (this.cfg.stripInternalIdsFromPrompts) {
        const stripped = out.replace(INTERNAL_ID_RE, this.cfg.replacement);
        if (stripped !== out) {
          out = stripped;
          changed = true;
        }
      }

      if (this.cfg.stripSystemPathsFromPrompts) {
        const stripped = out.replace(SYSTEM_PATH_RE, this.cfg.replacement);
        if (stripped !== out) {
          out = stripped;
          changed = true;
        }
      }

      if (out !== text) m.content = out;
    }

    return changed ? next : req;
  }

  /**
   * Normalize OpenAI response safety signals into LlmSafetyReport.
   * Koda policies may still enforce refusals elsewhere; this is a hint layer.
   */
  parseSafetyFromResponse(raw: any): LlmSafetyReport | undefined {
    if (!this.cfg.enabled) return undefined;

    // OpenAI may indicate content filtering via finish_reason in chat completions
    const finish = raw?.choices?.[0]?.finish_reason;
    const contentFiltered = typeof finish === "string" && finish.toLowerCase().includes("content_filter");

    // Some OpenAI systems include moderation-like structures in provider responses
    const flagged =
      contentFiltered ||
      Boolean(raw?.flagged) ||
      Boolean(raw?.moderation?.flagged) ||
      Boolean(raw?.safety?.flagged);

    if (!flagged) return undefined;

    return {
      flagged: true,
      categories: {
        other: true,
      },
      severity: 0.85,
      providerDetail: {
        finish_reason: finish,
        moderation: raw?.moderation ?? raw?.safety ?? null,
      },
    };
  }

  /**
   * Convenience: attach normalized safety report to a parsed LlmResponse.
   */
  attachSafety(response: LlmResponse): LlmResponse {
    const safety = this.parseSafetyFromResponse(response.raw);
    if (!safety) return response;
    return { ...response, safety };
  }
}

export default OpenAISafetyAdapterService;
