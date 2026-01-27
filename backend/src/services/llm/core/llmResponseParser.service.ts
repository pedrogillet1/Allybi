// src/services/llm/core/llmResponseParser.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * LlmResponseParserService (Koda, ChatGPT-parity)
 * ----------------------------------------------
 * Normalizes provider-native responses into Koda's stable LlmResponse shape.
 *
 * Goals:
 *  - Provider-agnostic output for downstream gates (trust/quality/output contract)
 *  - Streaming-compatible: parse partial deltas and final payloads
 *  - Safe: do not assume JSON output is user-visible; it will be transformed later
 *  - Deterministic: stable finish reasons and usage mapping
 *
 * This service does NOT:
 *  - apply policy gates
 *  - rewrite content
 *  - enforce output contract
 *
 * It DOES:
 *  - Parse:
 *      - OpenAI style responses
 *      - Gemini style responses
 *      - Local model style responses (Ollama / custom)
 *  - Normalize finish reasons and usage
 *  - Extract tool calls if present
 */

import type {
  LlmFinishReason,
  LlmResponse,
  LlmSafetyReport,
  LlmToolCall,
  LlmUsage,
} from "../types/llm.types";

type ProviderId = "openai" | "gemini" | "local" | (string & {});

function clampInt(x: any): number | undefined {
  const n = Number(x);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : undefined;
}

function normalizeFinishReason(raw: any): LlmFinishReason {
  const s = String(raw ?? "").toLowerCase();

  if (s.includes("stop")) return "stop";
  if (s.includes("length") || s.includes("max_tokens")) return "length";
  if (s.includes("tool")) return "tool_calls";
  if (s.includes("content_filter") || s.includes("safety")) return "content_filter";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("error")) return "error";

  return "unknown";
}

function normalizeUsage(raw: any): LlmUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  // common shapes:
  // - { prompt_tokens, completion_tokens, total_tokens }
  // - { inputTokens, outputTokens, totalTokens }
  const inputTokens =
    clampInt(raw.prompt_tokens) ??
    clampInt(raw.input_tokens) ??
    clampInt(raw.inputTokens);

  const outputTokens =
    clampInt(raw.completion_tokens) ??
    clampInt(raw.output_tokens) ??
    clampInt(raw.outputTokens);

  const totalTokens =
    clampInt(raw.total_tokens) ??
    clampInt(raw.totalTokens) ??
    (inputTokens != null && outputTokens != null ? inputTokens + outputTokens : undefined);

  if (inputTokens == null && outputTokens == null && totalTokens == null) return undefined;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    providerUsage: raw,
  };
}

function normalizeToolCalls(raw: any): LlmToolCall[] | undefined {
  if (!raw) return undefined;

  // OpenAI: choices[0].message.tool_calls
  const tc = raw?.choices?.[0]?.message?.tool_calls;
  if (Array.isArray(tc) && tc.length) {
    return tc.map((t: any) => ({
      id: String(t.id ?? ""),
      name: String(t.function?.name ?? t.name ?? ""),
      argumentsJson: typeof t.function?.arguments === "string" ? t.function.arguments : JSON.stringify(t.function?.arguments ?? t.arguments ?? {}),
    }));
  }

  // Gemini/local: may store tool calls differently
  const alt = raw?.toolCalls ?? raw?.tool_calls ?? null;
  if (Array.isArray(alt) && alt.length) {
    return alt.map((t: any) => ({
      id: String(t.id ?? ""),
      name: String(t.name ?? t.function?.name ?? ""),
      argumentsJson: typeof t.argumentsJson === "string" ? t.argumentsJson : JSON.stringify(t.arguments ?? t.function?.arguments ?? {}),
    }));
  }

  return undefined;
}

function normalizeSafety(raw: any): LlmSafetyReport | undefined {
  if (!raw) return undefined;

  // OpenAI may return content_filter finish reason; Gemini may return safety ratings.
  // We keep this conservative. If unknown, omit.
  const flagged =
    Boolean(raw?.flagged) ||
    Boolean(raw?.safety?.flagged) ||
    Boolean(raw?.prompt_feedback?.block_reason) ||
    Boolean(raw?.candidates?.some?.((c: any) => c?.safetyRatings?.some?.((r: any) => r?.blocked)));

  if (!flagged) return undefined;

  return {
    flagged: true,
    providerDetail: raw?.safety ?? raw?.prompt_feedback ?? raw?.candidates ?? raw,
  };
}

function extractText(raw: any, provider: ProviderId): string {
  // OpenAI:
  // - choices[0].message.content
  const openaiText = raw?.choices?.[0]?.message?.content;
  if (typeof openaiText === "string") return openaiText;

  // Some OpenAI streaming aggregates might store output_text
  if (typeof raw?.output_text === "string") return raw.output_text;

  // Gemini:
  // - candidates[0].content.parts[].text
  const parts = raw?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const t = parts.map((p: any) => p?.text).filter((x: any) => typeof x === "string").join("");
    if (t) return t;
  }

  // Gemini alt:
  const gemText = raw?.candidates?.[0]?.output;
  if (typeof gemText === "string") return gemText;

  // Local (Ollama):
  // - response
  if (typeof raw?.response === "string") return raw.response;

  // Fallback: stringify safe snippet
  if (typeof raw === "string") return raw;
  return "";
}

export class LlmResponseParserService {
  /**
   * Parse a provider-native full response object into a normalized LlmResponse.
   */
  parse(args: { provider: ProviderId; model: string; raw: any }): LlmResponse {
    const { provider, raw } = args;

    const text = extractText(raw, provider) ?? "";
    const toolCalls = normalizeToolCalls(raw);
    const usage = normalizeUsage(raw?.usage ?? raw?.usageMetadata ?? raw);
    const finishReason =
      normalizeFinishReason(raw?.choices?.[0]?.finish_reason ?? raw?.candidates?.[0]?.finishReason ?? raw?.finish_reason ?? raw?.done_reason);

    const safety = normalizeSafety(raw);

    return {
      text,
      toolCalls,
      finishReason,
      usage,
      safety,
      raw,
    };
  }

  /**
   * Parse a streaming “final frame” (if your stream adapter provides one).
   * If your adapter already builds a LlmResponse, you can skip this.
   */
  parseFinalFromStream(args: { provider: ProviderId; model: string; finalPayload: any }): LlmResponse {
    return this.parse({ provider: args.provider, model: args.model, raw: args.finalPayload });
  }
}

export default LlmResponseParserService;
