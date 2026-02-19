// src/services/llm/prompts/promptRegistry.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as crypto from "crypto";

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

export interface PromptTraceEntry {
  bankId: string;
  version: string;
  templateId: string;
  hash: string;
}

export interface PromptBundle {
  kind: PromptKind;
  messages: PromptMessage[];
  trace: {
    orderedPrompts: PromptTraceEntry[];
    appliedGuards: string[];
    slotsFilled: string[];
  };
  debug?: {
    usedBankIds: string[];
    selectedTemplateIds: string[];
  };
}

export interface PromptContext {
  env: EnvName;
  outputLanguage: LangCode;

  answerMode?: string | null;
  intentFamily?: string | null;
  operator?: string | null;
  operatorFamily?: string | null;

  maxQuestions?: number;
  maxOptions?: number;
  disallowJsonOutput?: boolean;

  evidenceSummary?: {
    evidenceCount?: number;
    uniqueDocs?: number;
    topScore?: number | null;
  };

  disambiguation?: {
    active: boolean;
    candidateType?: "document" | "sheet" | "operator";
    options?: Array<{ id: string; label: string }>;
  };

  fallback?: {
    triggered: boolean;
    reasonCode?: string | null;
  };

  tool?: {
    toolName?: string;
    toolHint?: string;
  };

  slots?: Record<string, any>;
}

function isProd(env: EnvName): boolean {
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
  return value[lang] ?? value.any ?? value.en ?? value.pt ?? value.es ?? "";
}

function interpolate(
  template: string,
  slots: Record<string, any>,
  slotsFilled: string[],
): string {
  let out = template;

  out = out.replace(/\{\{(\w+)\}\}/g, (_m, k) => {
    slotsFilled.push(k);
    const v = slots[k];
    return v == null ? "" : String(v);
  });

  out = out.replace(/\$\{(\w+)\}/g, (_m, k) => {
    slotsFilled.push(k);
    const v = slots[k];
    return v == null ? "" : String(v);
  });

  return out;
}

