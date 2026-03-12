import type {
  LangCode,
  LlmRole,
  PromptContext,
  PromptKind,
  PromptMessage,
} from "./types";
import { PromptRoleValidationError } from "./errors";

export function isProd(env: string): boolean {
  return env === "production";
}

export function isPromptCoverageStrictEnabled(): boolean {
  const raw = String(process.env.PROMPT_MODE_COVERAGE_STRICT || "")
    .trim()
    .toLowerCase();
  if (!raw) return true;
  return !["0", "false", "off", "no"].includes(raw);
}

export function clampInt(
  n: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

export function safeStr(x: unknown): string {
  if (typeof x === "string") return x;
  if (x == null) return "";
  return String(x);
}

export function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function normalizeWs(s: string): string {
  return (s ?? "")
    .replace(/\r\n|\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function localizedText(value: unknown, lang: LangCode): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join("\n");
  if (!value || typeof value !== "object") return "";
  const obj = value as Record<string, unknown>;
  const selected = obj[lang] ?? obj.any ?? obj.en ?? obj.pt ?? obj.es ?? "";
  if (Array.isArray(selected)) return selected.join("\n");
  if (typeof selected === "string") return selected;
  if (selected == null) return "";
  return String(selected);
}

export function resolveLocalizedBlock(
  templates: Record<string, unknown> | undefined,
  lang: LangCode,
): { key: LangCode; block: Record<string, unknown> } | null {
  if (!templates || typeof templates !== "object") return null;
  const order: LangCode[] = uniq([lang, "any", "en", "pt", "es"]) as LangCode[];
  for (const key of order) {
    const block = templates[key];
    if (block && typeof block === "object" && !Array.isArray(block)) {
      return { key, block: block as Record<string, unknown> };
    }
  }
  return null;
}

export function interpolate(
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

export function hasUnresolvedTemplateToken(content: string): boolean {
  return /\{\{[^}]+\}\}/.test(content) || /\$\{[^}]+\}/.test(content);
}

export function asSlotString(value: unknown): string {
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

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => safeStr(entry).trim())
      .filter((entry) => entry.length > 0);
  }
  const one = safeStr(value).trim();
  return one ? [one] : [];
}

export function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return ["1", "true", "yes", "on"].includes(normalized);
  }
  return false;
}

export function parseJsonObject(value: unknown): Record<string, unknown> | null {
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

export function collectSignalTags(ctx: PromptContext): Set<string> {
  const tags = new Set<string>();
  for (const flag of asStringArray(ctx.semanticFlags)) {
    tags.add(flag);
  }
  const signals =
    parseJsonObject(ctx.runtimeSignals) ??
    parseJsonObject(ctx.slots?.runtimeSignals);
  if (!signals) return tags;

  for (const [key, value] of Object.entries(signals)) {
    if (toBool(value)) {
      const normalized = safeStr(key).trim();
      if (normalized) tags.add(normalized);
    }
  }

  return tags;
}

export function matchesWhen(when: unknown, ctx: PromptContext): boolean {
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

export function toArrayMessage(role: LlmRole, text: string): PromptMessage[] {
  const content = normalizeWs(text);
  if (!content) return [];
  return [{ role, content }];
}

export function parseLlmRole(
  rawRole: unknown,
  bankId: string,
  templateId: string,
): LlmRole {
  const role = safeStr(rawRole || "system").trim().toLowerCase();
  if (role === "system" || role === "developer" || role === "user") {
    return role;
  }
  throw new PromptRoleValidationError(rawRole, {
    bankId,
    templateId,
  });
}

export function buildSlots(ctx: PromptContext): Record<string, unknown> {
  const maxQuestions = clampInt(ctx.maxQuestions ?? 1, 0, 3, 1);
  const maxOptions = clampInt(ctx.maxOptions ?? 4, 2, 6, 4);
  const customSlots =
    ctx.slots && typeof ctx.slots === "object"
      ? Object.fromEntries(
          Object.entries(ctx.slots).map(([k, v]) => [k, asSlotString(v)]),
        )
      : {};

  const ext = ctx as unknown as Record<string, unknown>;
  const scope = ext.scope ?? customSlots.scope ?? customSlots.scopeSummary ?? "";
  const docContext =
    ext.docContext ?? customSlots.docContext ?? customSlots.docScopeSummary ?? "";
  const userQuery = ext.userQuery ?? ext.query ?? customSlots.userQuery ?? "";
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
    selectedDoc: asSlotString(ext.selectedDoc ?? customSlots.selectedDoc ?? ""),
    fileListMeta: asSlotString(ext.fileListMeta ?? customSlots.fileListMeta ?? ""),
    topic: asSlotString(ext.topic ?? customSlots.topic ?? ""),
    format: asSlotString(ext.format ?? customSlots.format ?? ""),
    navType: asSlotString(ext.navType ?? customSlots.navType ?? ""),
    uiSurface: asSlotString(ctx.uiSurface ?? customSlots.uiSurface ?? ""),
    usedBy: asSlotString(ctx.usedBy ?? customSlots.usedBy ?? ""),
    semanticFlags: asSlotString(ctx.semanticFlags ?? customSlots.semanticFlags ?? ""),
    state: asSlotString(ext.state ?? customSlots.state ?? ""),
    runtimeSignals: asSlotString(runtimeSignals),
    ...customSlots,
  };
}

export function defaultLayerByKind(kind: PromptKind): string[] {
  const defaults: Record<PromptKind, string[]> = {
    system: ["system_base"],
    retrieval: [
      "system_base",
      "mode_chat",
      "llm_global_guards",
      "rag_policy",
      "retrieval_prompt",
    ],
    compose_answer: [
      "system_base",
      "mode_chat",
      "llm_global_guards",
      "rag_policy",
      "task_answer_with_sources",
      "policy_citations",
    ],
    disambiguation: [
      "system_base",
      "mode_chat",
      "llm_global_guards",
      "disambiguation_prompt",
    ],
    fallback: ["system_base", "mode_chat", "llm_global_guards", "fallback_prompt"],
    tool: [
      "system_base",
      "mode_editing",
      "llm_global_guards",
      "editing_task_prompts",
      "task_plan_generation",
      "policy_citations",
      "tool_prompts",
    ],
  };
  return defaults[kind];
}
