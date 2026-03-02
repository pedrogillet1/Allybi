// src/services/llm/prompts/promptRegistry.service.ts

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
  getBank<T = unknown>(bankId: string): T;
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
  runtimeSignals?: Record<string, unknown> | null;

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

  slots?: Record<string, unknown>;
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

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function safeStr(x: unknown): string {
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

function localizedText(value: unknown, lang: LangCode): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join("\n");
  if (!value || typeof value !== "object") return "";
  const obj = value as Record<string, unknown>;
  const selected =
    obj[lang] ?? obj.any ?? obj.en ?? obj.pt ?? obj.es ?? "";
  if (Array.isArray(selected)) return selected.join("\n");
  if (typeof selected === "string") return selected;
  if (selected == null) return "";
  return String(selected);
}

function interpolate(
  template: string,
  slots: Record<string, unknown>,
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

function asSlotString(value: unknown): string {
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

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => safeStr(entry).trim())
      .filter((entry) => entry.length > 0);
  }
  const one = safeStr(value).trim();
  return one ? [one] : [];
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return ["1", "true", "yes", "on"].includes(normalized);
  }
  return false;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function collectSignalTags(ctx: PromptContext): Set<string> {
  const tags = new Set<string>();
  for (const flag of asStringArray(ctx.semanticFlags)) {
    tags.add(flag);
  }
  const signals = parseJsonObject(ctx.runtimeSignals)
    ?? parseJsonObject(ctx.slots?.runtimeSignals);
  if (!signals) return tags;

  for (const [key, value] of Object.entries(signals)) {
    if (toBool(value)) {
      const normalized = safeStr(key).trim();
      if (normalized) tags.add(normalized);
    }
  }

  return tags;
}

