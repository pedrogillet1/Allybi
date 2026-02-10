// src/services/llm/prompts/promptRegistry.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * PromptRegistryService (Allybi, ChatGPT-parity)
 * -------------------------------------------
 * This service is the *single prompt assembly layer* for all LLM calls.
 *
 * It does:
 *  - Select the correct prompt bank + template deterministically
 *  - Localize prompt strings (any/en/pt/es) without inventing content
 *  - Fill slots safely ({{slot}} and ${slot})
 *  - Enforce prompt-side invariants that prevent common failures:
 *      - nav_pills: intro-only, no "Sources:" label, no actions
 *      - doc-grounded: evidence-only, no hallucination
 *      - max 1 question
 *      - no user-visible JSON output
 *
 * It does NOT:
 *  - call LLMs
 *  - enforce final UI rendering (OutputContract/Trust/Quality do that)
 *
 * Bank expectations (flexible):
 *  - prompts/prompt_registry.any.json may exist to map prompt ids -> bank ids/templates
 *  - prompts/system_prompt.any.json, retrieval_prompt.any.json, compose_answer_prompt.any.json, etc.
 *
 * Supported bank shapes (we accept multiple to avoid brittleness):
 *  - bank.config.messages[]: [{ role, content }]
 *  - bank.templates[]: [{ id, priority, when, messages[] }]
 *  - bank.rules[]: same as templates[]
 *
 * Content localization shapes accepted:
 *  - content: "string"
 *  - content: { any: "…", en:"…", pt:"…", es:"…" }
 */

export type EnvName = "production" | "staging" | "dev" | "local";
export type LangCode = "any" | "en" | "pt" | "es";

export type PromptKind =
  | "system"
  | "retrieval"
  | "compose_answer"
  | "disambiguation"
  | "fallback"
  | "tool";

export type LlmRole = "system" | "developer" | "user";

export interface BankLoader {
  getBank<T = any>(bankId: string): T;
}

export interface PromptMessage {
  role: LlmRole;
  content: string;
}

export interface PromptBundle {
  kind: PromptKind;
  messages: PromptMessage[];
  debug?: {
    usedBankIds: string[];
    selectedTemplateId?: string;
    appliedGuards: string[];
    slotsFilled: string[];
  };
}

export interface PromptContext {
  env: EnvName;
  outputLanguage: LangCode;

  // routing/scope
  answerMode?: string | null; // e.g., nav_pills/doc_grounded_single/...
  intentFamily?: string | null;
  operator?: string | null;
  operatorFamily?: string | null;

  // constraints
  maxQuestions?: number; // default 1
  maxOptions?: number;   // disambiguation default 4
  disallowJsonOutput?: boolean;

  // retrieval/evidence stats (optional)
  evidenceSummary?: {
    evidenceCount?: number;
    uniqueDocs?: number;
    topScore?: number | null;
  };

  // disambiguation options (optional)
  disambiguation?: {
    active: boolean;
    candidateType?: "document" | "sheet" | "operator";
    options?: Array<{ id: string; label: string }>;
  };

  // fallback info (optional)
  fallback?: {
    triggered: boolean;
    reasonCode?: string | null;
  };

  // tool info (optional)
  tool?: {
    toolName?: string;
    toolHint?: string;
  };

  // arbitrary additional slots (safe)
  slots?: Record<string, any>;
}

// ------------------------------
// Helpers (deterministic)
// ------------------------------

function isProd(env: EnvName) {
  return env === "production";
}

