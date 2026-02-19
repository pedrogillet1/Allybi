/**
 * geminiPromptAdapter.service.ts
 *
 * High-quality, provider-aware prompt adapter for Gemini (Google).
 * Responsibilities (Allybi-aligned):
 * - Convert Allybi’s normalized LLMRequest (messages/tools/sampling) into Gemini request payloads
 * - Convert Gemini responses (including function/tool calls) back into Allybi-normalized structures
 * - Keep behavior deterministic (stable role mapping, stable tool declaration order, stable JSON encoding)
 * - Never include user-facing microcopy (that belongs in banks)
 *
 * Non-responsibilities:
 * - No trust/safety policy decisions (Trust Gate)
 * - No retrieval logic (RAG stage)
 * - No tool execution (orchestrator)
 */

import crypto from "crypto";
import type {
  LLMRequest,
  LLMMessage,
  LLMRole,
  LLMSampling,
} from "./llmClient.interface";
import type {
  ToolRegistry,
  ProviderToolCall,
  ToolResult,
} from "./llmTools.types";
import type { LLMProvider } from "./llmErrors.types";

export type GeminiApiMode = "generateContent" | "streamGenerateContent";

/** Gemini "role" values in REST API */
type GeminiRole = "user" | "model";

/** Gemini request shapes (v1beta-like) */
interface GeminiPartText {
  text: string;
}

interface GeminiPartFunctionCall {
  functionCall: {
    name: string;
    args?: Record<string, unknown>;
  };
}

interface GeminiPartFunctionResponse {
  functionResponse: {
    name: string;
    response: Record<string, unknown>;
  };
}

type GeminiPart =
  | GeminiPartText
  | GeminiPartFunctionCall
  | GeminiPartFunctionResponse;

interface GeminiContent {
  role: GeminiRole;
  parts: GeminiPart[];
}

interface GeminiToolSchema {
  functionDeclarations: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  }>;
}

export interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
}

export interface GeminiSafetySetting {
  category: string;
  threshold: string;
}

export interface GeminiSystemInstruction {
  parts: GeminiPartText[];
}

export interface GeminiRequestPayload {
  contents: GeminiContent[];
  systemInstruction?: GeminiSystemInstruction;
  tools?: GeminiToolSchema[];
  generationConfig?: GeminiGenerationConfig;
  safetySettings?: GeminiSafetySetting[]; // optional; set by higher-level policy if needed
}

/** Gemini response shapes */
interface GeminiCandidate {
  content?: GeminiContent;
  finishReason?: string;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface GeminiResponsePayload {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
}

/** Normalized parse result */
export interface GeminiParsedOutput {
  /** Text produced by model (concatenated from all text parts) */
  text: string;

  /**
   * Tool calls requested by Gemini (functionCall parts).
   * These are normalized to ProviderToolCall (provider='google').
   */
  toolCalls: ProviderToolCall[];

  /** Finish reason if present */
  finishReason?: string;

  /** Token usage if present */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/** Adapter config */
export interface GeminiPromptAdapterConfig {
  /**
   * If true, we use the top-level `systemInstruction` field for system/developer messages.
   * If false, we fold them into the first user message as a preface (legacy behavior).
   */
  useSystemInstruction: boolean;

  /**
   * Legacy: If true and useSystemInstruction is false, fold system/developer into user preface.
   * Ignored when useSystemInstruction is true.
   */
  foldSystemAndDeveloperIntoUser: boolean;

  /**
   * If true, tool schemas are included when tools.enabled.
   * If false, adapter will ignore tool registry (still can parse tool calls if returned).
   */
  includeToolsInRequest: boolean;

  /**
   * Deterministic tool declaration ordering:
   * - 'registry': keep registry.tools order as provided
   * - 'alpha': sort by tool name
   */
  toolDeclarationOrder: "registry" | "alpha";

  /**
   * If true, we remove empty/whitespace-only messages (deterministic cleanup).
   */
  dropEmptyMessages: boolean;

  /**
   * Max size caps for safety (bytes). If exceeded, adapter throws.
   * (Upstream should also cap tokens; this is a deterministic final check.)
   */
  maxRequestBytes?: number;

  /**
   * If true, adapter will generate deterministic callIds for ProviderToolCall normalization.
   * Gemini doesn’t provide call ids reliably; this helps tracing.
   */
  deterministicToolCallIds: boolean;

  /**
   * Hash salt for deterministic toolCall ids.
   */
  toolCallIdSalt?: string;
}

export class GeminiPromptAdapterService {
  constructor(private readonly cfg: GeminiPromptAdapterConfig) {}