function matchesWhen(when: any, ctx: PromptContext): boolean {
  if (!when || typeof when !== "object") return true;

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

function toArrayMessage(role: LlmRole, text: string): PromptMessage[] {
  const content = normalizeWs(text);
  if (!content) return [];
  return [{ role, content }];
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

export class PromptRegistryService {
  private registryValidated = false;

  constructor(private readonly bankLoader: BankLoader) {}

  buildPrompt(kind: PromptKind, ctx: PromptContext): PromptBundle {
    const usedBankIds: string[] = [];
    const selectedTemplateIds: string[] = [];
    const slotsFilled: string[] = [];
    const appliedGuards: string[] = [];

    const registry = this.safeGetBank<any>("prompt_registry");
    if (registry) {
      usedBankIds.push("prompt_registry");
      if (!this.registryValidated) {
        this.assertNoUnreachableSelectionRules(registry);
        this.registryValidated = true;
      }
    }

    const bankIds = this.resolveBankIdsForKind(kind, registry, ctx);
    const slots = this.buildSlots(ctx);

    const orderedPrompts: PromptTraceEntry[] = [];
    let messages: PromptMessage[] = [];

    for (const bankId of bankIds) {
      const bank = this.safeGetBank<any>(bankId);
      if (!bank?.config?.enabled) continue;
      usedBankIds.push(bankId);

      const selection = this.selectTemplate(bank, kind, ctx);
      selectedTemplateIds.push(selection.templateId);

      const compiled = selection.messages
        .map((m: any) => {
          const role: LlmRole = (m.role ?? "system") as LlmRole;
          const contentRaw = localizedText(m.content, ctx.outputLanguage);
          const content = normalizeWs(
            interpolate(contentRaw, slots, slotsFilled),
          );
          return { role, content };
        })
        .filter((m: PromptMessage) => m.content.length > 0);

      if (!compiled.length) continue;
      messages = [...messages, ...compiled];

      orderedPrompts.push({
        bankId,
        version: safeStr(bank?._meta?.version || "0.0.0"),
        templateId: selection.templateId,
        hash: sha256(
          compiled.map((m) => `${m.role}:${m.content}`).join("\n\n"),
        ),
      });
    }

    if (!messages.length) {
      messages = [
        { role: "system", content: this.minimalSafePrompt(kind, ctx) },
      ];
      orderedPrompts.push({
        bankId: "fallback_minimal",
        version: "0.0.0",
        templateId: "fallback_minimal",
        hash: sha256(messages[0].content),
      });
    }

    messages = this.applyGlobalGuards(messages, ctx, appliedGuards);

    if ((ctx.answerMode ?? "") === "nav_pills") {
      messages = this.applyNavPillsGuard(messages, appliedGuards);
    }

    return {
      kind,
      messages,
      trace: {
        orderedPrompts,
        appliedGuards,
        slotsFilled: uniq(slotsFilled),
      },
      debug: isProd(ctx.env)
        ? undefined
        : {
            usedBankIds: uniq(usedBankIds),
            selectedTemplateIds: uniq(selectedTemplateIds),
          },
    };
  }

  private assertNoUnreachableSelectionRules(registry: any): void {
    const rules = Array.isArray(registry?.selectionRules?.rules)
      ? registry.selectionRules.rules
      : [];
    if (!rules.length) return;

    let sawCatchAll = false;
    const unreachable: string[] = [];

    for (const rule of rules) {
      const id = safeStr(rule?.id || "rule");
      if (sawCatchAll) {
        unreachable.push(id);
      }
      if (rule?.when?.any === true) {
        sawCatchAll = true;
      }
    }

    if (unreachable.length) {
      throw new Error(
        `prompt_registry.any.json has unreachable selection rules: ${unreachable.join(", ")}`,
      );
    }
  }

  private resolveBankIdsForKind(
    kind: PromptKind,
    registry: any | null,
    _ctx: PromptContext,
  ): string[] {
    const defaults: Record<PromptKind, string[]> = {
      system: ["system_base"],
      retrieval: ["system_base", "mode_chat", "rag_policy", "retrieval_prompt"],
      compose_answer: [
        "system_base",
        "mode_chat",
        "rag_policy",
        "task_answer_with_sources",
        "policy_citations",
      ],
      disambiguation: ["system_base", "mode_chat", "disambiguation_prompt"],
      fallback: ["system_base", "mode_chat", "fallback_prompt"],
      tool: [
        "system_base",
        "mode_editing",
        "editing_task_prompts",
        "task_plan_generation",
        "policy_citations",
        "tool_prompts",
      ],
    };

    const fromRegistry = registry?.layersByKind?.[kind];
    if (
      Array.isArray(fromRegistry) &&
      fromRegistry.every((v: any) => typeof v === "string" && v.trim())
    ) {
      return uniq(fromRegistry.map((v: string) => v.trim()));
    }

    if (
      registry?.map &&
      typeof registry.map === "object" &&
      typeof registry.map[kind] === "string"
    ) {
      return [registry.map[kind]];
    }

    return defaults[kind];
  }

  private selectTemplate(
    bank: any,
    kind: PromptKind,
    ctx: PromptContext,
  ): { templateId: string; messages: any[] } {
    if (Array.isArray(bank?.config?.messages)) {
      return {
        templateId: `${safeStr(bank?._meta?.id || kind)}:config.messages`,
        messages: bank.config.messages,
      };
    }

    const templates = Array.isArray(bank?.templates)
      ? bank.templates
      : Array.isArray(bank?.rules)
        ? bank.rules
        : null;

    if (templates && templates.length) {
      const candidates = templates
        .filter((t: any) => t?.enabled !== false)
        .filter((t: any) => matchesWhen(t.when, ctx))
        .map((t: any) => ({
          id: safeStr(t.id || "template"),
          priority: Number.isFinite(Number(t.priority))
            ? Number(t.priority)
            : 50,
          messages: Array.isArray(t.messages)
            ? t.messages
            : Array.isArray(t.blocks)
              ? this.blocksToMessages(t.blocks)
              : [],
        }))
        .filter((t: any) => t.messages.length > 0);

      candidates.sort((a: any, b: any) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.id.localeCompare(b.id);
      });

      const best = candidates[0];
      if (best) return { templateId: best.id, messages: best.messages };
    }

    // templates locale shape: templates.{lang}.{system|developer|user}
    const langBlock =
      bank?.templates?.[ctx.outputLanguage] ??
      bank?.templates?.any ??
      bank?.templates?.en;
    if (langBlock && typeof langBlock === "object") {
      const out: PromptMessage[] = [];
      const roles: Array<{ key: string; role: LlmRole }> = [
        { key: "system", role: "system" },
        { key: "developer", role: "developer" },
        { key: "user", role: "user" },
      ];
      for (const { key, role } of roles) {
        const val = (langBlock as any)[key];
        if (Array.isArray(val)) {
          out.push(...toArrayMessage(role, val.join("\n")));
        } else if (typeof val === "string") {
          out.push(...toArrayMessage(role, val));
        }
      }
      if (out.length) {
        return {
          templateId: `${safeStr(bank?._meta?.id || kind)}:templates.${ctx.outputLanguage}`,
          messages: out,
        };
      }
    }

    // compose variants shape: variants.{variantId}.template[]
    const defaultVariant = safeStr(
      bank?.config?.defaultVariant || bank?.defaultVariant || "",
    );
    const variant = defaultVariant ? bank?.variants?.[defaultVariant] : null;
    if (variant && Array.isArray(variant?.template)) {
      return {
        templateId: `${safeStr(bank?._meta?.id || kind)}:variant.${defaultVariant}`,
        messages: [{ role: "system", content: variant.template.join("\n") }],
      };
    }

    return {
      templateId: `${safeStr(bank?._meta?.id || kind)}:meta.description`,
      messages: [{ role: "system", content: bank?._meta?.description ?? "" }],
    };
  }

  private blocksToMessages(blocks: any[]): any[] {
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

  private applyGlobalGuards(
    messages: PromptMessage[],
    ctx: PromptContext,
    applied: string[],
  ): PromptMessage[] {
    const guards: string[] = [];

    if (ctx.disallowJsonOutput !== false) {
      guards.push(
        "- Do NOT output raw JSON to the user. Use normal text, bullets, or tables instead.",
      );
    }

    const maxQ = clampInt(ctx.maxQuestions ?? 1, 0, 3, 1);
    guards.push(
      `- Ask at most ${maxQ} question if you are blocked. Otherwise answer directly.`,
    );
    guards.push(
      '- Never output the phrase "No relevant information found" (or equivalents).',
    );
    guards.push(
      "- Use only the provided evidence/context. Do not invent sources or details.",
    );
    guards.push(
      "- Citation contract: when evidence exists, append a `Sources` block with human-readable source names and stable locators; when no evidence exists, omit the `Sources` block.",
    );

    const guardMsg: PromptMessage = {
      role: "system",
      content: ["KODA_GLOBAL_GUARDS:", ...guards].join("\n"),
    };

    applied.push("global_guards");
    return [guardMsg, ...messages];
  }

  private applyNavPillsGuard(
    messages: PromptMessage[],
    applied: string[],
  ): PromptMessage[] {
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
      "Assistant identity: Allybi.",
      "Refer to yourself in first person (I/me/my). Do not speak about yourself in third person.",
      'Never output sentences like: "Allybi\'s name is Allybi" or "How can Allybi assist you today?"',
      "Use only the provided evidence/context.",
      "Never output the phrase 'No relevant information found'.",
      "Do not output raw JSON to the user.",
      "Use short paragraphs and bullets when listing.",
      "Ask at most one question only if blocked.",
      "If evidence is present, append a Sources block with source titles and locators. If no evidence is present, omit Sources.",
    ];

    if ((ctx.answerMode ?? "") === "nav_pills") {
      base.push(
        "NAV_PILLS: one short intro sentence only; no Sources label; no actions.",
      );
    }

    base.push(`prompt_kind=${kind}`);
    return base.join("\n");
  }

  private safeGetBank<T = any>(bankId: string): T | null {
    try {
      return this.bankLoader.getBank<T>(bankId);
    } catch {
      return null;
    }
  }
}

export default PromptRegistryService;