function clampInt(n: any, min: number, max: number, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function safeStr(x: any): string {
  if (typeof x === "string") return x;
  if (x == null) return "";
  return String(x);
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function normalizeWs(s: string): string {
  return (s ?? "")
    .replace(/\r\n|\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function localizedText(value: any, lang: LangCode): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  // prefer exact lang, then any, then first available
  return (
    value[lang] ??
    value.any ??
    value.en ??
    value.pt ??
    value.es ??
    ""
  );
}

function interpolate(template: string, slots: Record<string, any>, slotsFilled: string[]): string {
  let out = template;

  // {{slot}}
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, k) => {
    slotsFilled.push(k);
    const v = slots[k];
    return v == null ? "" : String(v);
  });

  // ${slot}
  out = out.replace(/\$\{(\w+)\}/g, (_m, k) => {
    slotsFilled.push(k);
    const v = slots[k];
    return v == null ? "" : String(v);
  });

  return out;
}

function matchesWhen(when: any, ctx: PromptContext): boolean {
  if (!when || typeof when !== "object") return true;

  // Supported:
  // when.answerModes: string[]
  // when.operators: string[]
  // when.operatorFamilies: string[]
  // when.intentFamilies: string[]
  // when.answerModeEquals: string
  const am = safeStr(ctx.answerMode || "");
  const op = safeStr(ctx.operator || "");
  const of = safeStr(ctx.operatorFamily || "");
  const inf = safeStr(ctx.intentFamily || "");

  if (Array.isArray(when.answerModes) && when.answerModes.length) {
    if (!when.answerModes.includes(am)) return false;
  }
  if (typeof when.answerModeEquals === "string" && when.answerModeEquals) {
    if (when.answerModeEquals !== am) return false;
  }
  if (Array.isArray(when.operators) && when.operators.length) {
    if (!when.operators.includes(op)) return false;
  }
  if (Array.isArray(when.operatorFamilies) && when.operatorFamilies.length) {
    if (!when.operatorFamilies.includes(of)) return false;
  }
  if (Array.isArray(when.intentFamilies) && when.intentFamilies.length) {
    if (!when.intentFamilies.includes(inf)) return false;
  }

  return true;
}

// ------------------------------
// Service
// ------------------------------

export class PromptRegistryService {
  constructor(private readonly bankLoader: BankLoader) {}

  buildPrompt(kind: PromptKind, ctx: PromptContext): PromptBundle {
    const usedBankIds: string[] = [];
    const slotsFilled: string[] = [];
    const appliedGuards: string[] = [];

    // Load prompt registry bank if present (optional)
    const registry = this.safeGetBank<any>("prompt_registry");
    if (registry) usedBankIds.push("prompt_registry");

    const bankId = this.resolveBankIdForKind(kind, registry);
    const bank = this.safeGetBank<any>(bankId);

    if (!bank?.config?.enabled) {
      // Deterministic safe fallback prompt (system role) — internal instructions only
      const messages: PromptMessage[] = [
        {
          role: "system",
          content: this.minimalSafePrompt(kind, ctx),
        },
      ];
      return {
        kind,
        messages,
        debug: isProd(ctx.env) ? undefined : { usedBankIds, selectedTemplateId: "fallback_minimal", appliedGuards, slotsFilled },
      };
    }

    usedBankIds.push(bankId);

    // Pick template/messages
    const selection = this.selectTemplate(bank, kind, ctx);
    const rawMessages = selection.messages;

    // Build slots
    const slots = this.buildSlots(ctx);

    // Localize + interpolate messages
    let messages = rawMessages
      .map((m: any) => {
        const role: LlmRole = (m.role ?? "system") as LlmRole;
        const contentRaw = localizedText(m.content, ctx.outputLanguage);
        const content = normalizeWs(interpolate(contentRaw, slots, slotsFilled));
        return { role, content };
      })
      .filter((m: PromptMessage) => m.content.length > 0);

    // Apply prompt guards (important: helps prevent model drift)
    messages = this.applyGlobalGuards(messages, ctx, appliedGuards);

    // nav_pills guard always applied when answerMode=nav_pills
    if ((ctx.answerMode ?? "") === "nav_pills") {
      messages = this.applyNavPillsGuard(messages, appliedGuards);
    }

    return {
      kind,
      messages,
      debug: isProd(ctx.env)
        ? undefined
        : {
            usedBankIds,
            selectedTemplateId: selection.templateId,
            appliedGuards,
            slotsFilled: uniq(slotsFilled),
          },
    };
  }

  // -----------------------------
  // Bank mapping
  // -----------------------------

  private resolveBankIdForKind(kind: PromptKind, registry: any | null): string {
    // If prompt_registry defines mapping, use it. Otherwise use defaults.
    const defaults: Record<PromptKind, string> = {
      system: "system_prompt",
      retrieval: "retrieval_prompt",
      compose_answer: "compose_answer_prompt",
      disambiguation: "disambiguation_prompt",
      fallback: "fallback_prompt",
      tool: "tool_prompts",
    };

    // Registry accepted shapes:
    // - registry.map: { system: "system_prompt", ... }
    // - registry.prompts: [{ kind, bankId }]
    if (registry?.map && typeof registry.map === "object" && typeof registry.map[kind] === "string") {
      return registry.map[kind];
    }

    if (Array.isArray(registry?.prompts)) {
      const hit = registry.prompts.find((p: any) => p?.kind === kind && typeof p?.bankId === "string");
      if (hit?.bankId) return hit.bankId;
    }

    return defaults[kind];
  }

  // -----------------------------
  // Template selection
  // -----------------------------

  private selectTemplate(bank: any, kind: PromptKind, ctx: PromptContext): { templateId: string; messages: any[] } {
    // Supported bank shapes:
    // A) bank.config.messages
    // B) bank.templates[]
    // C) bank.rules[]
    if (Array.isArray(bank?.config?.messages)) {
      return { templateId: `${kind}:config.messages`, messages: bank.config.messages };
    }

    const templates = Array.isArray(bank?.templates)
      ? bank.templates
      : Array.isArray(bank?.rules)
      ? bank.rules
      : null;

    if (templates && templates.length) {
      // filter by when
      const candidates = templates
        .filter((t: any) => t?.enabled !== false)
        .filter((t: any) => matchesWhen(t.when, ctx))
        .map((t: any) => ({
          id: safeStr(t.id || "template"),
          priority: Number.isFinite(Number(t.priority)) ? Number(t.priority) : 50,
          messages: Array.isArray(t.messages) ? t.messages : Array.isArray(t.blocks) ? this.blocksToMessages(t.blocks) : [],
        }))
        .filter((t: any) => t.messages.length > 0);

      // deterministic: highest priority then id lexicographic
      candidates.sort((a: any, b: any) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.id.localeCompare(b.id);
      });

      const best = candidates[0];
      if (best) return { templateId: best.id, messages: best.messages };
    }

    // Fallback: system message from bank description
    return {
      templateId: `${kind}:meta.description`,
      messages: [{ role: "system", content: bank?._meta?.description ?? "" }],
    };
  }

  private blocksToMessages(blocks: any[]): any[] {
    // blocks: [{ role, text } | { role, lines[] }]
    const out: any[] = [];
    for (const b of blocks) {
      const role = b?.role ?? "system";
      const text =
        typeof b?.text === "string"
          ? b.text
          : Array.isArray(b?.lines)
          ? b.lines.join("\n")
          : "";
      out.push({ role, content: text });
    }
    return out;
  }

  // -----------------------------
  // Slots
  // -----------------------------

  private buildSlots(ctx: PromptContext): Record<string, any> {
    const maxQuestions = clampInt(ctx.maxQuestions ?? 1, 0, 3, 1);
    const maxOptions = clampInt(ctx.maxOptions ?? 4, 2, 6, 4);

    return {
      env: ctx.env,
      language: ctx.outputLanguage,

      answerMode: ctx.answerMode ?? "",
      intentFamily: ctx.intentFamily ?? "",
      operator: ctx.operator ?? "",
      operatorFamily: ctx.operatorFamily ?? "",

      maxQuestions,
      maxOptions,

      disallowJsonOutput: ctx.disallowJsonOutput !== false ? "true" : "false",

      evidenceCount: ctx.evidenceSummary?.evidenceCount ?? "",
      evidenceUniqueDocs: ctx.evidenceSummary?.uniqueDocs ?? "",
      evidenceTopScore: ctx.evidenceSummary?.topScore ?? "",

      fallbackTriggered: ctx.fallback?.triggered ? "true" : "false",
      fallbackReasonCode: ctx.fallback?.reasonCode ?? "",

      toolName: ctx.tool?.toolName ?? "",
      toolHint: ctx.tool?.toolHint ?? "",

      ...(ctx.slots ?? {}),
    };
  }

  // -----------------------------
  // Guards (prompt-level invariants)
  // -----------------------------

  private applyGlobalGuards(messages: PromptMessage[], ctx: PromptContext, applied: string[]): PromptMessage[] {
    const guards: string[] = [];

    // Global “no JSON to user” instruction (prompt-side)
    if (ctx.disallowJsonOutput !== false) {
      guards.push("- Do NOT output raw JSON to the user. Use normal text, bullets, or tables instead.");
    }

    // One-question cap (prompt-side)
    const maxQ = clampInt(ctx.maxQuestions ?? 1, 0, 3, 1);
    guards.push(`- Ask at most ${maxQ} question if you are blocked. Otherwise answer directly.`);

    // Never output banned fallback phrase
    guards.push(`- Never output the phrase "No relevant information found" (or equivalents).`);

    // Document grounding reminder (prompt-side)
    guards.push("- Use only the provided evidence/context. Do not invent sources or details.");

    const guardMsg: PromptMessage = {
      role: "system",
      content: ["KODA_GLOBAL_GUARDS:", ...guards].join("\n"),
    };

    applied.push("global_guards");
    return [guardMsg, ...messages];
  }

  private applyNavPillsGuard(messages: PromptMessage[], applied: string[]): PromptMessage[] {
    const guard: PromptMessage = {
      role: "system",
      content: [
        "NAV_PILLS_MODE_CONTRACT:",
        "- Output only ONE short intro line (max 1 sentence).",
        "- Do NOT include a 'Sources:' label or inline citations.",
        "- Do NOT include message actions or claim actions were executed.",
        "- Files are represented via attachments/buttons, not in the text.",
      ].join("\n"),
    };

    applied.push("nav_pills_guard");
    return [guard, ...messages];
  }

  private minimalSafePrompt(kind: PromptKind, ctx: PromptContext): string {
    const base: string[] = [
      "You are Allybi.",
      "Your name is Allybi. Only refer to yourself as Allybi.",
      "Use only the provided evidence/context.",
      "Never output the phrase 'No relevant information found'.",
      "Do not output raw JSON to the user.",
      "Use short paragraphs and bullets when listing.",
      "Ask at most one question only if blocked.",
    ];

    if ((ctx.answerMode ?? "") === "nav_pills") {
      base.push("NAV_PILLS: one short intro sentence only; no Sources label; no actions.");
    }

    base.push(`prompt_kind=${kind}`);
    return base.join("\n");
  }

  // -----------------------------
  // Bank loader safety
  // -----------------------------

  private safeGetBank<T = any>(bankId: string): T | null {
    try {
      return this.bankLoader.getBank<T>(bankId);
    } catch {
      return null;
    }
  }
}

export default PromptRegistryService;