  /**
   * Convert a Allybi LLMRequest into a GeminiRequestPayload.
   */
  toGeminiRequest(req: LLMRequest): GeminiRequestPayload {
    const { contents, systemParts } = this.buildContents(req.messages);

    const payload: GeminiRequestPayload = {
      contents,
      generationConfig: this.buildGenerationConfig(req.sampling),
    };

    // Use top-level systemInstruction when enabled and system messages exist
    if (this.cfg.useSystemInstruction && systemParts.length > 0) {
      payload.systemInstruction = {
        parts: systemParts.map((text) => ({ text })),
      };
    }

    if (this.cfg.includeToolsInRequest && req.tools?.enabled) {
      const toolSchema = this.buildToolSchema(req.tools.registry);
      if (toolSchema) payload.tools = [toolSchema];
    }

    this.enforceMaxBytes(payload);
    return payload;
  }

  /**
   * Convert Gemini response payload into normalized output.
   * Deterministic: first candidate only.
   */
  parseGeminiResponse(resp: GeminiResponsePayload): GeminiParsedOutput {
    const candidates = resp.candidates ?? [];
    const c0 = candidates[0];

    const usage = resp.usageMetadata
      ? {
          promptTokens: resp.usageMetadata.promptTokenCount,
          completionTokens: resp.usageMetadata.candidatesTokenCount,
          totalTokens: resp.usageMetadata.totalTokenCount,
        }
      : undefined;

    if (!c0?.content?.parts?.length) {
      return { text: "", toolCalls: [], finishReason: c0?.finishReason, usage };
    }

    const toolCalls: ProviderToolCall[] = [];
    let text = "";

    for (const part of c0.content.parts) {
      if (isTextPart(part)) {
        text += part.text;
      } else if (isFunctionCallPart(part)) {
        const call = this.normalizeFunctionCall(
          part.functionCall.name,
          part.functionCall.args ?? {},
        );
        toolCalls.push(call);
      }
    }

    return {
      text,
      toolCalls,
      finishReason: c0.finishReason,
      usage,
    };
  }

  /**
   * Convert a Allybi tool result into a Gemini functionResponse part.
   * Use this to feed tool results back into Gemini.
   */
  toolResultToGeminiContent(params: {
    toolResult: ToolResult;
    /** Optional explicit function name override */
    functionName?: string;
  }): GeminiContent {
    const name = params.functionName ?? params.toolResult.toolName;

    return {
      role: "user",
      parts: [
        {
          functionResponse: {
            name,
            response: {
              ok: params.toolResult.ok,
              output: params.toolResult.output ?? null,
              error: params.toolResult.error ?? null,
              timing: params.toolResult.timing ?? null,
            },
          },
        } as GeminiPartFunctionResponse,
      ],
    };
  }

  /**
   * Convert a Allybi assistant tool call message into Gemini functionCall parts.
   * This is rarely needed because Gemini generally generates functionCall parts itself,
   * but it’s useful for replays / deterministic tests.
   */
  assistantToolCallsToGeminiParts(toolCalls: ProviderToolCall[]): GeminiPart[] {
    const parts: GeminiPart[] = [];
    for (const tc of toolCalls) {
      parts.push({
        functionCall: {
          name: tc.name,
          args:
            "args" in tc
              ? (tc.args as Record<string, unknown>)
              : (safeJsonParse(tc.argumentsJson) ?? {}),
        },
      } as GeminiPartFunctionCall);
    }
    return parts;
  }

  /* ------------------------- message building ------------------------- */

  private buildContents(messages: LLMMessage[]): {
    contents: GeminiContent[];
    systemParts: string[];
  } {
    const cleaned = this.cfg.dropEmptyMessages
      ? messages.filter((m) => !isEffectivelyEmpty(m))
      : messages;

    const out: GeminiContent[] = [];
    const systemParts: string[] = [];
    const systemPreface: string[] = [];

    for (const m of cleaned) {
      if (m.role === "system" || m.role === "developer") {
        const text = (m.content ?? "").trim();
        if (!text) continue;

        if (this.cfg.useSystemInstruction) {
          // Collect for top-level systemInstruction field
          systemParts.push(text);
        } else if (this.cfg.foldSystemAndDeveloperIntoUser) {
          // Legacy: fold into user preface
          systemPreface.push(text);
        }
        continue;
      }

      if (m.role === "user") {
        // If we have a legacy preface, inject it once before the first user message.
        if (
          !this.cfg.useSystemInstruction &&
          this.cfg.foldSystemAndDeveloperIntoUser &&
          systemPreface.length > 0
        ) {
          out.push({
            role: "user",
            parts: [{ text: systemPreface.join("\n\n") }],
          });
          systemPreface.length = 0;
        }

        out.push({
          role: "user",
          parts: [{ text: m.content ?? "" }],
        });
        continue;
      }

      if (m.role === "assistant") {
        const parts: GeminiPart[] = [];
        if (m.content) parts.push({ text: m.content });

        if (m.toolCalls?.length) {
          parts.push(...this.assistantToolCallsToGeminiParts(m.toolCalls));
        }

        // If there's no content and no tool calls, keep deterministic empty model message only if not dropping empties
        if (parts.length === 0 && !this.cfg.dropEmptyMessages) {
          parts.push({ text: "" });
        }

        out.push({ role: "model", parts });
        continue;
      }

      if (m.role === "tool") {
        // Tools results are represented as functionResponse parts
        if (m.toolResult) {
          out.push(
            this.toolResultToGeminiContent({ toolResult: m.toolResult }),
          );
        } else {
          // deterministic fallback: represent as empty user content
          out.push({ role: "user", parts: [{ text: "" }] });
        }
        continue;
      }

      // Unknown roles: fold as user text deterministically
      out.push({ role: "user", parts: [{ text: m.content ?? "" }] });
    }

    // If legacy systemPreface never got injected (no user message), inject once at end
    if (
      !this.cfg.useSystemInstruction &&
      this.cfg.foldSystemAndDeveloperIntoUser &&
      systemPreface.length > 0
    ) {
      out.push({
        role: "user",
        parts: [{ text: systemPreface.join("\n\n") }],
      });
    }

    return { contents: out, systemParts };
  }

