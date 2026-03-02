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
  uiSurface?: string | null;
  usedBy?: string[] | null;
  semanticFlags?: string[] | null;
  runtimeSignals?: Record<string, any> | null;

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

function isPromptCoverageStrictEnabled(): boolean {
  const raw = String(process.env.PROMPT_MODE_COVERAGE_STRICT || "")
    .trim()
    .toLowerCase();
  if (!raw) return true;
  return !["0", "false", "off", "no"].includes(raw);
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
  if (Array.isArray(value)) return value.join("\n");
  if (!value || typeof value !== "object") return "";
  const selected =
    value[lang] ?? value.any ?? value.en ?? value.pt ?? value.es ?? "";
  if (Array.isArray(selected)) return selected.join("\n");
  if (typeof selected === "string") return selected;
  if (selected == null) return "";
  return String(selected);
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

function hasUnresolvedTemplateToken(content: string): boolean {
  return /\{\{[^}]+\}\}/.test(content) || /\$\{[^}]+\}/.test(content);
}

function asSlotString(value: any): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function asStringArray(value: any): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => safeStr(entry).trim())
      .filter((entry) => entry.length > 0);
  }
  const one = safeStr(value).trim();
  return one ? [one] : [];
}

function toBool(value: any): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return ["1", "true", "yes", "on"].includes(normalized);
  }
  return false;
}

function parseJsonObject(value: unknown): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, any>;
    }
    return null;
  } catch {
    return null;
  }
}

function collectSignalTags(ctx: PromptContext): Set<string> {
  const tags = new Set<string>();
  for (const flag of asStringArray((ctx as any).semanticFlags)) {
    tags.add(flag);
  }
  const signals = parseJsonObject((ctx as any).runtimeSignals)
    ?? parseJsonObject((ctx as any).slots?.runtimeSignals);
  if (!signals) return tags;

  for (const [key, value] of Object.entries(signals)) {
    if (toBool(value)) {
      const normalized = safeStr(key).trim();
      if (normalized) tags.add(normalized);
    }
  }

  return tags;
}

