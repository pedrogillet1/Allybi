/**
 * toolPrompt.builder.ts
 *
 * Deterministic tool prompt builder for Allybi.
 *
 * Purpose:
 * - Build a provider-agnostic "tool calling instruction block" to be injected into prompts
 *   when tools are enabled, *without* hardcoding user-facing copy.
 * - Keep output deterministic (stable ordering, stable JSON schema rendering)
 * - Support Gemini/OpenAI/local tool calling: the actual tool-call mechanism is handled by
 *   provider adapters, but this builder provides a consistent instruction layer.
 *
 * IMPORTANT:
 * - Do NOT put fallback or UX microcopy here. Banks decide those strings.
 * - This file should only generate *internal* prompt scaffolding.
 */

import crypto from "crypto";
import type { ToolDefinition, ToolRegistry } from "./llmTools.types";

export interface ToolPromptBuilderConfig {
  /**
   * Deterministic ordering:
   * - 'registry': keep registry.tools order
   * - 'alpha': sort by tool name
   * - 'category_alpha': sort by category, then name
   */
  order: "registry" | "alpha" | "category_alpha";

  /**
   * Maximum tools to include in the prompt block (safety).
   * If exceeded, builder truncates deterministically.
   */
  maxToolsInPrompt: number;

  /**
   * If true, include JSON schemas (parameters) inline.
   * If false, include only names + short descriptions.
   */
  includeSchemas: boolean;

  /**
   * If true, include tool policy hints (timeouts, max calls, doc lock constraints).
   * These are internal-only hints to help models behave.
   */
  includePolicyHints: boolean;

  /**
   * If true, include deterministic example of the tool-call envelope
   * (provider-neutral). This helps local models that need a pattern.
   */
  includeGenericCallEnvelopeExample: boolean;

  /**
   * Hard cap on rendered schema size per tool (chars). Prevents prompt bloat.
   */
  maxSchemaCharsPerTool: number;

  /**
   * Salt for deterministic hashes used in prompt IDs.
   */
  salt?: string;
}

/** Output of the builder */
export interface ToolPromptBlock {
  /** A single markdown block to insert into system/developer prompt */
  text: string;

  /** Deterministic id for caching/debug */
  blockId: string;

  /** Tools included (ids/names) */
  included: Array<{ id: string; name: string }>;
}

export function buildToolPromptBlock(
  registry: ToolRegistry | undefined,
  cfg: ToolPromptBuilderConfig,
): ToolPromptBlock {
  const tools = registry?.tools ?? [];
  const ordered = orderTools(tools, cfg.order).slice(
    0,
    Math.max(0, cfg.maxToolsInPrompt),
  );

  const included = ordered.map((t) => ({ id: t.id, name: t.name }));

  const lines: string[] = [];
  lines.push("## Tool Use (Internal)");
  lines.push(
    "You may call tools when needed to complete the task. Use tools only when required.",
  );
  lines.push(
    "Return tool calls in the provider-native tool-call format when supported.",
  );
  lines.push("");

  lines.push("### Available tools");
  for (const t of ordered) {
    lines.push(renderToolLine(t, cfg));
  }

  if (cfg.includeGenericCallEnvelopeExample) {
    lines.push("");
    lines.push("### Generic tool-call envelope (for pattern learning)");
    lines.push(
      "If a tool call must be represented in plain text, use this strict JSON shape:",
    );
    lines.push("```json");
    lines.push(
      JSON.stringify(
        {
          tool_call: {
            name: "<tool_name>",
            args: { "<key>": "<value>" },
          },
        },
        null,
        2,
      ),
    );
    lines.push("```");
    lines.push(
      "Only emit the envelope when the provider does not support native tool calls.",
    );
  }

  const text = lines.join("\n");
  const blockId = sha256(
    (cfg.salt ?? "") +
      "|" +
      stableStringify(included) +
      "|" +
      String(cfg.includeSchemas),
  );

  return { text, blockId: blockId.slice(0, 24), included };
}

/* ------------------------- render helpers ------------------------- */

function renderToolLine(
  t: ToolDefinition,
  cfg: ToolPromptBuilderConfig,
): string {
  const parts: string[] = [];

  // Base line
  parts.push(`- **${t.name}** (${t.id}) — ${oneLine(t.description)}`);

  // Policy hints
  if (cfg.includePolicyHints) {
    const p = t.policy;
    parts.push(
      `  - policy: enabled=${p.enabled}, maxCallsPerTurn=${p.maxCallsPerTurn}, timeoutMs=${p.timeoutMs}, allowedUnderDocLock=${p.allowedUnderDocLock}, discoveryException=${p.discoveryException}, requiresMasking=${p.requiresMasking}`,
    );
  }

  // Schema
  if (cfg.includeSchemas) {
    const schema = truncate(
      stableStringify(t.inputSchema ?? {}),
      cfg.maxSchemaCharsPerTool,
    );
    parts.push(`  - inputSchema: \`${schema}\``);
  }

  return parts.join("\n");
}

function oneLine(s: string): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------- ordering ------------------------- */

function orderTools(
  tools: ToolDefinition[],
  mode: ToolPromptBuilderConfig["order"],
): ToolDefinition[] {
  if (mode === "registry") return [...tools];

  if (mode === "alpha") {
    return [...tools].sort((a, b) => a.name.localeCompare(b.name));
  }

  // category_alpha
  return [...tools].sort((a, b) => {
    const c = a.category.localeCompare(b.category);
    if (c !== 0) return c;
    return a.name.localeCompare(b.name);
  });
}

/* ------------------------- stable stringify + hash ------------------------- */

function stableStringify(input: unknown): string {
  return JSON.stringify(sortKeysDeep(normalizeJson(input)));
}

function normalizeJson(x: unknown): unknown {
  if (x === null) return null;

  const t = typeof x;
  if (t === "string" || t === "number" || t === "boolean") return x;
  if (t === "bigint") return x.toString();
  if (t === "undefined" || t === "function" || t === "symbol") return null;

  if (Array.isArray(x)) return x.map(normalizeJson);

  if (t === "object") {
    const obj = x as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "undefined") continue;
      out[k] = normalizeJson(v);
    }
    return out;
  }

  return null;
}

function sortKeysDeep(x: unknown): unknown {
  if (x === null) return null;
  if (Array.isArray(x)) return x.map(sortKeysDeep);
  if (typeof x !== "object") return x;

  const obj = x as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = sortKeysDeep(obj[k]);
  return out;
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function truncate(s: string, n: number): string {
  if (n <= 0) return "";
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}