  /* ------------------------- tools schema ------------------------- */

  private buildToolSchema(registry?: ToolRegistry): GeminiToolSchema | null {
    if (!registry?.tools?.length) return null;

    const tools =
      this.cfg.toolDeclarationOrder === "alpha"
        ? [...registry.tools].sort((a, b) => a.name.localeCompare(b.name))
        : registry.tools;

    return {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: (t.inputSchema ?? {}) as Record<string, unknown>,
      })),
    };
  }

  /* ------------------------- generation config ------------------------- */

  private buildGenerationConfig(
    sampling?: LLMSampling,
  ): GeminiGenerationConfig | undefined {
    if (!sampling) return undefined;

    // Gemini supports temperature/topP/maxOutputTokens. Keep minimal and deterministic.
    const out: GeminiGenerationConfig = {};

    if (isFiniteNumber(sampling.temperature))
      out.temperature = sampling.temperature;
    if (isFiniteNumber(sampling.topP)) out.topP = sampling.topP;
    if (isFiniteNumber(sampling.maxOutputTokens))
      out.maxOutputTokens = sampling.maxOutputTokens;

    // Ignore presencePenalty/frequencyPenalty/seed unless you explicitly support them in your Gemini config layer.
    return out;
  }

  /* ------------------------- function call normalization ------------------------- */

  private normalizeFunctionCall(
    name: string,
    args: Record<string, unknown>,
  ): ProviderToolCall {
    // Gemini provider tool call representation
    // Note: ProviderToolCall for google has no explicit callId slot.
    // If you need callId tracking, store it in args or meta upstream.
    // Here we optionally add a deterministic callId into args under a reserved key.
    if (this.cfg.deterministicToolCallIds) {
      const callId = deterministicToolCallId(
        name,
        args,
        this.cfg.toolCallIdSalt ?? "",
      );
      // Do not overwrite if already present
      if (!Object.prototype.hasOwnProperty.call(args, "__callId")) {
        args = { ...args, __callId: callId };
      }
    }

    return {
      provider: "google",
      name,
      args,
    };
  }

  /* ------------------------- safety / size guards ------------------------- */

  private enforceMaxBytes(payload: GeminiRequestPayload): void {
    if (!this.cfg.maxRequestBytes) return;
    const raw = JSON.stringify(payload);
    const bytes = Buffer.byteLength(raw, "utf8");
    if (bytes > this.cfg.maxRequestBytes) {
      throw new Error(
        `GEMINI_REQUEST_TOO_LARGE:${bytes}:${this.cfg.maxRequestBytes}`,
      );
    }
  }
}

/* ------------------------- type guards + utils ------------------------- */

function isTextPart(p: GeminiPart): p is GeminiPartText {
  return typeof (p as any)?.text === "string";
}

function isFunctionCallPart(p: GeminiPart): p is GeminiPartFunctionCall {
  return typeof (p as any)?.functionCall?.name === "string";
}

function isEffectivelyEmpty(m: LLMMessage): boolean {
  const c = (m.content ?? "").trim();
  const hasToolCalls = !!m.toolCalls?.length;
  const hasToolResult = !!m.toolResult;
  // A message is "empty" only if it has no content and no tool-related payloads
  return c.length === 0 && !hasToolCalls && !hasToolResult;
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function safeJsonParse(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function deterministicToolCallId(
  name: string,
  args: Record<string, unknown>,
  salt: string,
): string {
  const stableArgs = sortKeysDeep(args);
  const h = crypto.createHash("sha256");
  h.update(salt);
  h.update("|");
  h.update(name);
  h.update("|");
  h.update(JSON.stringify(stableArgs));
  return h.digest("hex").slice(0, 24);
}

function sortKeysDeep<T>(x: T): T {
  if (x === null || typeof x !== "object") return x;
  if (Array.isArray(x)) return x.map(sortKeysDeep) as unknown as T;

  const obj = x as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = sortKeysDeep(obj[k]);
  return out as T;
}