function matchesWhen(when: any, ctx: PromptContext): boolean {
  if (!when || typeof when !== "object") return true;

  const am = safeStr(ctx.answerMode || "");
  const op = safeStr(ctx.operator || "");
  const of = safeStr(ctx.operatorFamily || "");
  const inf = safeStr(ctx.intentFamily || "");
  const uiSurface = safeStr((ctx as any).uiSurface || "");
  const usedBy = new Set(asStringArray((ctx as any).usedBy));
  const signalTags = collectSignalTags(ctx);

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
  if (typeof when.uiSurfaceEquals === "string" && when.uiSurfaceEquals) {
    if (safeStr(when.uiSurfaceEquals) !== uiSurface) return false;
  }
  if (Array.isArray(when.uiSurfaces) && when.uiSurfaces.length > 0) {
    if (!when.uiSurfaces.includes(uiSurface)) return false;
  }
  if (Array.isArray(when.usedByAny) && when.usedByAny.length > 0) {
    const candidates = new Set(asStringArray(when.usedByAny));
    const match = Array.from(usedBy).some((value) => candidates.has(value));
    if (!match) return false;
  }
  if (Array.isArray(when.signalsAny) && when.signalsAny.length > 0) {
    const candidates = new Set(asStringArray(when.signalsAny));
    const match = Array.from(signalTags).some((value) => candidates.has(value));
    if (!match) return false;
  }
  if (typeof when.fallbackTriggered === "boolean") {
    if (Boolean(ctx.fallback?.triggered) !== Boolean(when.fallbackTriggered)) {
      return false;
    }
  }
  if (typeof when.fallbackReasonCodeEquals === "string") {
    const expected = safeStr(when.fallbackReasonCodeEquals).toLowerCase();
    const actual = safeStr(ctx.fallback?.reasonCode ?? "").toLowerCase();
    if (!expected || actual !== expected) return false;
  }
  if (
    Array.isArray(when.fallbackReasonCodes) &&
    when.fallbackReasonCodes.length > 0
  ) {
    const allowed = new Set(
      when.fallbackReasonCodes
        .map((value: any) => safeStr(value).toLowerCase())
        .filter(Boolean),
    );
    const actual = safeStr(ctx.fallback?.reasonCode ?? "").toLowerCase();
    if (!actual || !allowed.has(actual)) return false;
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
  private static readonly STRICT_COMPOSE_MODES = new Set([
    "doc_grounded_single",
    "doc_grounded_multi",
    "doc_grounded_quote",
    "doc_grounded_table",
    "help_steps",
  ]);

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
      if (
        kind === "compose_answer" &&
        bankId === "task_answer_with_sources" &&
        isPromptCoverageStrictEnabled() &&
        PromptRegistryService.STRICT_COMPOSE_MODES.has(
          safeStr(ctx.answerMode || ""),
        ) &&
        selection.templateId.endsWith(":meta.description")
      ) {
        throw new Error(
          `prompt_contract_uncovered_mode:${safeStr(ctx.answerMode || "unknown")}`,
        );
      }
      selectedTemplateIds.push(selection.templateId);

      const compiled = selection.messages
        .map((m: any) => {
          const role: LlmRole = (m.role ?? "system") as LlmRole;
          const contentRaw = localizedText(m.content, ctx.outputLanguage);
          const content = normalizeWs(
            interpolate(contentRaw, slots, slotsFilled),
          );
          if (hasUnresolvedTemplateToken(content)) {
            throw new Error(
              `prompt_unresolved_placeholders:${bankId}:${selection.templateId}`,
            );
          }
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

    const templates = this.resolveTemplateEntries(bank);

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
    const customSlots =
      ctx.slots && typeof ctx.slots === "object"
        ? Object.fromEntries(
            Object.entries(ctx.slots).map(([k, v]) => [k, asSlotString(v)]),
          )
        : {};
    const scope =
      (ctx as any).scope ??
      customSlots.scope ??
      customSlots.scopeSummary ??
      "";
    const docContext =
      (ctx as any).docContext ??
      customSlots.docContext ??
      customSlots.docScopeSummary ??
      "";
    const userQuery =
      (ctx as any).userQuery ?? (ctx as any).query ?? customSlots.userQuery ?? "";
    const candidates =
      (ctx as any).candidates ??
      customSlots.candidates ??
      customSlots.disambiguationOptions ??
      "";
    const candidateCount =
      (ctx as any).candidateCount ??
      customSlots.candidateCount ??
      (ctx as any).disambiguation?.options?.length ??
      0;
    const runtimeSignals =
      (ctx as any).runtimeSignals ?? customSlots.runtimeSignals ?? "";

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
      userQuery: asSlotString(userQuery),
      domainId: asSlotString((ctx as any).domainId ?? customSlots.domainId ?? ""),
      scope: asSlotString(scope),
      docContext: asSlotString(docContext),
      candidates: asSlotString(candidates),
      candidateCount: asSlotString(candidateCount),
      selectedDoc: asSlotString(
        (ctx as any).selectedDoc ?? customSlots.selectedDoc ?? "",
      ),
      fileListMeta: asSlotString(
        (ctx as any).fileListMeta ?? customSlots.fileListMeta ?? "",
      ),
      topic: asSlotString((ctx as any).topic ?? customSlots.topic ?? ""),
      format: asSlotString((ctx as any).format ?? customSlots.format ?? ""),
      navType: asSlotString((ctx as any).navType ?? customSlots.navType ?? ""),
      uiSurface: asSlotString(
        (ctx as any).uiSurface ?? customSlots.uiSurface ?? "",
      ),
      usedBy: asSlotString((ctx as any).usedBy ?? customSlots.usedBy ?? ""),
      semanticFlags: asSlotString(
        (ctx as any).semanticFlags ?? customSlots.semanticFlags ?? "",
      ),
      state: asSlotString((ctx as any).state ?? customSlots.state ?? ""),
      runtimeSignals: asSlotString(runtimeSignals),
      ...customSlots,
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
      "- Do NOT include a Sources section in the text — sources are provided separately via UI buttons.",
    );
    guards.push(
      "- Never emit control/protocol wrappers like [KODA_...] blocks in user-facing output.",
    );
    const reasoningGuidance = String(
      (ctx.slots as Record<string, unknown> | undefined)
        ?.reasoningPolicyGuidance || "",
    ).trim();
    if (reasoningGuidance) {
      guards.push("REASONING_POLICY:");
      guards.push(reasoningGuidance);
    }

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
      "Do NOT include a Sources section in the text — sources are provided separately via UI buttons.",
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

  private resolveTemplateEntries(bank: any): any[] | null {
    if (Array.isArray(bank?.templates)) return bank.templates;
    if (Array.isArray(bank?.rules)) return bank.rules;
    if (Array.isArray(bank?.tools)) {
      return this.convertToolEntriesToTemplates(bank.tools);
    }
    return null;
  }

  private convertToolEntriesToTemplates(tools: any[]): any[] {
    return tools
      .filter((entry) => entry && typeof entry === "object")
      .map((entry, index) => {
        const appliesTo = entry.appliesTo || {};
        const appliesToKeys = Object.keys(appliesTo);
        const supportedKeys = new Set([
          "operators",
          "answerMode",
          "intentFamily",
          "uiSurface",
          "usedBy",
          "signalsAny",
        ]);
        const unsupported = appliesToKeys.filter(
          (key) => !supportedKeys.has(key),
        );
        if (unsupported.length > 0) {
          throw new Error(
            `prompt_tool_applies_to_unsupported_keys:${safeStr(entry.id || `tool_template_${index + 1}`)}:${unsupported.sort().join(",")}`,
          );
        }
        const when: Record<string, any> = {};
        const operators = asStringArray(appliesTo.operators);
        if (operators.length > 0) {
          when.operators = operators;
        }
        const answerModes = asStringArray(appliesTo.answerMode);
        if (answerModes.length === 1) {
          when.answerModeEquals = answerModes[0];
        } else if (answerModes.length > 1) {
          when.answerModes = answerModes;
        }
        const intentFamilies = asStringArray(appliesTo.intentFamily);
        if (intentFamilies.length > 0) {
          when.intentFamilies = intentFamilies;
        }
        const uiSurfaces = asStringArray(appliesTo.uiSurface);
        if (uiSurfaces.length === 1) {
          when.uiSurfaceEquals = uiSurfaces[0];
        } else if (uiSurfaces.length > 1) {
          when.uiSurfaces = uiSurfaces;
        }
        const usedBy = asStringArray(appliesTo.usedBy);
        if (usedBy.length > 0) {
          when.usedByAny = usedBy;
        }
        const signalsAny = asStringArray(appliesTo.signalsAny);
        if (signalsAny.length > 0) {
          when.signalsAny = signalsAny;
        }

        const localized: Record<string, string> = {};
        const system = entry.system;
        if (system && typeof system === "object") {
          for (const [lang, raw] of Object.entries(system)) {
            if (Array.isArray(raw)) localized[lang] = raw.join("\n");
            else if (typeof raw === "string") localized[lang] = raw;
          }
        }

        const content =
          Object.keys(localized).length > 0
            ? localized
            : safeStr(entry.prompt || entry.text || "");

        return {
          id: safeStr(entry.id || `tool_template_${index + 1}`),
          priority: Number.isFinite(Number(entry.priority))
            ? Number(entry.priority)
            : 50,
          when,
          messages: [{ role: "system", content }],
        };
      });
  }
}

export default PromptRegistryService;
