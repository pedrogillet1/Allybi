/* eslint-disable @typescript-eslint/no-explicit-any */

import { emit } from "../index";
import { TELEMETRY_CATEGORY, TELEMETRY_EVENT, TELEMETRY_SEVERITY } from "../constants";
import type { TelemetryContext } from "../context";
import type { LlmEventPayload } from "../types";

/**
 * LLM Telemetry Emitter (Koda-native)
 * ----------------------------------
 * Purpose:
 *  - Emit clean, dashboard-friendly LLM lifecycle events using the central telemetry.emit().
 *
 * Guarantees:
 *  - No secrets in payload (prompts, raw messages, API keys).
 *  - Uses canonical event names from telemetry/constants.ts.
 *  - Never throws upstream.
 *
 * Notes:
 *  - If you want full prompt auditing, do it behind a strict feature flag and redact aggressively.
 */

function base(ctx: TelemetryContext) {
  return {
    category: TELEMETRY_CATEGORY.LLM,
    correlationId: ctx.correlationId,
    requestId: ctx.requestId,
    sessionId: ctx.sessionId,
    userId: ctx.userId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    conversationId: ctx.conversationId,
    messageId: ctx.messageId,
    documentId: ctx.documentId,
    folderId: ctx.folderId,
  };
}

function sanitize(payload: LlmEventPayload): LlmEventPayload {
  const out: any = { ...(payload || {}) };

  // Never allow raw prompt/response content or secrets in telemetry
  delete out.prompt;
  delete out.messages;
  delete out.systemPrompt;
  delete out.toolPrompt;
  delete out.raw;
  delete out.responseText;
  delete out.apiKey;
  delete out.authorization;
  delete out.token;
  delete out.accessToken;
  delete out.refreshToken;
  delete out.secret;

  // Keep error safe (stack handled by sinks in dev if desired)
  if (out.error) {
    const e: any = out.error;
    out.error = {
      code: e.code,
      message: e.message || "error",
      where: e.where,
      meta: e.meta,
    };
  }

  return out;
}

export const llmEmitter = {
  /**
   * LLM request started (before calling provider).
   */
  async request(
    ctx: TelemetryContext,
    payload: Pick<LlmEventPayload, "provider" | "model" | "requestType"> & Partial<LlmEventPayload>
  ) {
    return emit(TELEMETRY_EVENT.LLM_REQUEST, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitize(payload as LlmEventPayload),
    });
  },

  /**
   * Time-to-first-token (TTFT) observed.
   */
  async firstToken(ctx: TelemetryContext, ttftMs: number, extra?: Partial<LlmEventPayload>) {
    return emit(TELEMETRY_EVENT.LLM_FIRST_TOKEN, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitize({
        ttftMs,
        ...(extra || {}),
      } as LlmEventPayload),
    });
  },

  /**
   * Streaming finished (provider stream ended).
   */
  async streamDone(ctx: TelemetryContext, extra?: Partial<LlmEventPayload>) {
    return emit(TELEMETRY_EVENT.LLM_STREAM_DONE, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitize((extra || {}) as LlmEventPayload),
    });
  },

  /**
   * Final response received (post-parse).
   */
  async response(
    ctx: TelemetryContext,
    payload: Pick<LlmEventPayload, "provider" | "model" | "requestType"> &
      Partial<
        Pick<
          LlmEventPayload,
          "inputTokens" | "outputTokens" | "totalTokens" | "estimatedCostUsd" | "totalMs" | "cached"
        >
      >
  ) {
    return emit(TELEMETRY_EVENT.LLM_RESPONSE, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      payload: sanitize(payload as LlmEventPayload),
    });
  },

  /**
   * LLM error (provider error or parsing error).
   */
  async error(
    ctx: TelemetryContext,
    payload: Pick<LlmEventPayload, "provider" | "model" | "requestType"> & Partial<LlmEventPayload>
  ) {
    return emit(TELEMETRY_EVENT.LLM_ERROR, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.ERROR,
      payload: sanitize(payload as LlmEventPayload),
    });
  },
};

export default llmEmitter;
