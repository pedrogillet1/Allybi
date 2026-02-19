// src/services/llm/providers/openai/openaiToolAdapter.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * OpenAIToolAdapterService (Allybi, ChatGPT-parity)
 * ----------------------------------------------
 * Converts Allybi tool definitions (provider-agnostic) into OpenAI tool schemas
 * and normalizes OpenAI tool calls back into Allybi's LlmToolCall shape.
 *
 * Goals:
 *  - Deterministic tool ordering and naming
 *  - Strict JSON arguments handling:
 *      - always produce argumentsJson as a string
 *      - never assume valid JSON until validated by tool runner
 *  - Support both:
 *      - OpenAI Chat Completions tool_calls
 *      - OpenAI Responses API tool events
 *
 * This service does NOT:
 *  - execute tools
 *  - pick which tool to call
 *  - enforce policy
 */

import type { LlmToolCall } from "../../types/llm.types";

export type KodaToolDefinition =
  | {
      name: string;
      description?: string;
      parameters?: any; // JSON Schema
    }
  | {
      type: "function";
      function: {
        name: string;
        description?: string;
        parameters?: any; // JSON Schema
      };
    };

export type OpenAIToolDefinition = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: any;
  };
};

export type OpenAIToolChoice =
  | "auto"
  | "none"
  | {
      type: "function";
      function: { name: string };
    };

function safeString(x: any): string {
  if (typeof x === "string") return x;
  if (x == null) return "";
  return String(x);
}

function stableSortByName(
  tools: OpenAIToolDefinition[],
): OpenAIToolDefinition[] {
  return tools
    .slice()
    .sort((a, b) =>
      safeString(a.function?.name).localeCompare(safeString(b.function?.name)),
    );
}

function normalizeParameters(p: any): any {
  if (!p || typeof p !== "object") {
    return { type: "object", properties: {} };
  }
  // Ensure JSON Schema-ish base shape
  if (!p.type) p.type = "object";
  if (!p.properties) p.properties = {};
  return p;
}

export class OpenAIToolAdapterService {
  /**
   * Convert Allybi tool definitions to OpenAI tools array.
   * Deterministic ordering by function name.
   */
  toOpenAITools(
    tools?: KodaToolDefinition[],
  ): OpenAIToolDefinition[] | undefined {
    if (!Array.isArray(tools) || tools.length === 0) return undefined;

    const normalized: OpenAIToolDefinition[] = tools.map((t) => {
      // Already OpenAI-shaped
      if ((t as any)?.type === "function" && (t as any)?.function) {
        const fn = (t as any).function;
        return {
          type: "function",
          function: {
            name: safeString(fn.name),
            description: fn.description
              ? safeString(fn.description)
              : undefined,
            parameters: normalizeParameters(fn.parameters),
          },
        };
      }

      // Allybi minimal tool definition
      const name = safeString((t as any).name);
      const description = (t as any).description
        ? safeString((t as any).description)
        : undefined;
      const parameters = normalizeParameters((t as any).parameters);

      return {
        type: "function",
        function: { name, description, parameters },
      };
    });

    // Filter invalid (no name)
    const filtered = normalized.filter((t) => t.function.name.length > 0);

    return stableSortByName(filtered);
  }

  /**
   * Normalize Allybi toolChoice into OpenAI tool_choice.
   */
  toOpenAIToolChoice(toolChoice: any): OpenAIToolChoice | undefined {
    if (!toolChoice) return undefined;
    if (toolChoice === "auto" || toolChoice === "none") return toolChoice;

    if (typeof toolChoice === "object" && toolChoice.name) {
      return {
        type: "function",
        function: { name: safeString(toolChoice.name) },
      };
    }

    return undefined;
  }

  /**
   * Parse OpenAI tool calls from a completed Chat Completions response.
   * Returns Allybi LlmToolCall objects.
   */
  parseToolCallsFromChatCompletion(raw: any): LlmToolCall[] | undefined {
    const tc = raw?.choices?.[0]?.message?.tool_calls;
    if (!Array.isArray(tc) || tc.length === 0) return undefined;

    return tc.map((t: any) => ({
      id: safeString(t.id || ""),
      name: safeString(t.function?.name || t.name || ""),
      argumentsJson:
        typeof t.function?.arguments === "string"
          ? t.function.arguments
          : JSON.stringify(t.function?.arguments ?? t.arguments ?? {}),
    }));
  }

  /**
   * Parse OpenAI tool calls from Responses API “response” object if present.
   * OpenAI Responses API can represent tool calls in different event objects.
   * This method is best-effort and safe.
   */
  parseToolCallsFromResponses(raw: any): LlmToolCall[] | undefined {
    // Some Responses API payloads include output items with type "tool_call"
    const output = raw?.output;
    if (!Array.isArray(output) || output.length === 0) return undefined;

    const calls: LlmToolCall[] = [];

    for (const item of output) {
      // Example (best effort):
      // { type: "tool_call", id: "...", name: "...", arguments: "..." }
      if (item?.type === "tool_call" || item?.type === "function_call") {
        const id = safeString(item.id || item.call_id || "");
        const name = safeString(item.name || item.function?.name || "");
        const args =
          typeof item.arguments === "string"
            ? item.arguments
            : typeof item.function?.arguments === "string"
              ? item.function.arguments
              : JSON.stringify(
                  item.arguments ?? item.function?.arguments ?? {},
                );
        if (name)
          calls.push({
            id: id || `tool_${calls.length}`,
            name,
            argumentsJson: args,
          });
      }
    }

    return calls.length ? calls : undefined;
  }

  /**
   * Parse incremental tool call delta from OpenAI stream chunk.
   * Useful when streaming tools.
   */
  parseToolCallDeltaFromStream(
    chunk: any,
  ): { toolCallId: string; deltaJson: string } | null {
    const tc = chunk?.choices?.[0]?.delta?.tool_calls;
    if (!Array.isArray(tc) || tc.length === 0) return null;

    const t0 = tc[0];
    const id = safeString(t0.id || "toolcall_0");
    const args = t0.function?.arguments;
    if (typeof args === "string" && args.length)
      return { toolCallId: id, deltaJson: args };

    return null;
  }
}

export default OpenAIToolAdapterService;