function matchesWhen(when: unknown, ctx: PromptContext): boolean {
  if (!when || typeof when !== "object") return true;
  const w = when as Record<string, unknown>;

  const am = safeStr(ctx.answerMode || "");
  const op = safeStr(ctx.operator || "");
  const of = safeStr(ctx.operatorFamily || "");
  const inf = safeStr(ctx.intentFamily || "");
  const uiSurface = safeStr(ctx.uiSurface || "");
  const usedBy = new Set(asStringArray(ctx.usedBy));
  const signalTags = collectSignalTags(ctx);

  if (Array.isArray(w.answerModes) && w.answerModes.length) {
    if (!w.answerModes.includes(am)) return false;
  }
  if (typeof w.answerModeEquals === "string" && w.answerModeEquals) {
    if (w.answerModeEquals !== am) return false;
  }
  if (Array.isArray(w.operators) && w.operators.length) {
    if (!w.operators.includes(op)) return false;
  }
  if (Array.isArray(w.operatorFamilies) && w.operatorFamilies.length) {
    if (!w.operatorFamilies.includes(of)) return false;
  }
  if (Array.isArray(w.intentFamilies) && w.intentFamilies.length) {
    if (!w.intentFamilies.includes(inf)) return false;
  }
  if (typeof w.uiSurfaceEquals === "string" && w.uiSurfaceEquals) {
    if (safeStr(w.uiSurfaceEquals) !== uiSurface) return false;
  }
  if (Array.isArray(w.uiSurfaces) && (w.uiSurfaces as unknown[]).length > 0) {
    if (!(w.uiSurfaces as unknown[]).includes(uiSurface)) return false;
  }
  if (Array.isArray(w.usedByAny) && (w.usedByAny as unknown[]).length > 0) {
    const candidates = new Set(asStringArray(w.usedByAny));
    const match = Array.from(usedBy).some((value) => candidates.has(value));
    if (!match) return false;
  }
  if (Array.isArray(w.signalsAny) && (w.signalsAny as unknown[]).length > 0) {
    const candidates = new Set(asStringArray(w.signalsAny));
    const match = Array.from(signalTags).some((value) => candidates.has(value));
    if (!match) return false;
  }
  if (typeof w.fallbackTriggered === "boolean") {
    if (Boolean(ctx.fallback?.triggered) !== Boolean(w.fallbackTriggered)) {
      return false;
    }
  }
  if (typeof w.fallbackReasonCodeEquals === "string") {
    const expected = safeStr(w.fallbackReasonCodeEquals).toLowerCase();
    const actual = safeStr(ctx.fallback?.reasonCode ?? "").toLowerCase();
    if (!expected || actual !== expected) return false;
  }
  if (
    Array.isArray(w.fallbackReasonCodes) &&
    (w.fallbackReasonCodes as unknown[]).length > 0
  ) {
    const allowed = new Set(
      (w.fallbackReasonCodes as unknown[])
        .map((value: unknown) => safeStr(value).toLowerCase())
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

    const registry = this.safeGetBank<Record<string, unknown>>("prompt_registry");
    if (registry) {
      usedBankIds.push("prompt_registry");
      if (!this.registryValidated) {
        this.assertPromptRegistryLayersValid(registry);
        this.registryValidated = true;
      }
    }

    const bankIds = this.resolveBankIdsForKind(kind, registry, ctx);
    const slots = this.buildSlots(ctx);

    const orderedPrompts: PromptTraceEntry[] = [];
    let messages: PromptMessage[] = [];

    for (const bankId of bankIds) {
      const bank = this.safeGetBank<Record<string, unknown>>(bankId);
      if (!(bank?.config as Record<string, unknown> | undefined)?.enabled) continue;
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
        .map((m: Record<string, unknown>) => {
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
        version: safeStr((bank?._meta as Record<string, unknown> | undefined)?.version || "0.0.0"),
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

  private assertPromptRegistryLayersValid(registry: Record<string, unknown>): void {
    const layers =
      registry?.layersByKind && typeof registry.layersByKind === "object"
        ? (registry.layersByKind as Record<string, unknown>)
        : null;
    if (!layers) return;

    const promptFileIds = new Set(
      Array.isArray(registry?.promptFiles)
        ? (registry.promptFiles as Array<Record<string, unknown>>)
            .map((row) => safeStr(row?.id))
            .filter((id: string) => id.length > 0)
        : [],
    );
    const failures: string[] = [];
    for (const [kind, rawIds] of Object.entries(layers)) {
      if (!Array.isArray(rawIds)) {
        failures.push(`invalid_layer_shape:${kind}`);
        continue;
      }
      const seen = new Set<string>();
      for (const rawId of rawIds) {
        const layerId = safeStr(rawId).trim();
        if (!layerId) {
          failures.push(`empty_layer_id:${kind}`);
          continue;
        }
        if (seen.has(layerId)) {
          failures.push(`duplicate_layer_id:${kind}:${layerId}`);
          continue;
        }
        seen.add(layerId);
        if (promptFileIds.size > 0 && !promptFileIds.has(layerId)) {
          failures.push(`unknown_layer_id:${kind}:${layerId}`);
        }
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `prompt_registry.any.json has invalid layered configuration: ${failures.join(", ")}`,
      );
    }
  }

  private resolveBankIdsForKind(
    kind: PromptKind,
    registry: Record<string, unknown> | null,
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

    const fromRegistry = (registry?.layersByKind as Record<string, unknown> | undefined)?.[kind];
    if (
      Array.isArray(fromRegistry) &&
      fromRegistry.every((v: unknown) => typeof v === "string" && (v as string).trim())
    ) {
      return uniq(fromRegistry.map((v: string) => v.trim()));
    }

    if (
      registry?.map &&
      typeof registry.map === "object" &&
      typeof (registry.map as Record<string, unknown>)[kind] === "string"
    ) {
      return [(registry.map as Record<string, string>)[kind]];
    }

    return defaults[kind];
  }

  private selectTemplate(
    bank: Record<string, unknown>,
    kind: PromptKind,
    ctx: PromptContext,
  ): { templateId: string; messages: Array<Record<string, unknown>> } {
    const bankConfig = bank?.config as Record<string, unknown> | undefined;
    const bankMeta = bank?._meta as Record<string, unknown> | undefined;
    if (Array.isArray(bankConfig?.messages)) {
      return {
        templateId: `${safeStr(bankMeta?.id || kind)}:config.messages`,
        messages: bankConfig.messages as Array<Record<string, unknown>>,
      };
    }

    const templates = this.resolveTemplateEntries(bank);

    if (templates && templates.length) {
      const candidates = templates
        .filter((t) => t?.enabled !== false)
        .filter((t) => matchesWhen(t.when, ctx))
        .map((t) => ({
          id: safeStr(t.id || "template"),
          priority: Number.isFinite(Number(t.priority))
            ? Number(t.priority)
            : 50,
          messages: Array.isArray(t.messages)
            ? (t.messages as Array<Record<string, unknown>>)
            : Array.isArray(t.blocks)
              ? this.blocksToMessages(t.blocks as Array<Record<string, unknown>>)
              : [],
        }))
        .filter((t) => t.messages.length > 0);

      candidates.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.id.localeCompare(b.id);
      });

      const best = candidates[0];
      if (best) return { templateId: best.id, messages: best.messages };
    }

    // templates locale shape: templates.{lang}.{system|developer|user}
    const bankTemplates = bank?.templates as Record<string, unknown> | undefined;
    const langBlock =
      bankTemplates?.[ctx.outputLanguage] ??
      bankTemplates?.any ??
      bankTemplates?.en;
    if (langBlock && typeof langBlock === "object") {
      const out: PromptMessage[] = [];
      const langObj = langBlock as Record<string, unknown>;
      const roles: Array<{ key: string; role: LlmRole }> = [
        { key: "system", role: "system" },
        { key: "developer", role: "developer" },
        { key: "user", role: "user" },
      ];
      for (const { key, role } of roles) {
        const val = langObj[key];
        if (Array.isArray(val)) {
          out.push(...toArrayMessage(role, val.join("\n")));
        } else if (typeof val === "string") {
          out.push(...toArrayMessage(role, val));
        }
      }
      if (out.length) {
        return {
          templateId: `${safeStr(bankMeta?.id || kind)}:templates.${ctx.outputLanguage}`,
          messages: out,
        };
      }
    }

    // compose variants shape: variants.{variantId}.template[]
    const defaultVariant = safeStr(
      bankConfig?.defaultVariant || bank?.defaultVariant || "",
    );
    const bankVariants = bank?.variants as Record<string, unknown> | undefined;
    const variant = defaultVariant ? bankVariants?.[defaultVariant] as Record<string, unknown> | undefined : null;
    if (variant && Array.isArray(variant?.template)) {
      return {
        templateId: `${safeStr(bankMeta?.id || kind)}:variant.${defaultVariant}`,
        messages: [{ role: "system", content: (variant.template as string[]).join("\n") }],
      };
    }

    return {
      templateId: `${safeStr(bankMeta?.id || kind)}:meta.description`,
      messages: [{ role: "system", content: (bankMeta?.description as string) ?? "" }],
    };
  }

  private blocksToMessages(blocks: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    for (const b of blocks) {
      const role = b?.role ?? "system";
      const text =
        typeof b?.text === "string"
          ? b.text
          : Array.isArray(b?.lines)
            ? (b.lines as string[]).join("\n")
            : "";
      out.push({ role, content: text });
    }
    return out;
  }

  private buildSlots(ctx: PromptContext): Record<string, unknown> {
    const maxQuestions = clampInt(ctx.maxQuestions ?? 1, 0, 3, 1);
    const maxOptions = clampInt(ctx.maxOptions ?? 4, 2, 6, 4);
    const customSlots =
      ctx.slots && typeof ctx.slots === "object"
        ? Object.fromEntries(
            Object.entries(ctx.slots).map(([k, v]) => [k, asSlotString(v)]),
          )
        : {};
    // The ctx object may carry extended properties beyond PromptContext
    // (e.g. scope, docContext, userQuery) when built by LlmRequestBuilderService.
    const ext = ctx as unknown as Record<string, unknown>;
    const scope =
      ext.scope ??
      customSlots.scope ??
      customSlots.scopeSummary ??
      "";
    const docContext =
      ext.docContext ??
      customSlots.docContext ??
      customSlots.docScopeSummary ??
      "";
    const userQuery =
      ext.userQuery ?? ext.query ?? customSlots.userQuery ?? "";
    const candidates =
      ext.candidates ??
      customSlots.candidates ??
      customSlots.disambiguationOptions ??
      "";
    const candidateCount =
      ext.candidateCount ??
      customSlots.candidateCount ??
      ctx.disambiguation?.options?.length ??
      0;
    const runtimeSignals =
      ctx.runtimeSignals ?? customSlots.runtimeSignals ?? "";

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
      domainId: asSlotString(ext.domainId ?? customSlots.domainId ?? ""),
      scope: asSlotString(scope),
      docContext: asSlotString(docContext),
      candidates: asSlotString(candidates),
      candidateCount: asSlotString(candidateCount),
      selectedDoc: asSlotString(
        ext.selectedDoc ?? customSlots.selectedDoc ?? "",
      ),
      fileListMeta: asSlotString(
        ext.fileListMeta ?? customSlots.fileListMeta ?? "",
      ),
      topic: asSlotString(ext.topic ?? customSlots.topic ?? ""),
      format: asSlotString(ext.format ?? customSlots.format ?? ""),
      navType: asSlotString(ext.navType ?? customSlots.navType ?? ""),
      uiSurface: asSlotString(
        ctx.uiSurface ?? customSlots.uiSurface ?? "",
      ),
      usedBy: asSlotString(ctx.usedBy ?? customSlots.usedBy ?? ""),
      semanticFlags: asSlotString(
        ctx.semanticFlags ?? customSlots.semanticFlags ?? "",
      ),
      state: asSlotString(ext.state ?? customSlots.state ?? ""),
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
    const extCtx = ctx as unknown as Record<string, unknown>;
    const ctxConstraints =
      extCtx.constraints && typeof extCtx.constraints === "object"
        ? (extCtx.constraints as Record<string, unknown>)
        : null;
    const disallowJsonOutput =
      (ctxConstraints?.disallowJsonOutput as boolean | undefined) ??
      ctx.disallowJsonOutput;
    const machineJsonMode = disallowJsonOutput === false;

    if (!machineJsonMode) {
      guards.push(
        "- Do NOT output raw JSON to the user. Use normal text, bullets, or tables instead.",
      );
    }

    const maxQ = clampInt(
      (ctxConstraints?.maxQuestions as number | undefined) ?? ctx.maxQuestions ?? 1,
      0,
      3,
      1,
    );
    guards.push(
      `- Ask at most ${maxQ} question if you are blocked. Otherwise answer directly.`,
    );
    if (!machineJsonMode) {
      guards.push(
        '- Never output the phrase "No relevant information found" (or equivalents).',
      );
    }
    guards.push(
      "- Use only the provided evidence/context. Do not invent sources or details.",
    );
    if (!machineJsonMode) {
      guards.push(
        "- Do NOT include a Sources section in the text — sources are provided separately via UI buttons.",
      );
      guards.push(
        "- Never emit control/protocol wrappers like [KODA_...] blocks in user-facing output.",
      );
    }
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

  private safeGetBank<T = unknown>(bankId: string): T | null {
    try {
      return this.bankLoader.getBank<T>(bankId);
    } catch {
      return null;
    }
  }

  private resolveTemplateEntries(bank: Record<string, unknown>): Array<Record<string, unknown>> | null {
    if (Array.isArray(bank?.templates)) return bank.templates as Array<Record<string, unknown>>;
    if (Array.isArray(bank?.rules)) return bank.rules as Array<Record<string, unknown>>;
    if (Array.isArray(bank?.tools)) {
      return this.convertToolEntriesToTemplates(bank.tools as Array<Record<string, unknown>>);
    }
    return null;
  }

  private convertToolEntriesToTemplates(tools: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    return tools
      .filter((entry) => entry && typeof entry === "object")
      .map((entry, index) => {
        const appliesTo = (entry.appliesTo as Record<string, unknown>) || {};
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
        const when: Record<string, unknown> = {};
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
