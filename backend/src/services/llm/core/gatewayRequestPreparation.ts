import type { LLMMessage, LLMRequest } from "./llmClient.interface";
import type { LLMProvider } from "./llmErrors.types";
import type { LlmRoutePlan } from "../types/llm.types";
import type { RouteContext } from "./llmRouter.shared";
import type {
  BuildRequestInput,
  EvidencePackLike,
  LlmRequestBuilderService,
  MemoryPackLike,
} from "./llmRequestBuilder.service";

import { getOptionalBank } from "../../core/banks/bankLoader.service";
import { RuntimePolicyError } from "../../../modules/chat/runtime/runtimePolicyError";
import { getProductHelpService } from "../../../modules/chat/application/productHelp.service";
import { canonicalizeToLlmProvider } from "./providerNormalization";

export interface GatewayPromptTrace {
  promptIds: string[];
  promptVersions: string[];
  promptHashes: string[];
  promptTemplateIds: string[];
}

export interface PreparedGatewayRequest {
  route: LlmRoutePlan;
  request: LLMRequest;
  promptType: string;
  promptTrace: GatewayPromptTrace;
  outputLanguage: "any" | "en" | "pt" | "es";
  promptMode: "compose" | "retrieval_plan";
  userText: string;
}

type GatewayChatRole = "system" | "user" | "assistant";

type GatewayDisambiguation = {
  active: boolean;
  candidateType: "document" | "sheet" | "operator";
  options: Array<{ id: string; label: string; score?: number }>;
  maxOptions: number;
  maxQuestions: number;
};

type ParsedGatewayRequest = {
  userText: string;
  outputLanguage: "any" | "en" | "pt" | "es";
  answerMode: string;
  intentFamily?: string | null;
  operator?: string | null;
  operatorFamily?: string | null;
  navType: "open" | "where" | "discover" | null;
  fallback?: { triggered: boolean; reasonCode?: string | null };
  disambiguation?: GatewayDisambiguation | null;
  evidencePack?: EvidencePackLike;
  memoryPack?: MemoryPackLike;
  productHelpTopic?: string | null;
  productHelpSnippet?: string | null;
  styleProfile?: string | null;
  styleDecision?: Record<string, unknown> | null;
  turnStyleState?: Record<string, unknown> | null;
  styleMaxQuestions?: number | null;
  styleMaxChars?: number | null;
  userRequestedShort?: boolean;
  boldingEnabled?: boolean | null;
  promptMode?: "compose" | "retrieval_plan";
  uiSurface?: string | null;
  usedBy?: string[] | null;
  semanticFlags?: string[] | null;
};

type MemoryPolicyRuntimeTuning = {
  gateway?: {
    userTextCharCap?: number;
    systemBlockCharCap?: number;
    dialogueTurnLimit?: number;
    dialogueMessageCharCap?: number;
    dialogueCharBudget?: number;
    memoryPackCharCap?: number;
  };
};

type AnswerModeRouter = {
  decide(input: Record<string, unknown>): { answerMode: string };
};

function mapProviderForRequest(provider: LLMProvider): LLMProvider {
  return canonicalizeToLlmProvider(provider);
}

function mapPurpose(promptType: string): LLMRequest["purpose"] {
  if (promptType === "retrieval") return "retrieval_planning";
  if (promptType === "disambiguation") return "intent_routing";
  if (promptType === "tool") return "validation_pass";
  return "answer_compose";
}

function clampText(input: string, maxChars: number): string {
  const value = String(input || "").trim();
  if (!value) return "";
  return value.length > maxChars ? `${value.slice(0, maxChars - 1)}…` : value;
}

function firstNonEmptyString(...values: Array<unknown>): string | null {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return null;
}

function asNormalizedCode(value: unknown): string | null {
  const text = String(value || "").trim();
  return text ? text.toLowerCase() : null;
}

function asNonNegativeInt(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.floor(num);
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || "").trim())
      .filter((entry) => entry.length > 0);
  }
  const one = String(value || "").trim();
  return one ? [one] : [];
}

function asBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizePromptMode(value: unknown): "compose" | "retrieval_plan" {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "retrieval_plan" ||
    normalized === "retrieval" ||
    normalized === "retrieval_planning"
  ) {
    return "retrieval_plan";
  }
  return "compose";
}

let machineJsonPromptTaskCache: Set<string> | null | undefined;

function isMachineJsonTemplate(template: Record<string, unknown>): boolean {
  const outputMode = String(template?.outputMode || "").trim().toLowerCase();
  return outputMode === "machine_json";
}

function collectMachineJsonTaskIdsFromBank(bank: Record<string, unknown> | null): Set<string> {
  const out = new Set<string>();
  const templates = Array.isArray(bank?.templates)
    ? (bank.templates as Array<Record<string, unknown>>)
    : [];
  for (const template of templates) {
    if (!isMachineJsonTemplate(template)) continue;
    const whenObj = template?.when as Record<string, unknown> | undefined;
    const operators = Array.isArray(whenObj?.operators)
      ? (whenObj.operators as unknown[])
      : [];
    for (const raw of operators) {
      const operatorId = String(raw || "").trim().toLowerCase();
      if (operatorId) out.add(operatorId);
    }
  }
  return out;
}

function getMachineJsonPromptTaskSet(): Set<string> {
  if (machineJsonPromptTaskCache !== undefined) {
    return machineJsonPromptTaskCache ?? new Set<string>();
  }

  try {
    const resolved = new Set<string>();
    for (const bankId of ["task_plan_generation", "editing_task_prompts"]) {
      const bank = getOptionalBank<Record<string, unknown>>(bankId);
      const ids = collectMachineJsonTaskIdsFromBank(bank);
      for (const id of ids) resolved.add(id);
    }
    machineJsonPromptTaskCache = resolved;
    return resolved;
  } catch {
    machineJsonPromptTaskCache = new Set<string>();
    return machineJsonPromptTaskCache;
  }
}

function isMachineJsonPromptTask(value: unknown): boolean {
  const taskId = String(value || "").trim().toLowerCase();
  return taskId ? getMachineJsonPromptTaskSet().has(taskId) : false;
}

function getMemoryPolicyRuntimeTuning(): MemoryPolicyRuntimeTuning {
  const bank = getOptionalBank<Record<string, unknown>>("memory_policy");
  if (!bank) {
    throw new RuntimePolicyError(
      "RUNTIME_POLICY_MISSING",
      "Required bank missing: memory_policy",
    );
  }
  return ((bank.config as Record<string, unknown> | undefined)?.runtimeTuning || {}) as MemoryPolicyRuntimeTuning;
}

function resolveGatewayPolicyInt(
  key:
    | "userTextCharCap"
    | "systemBlockCharCap"
    | "dialogueTurnLimit"
    | "dialogueMessageCharCap"
    | "dialogueCharBudget"
    | "memoryPackCharCap",
): number {
  const raw = Number(getMemoryPolicyRuntimeTuning().gateway?.[key]);
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new RuntimePolicyError(
      "RUNTIME_POLICY_INVALID",
      `memory_policy.config.runtimeTuning.gateway.${key} is required`,
    );
  }
  return Math.floor(raw);
}

function buildDialogueContext(
  history: Array<{ role: GatewayChatRole; content: string }>,
  overrides?: {
    maxTurns?: number;
    perMessageCap?: number;
    charBudget?: number;
  },
): string[] {
  if (!history.length) return [];
  const maxTurns = Math.max(
    1,
    Number(overrides?.maxTurns) || resolveGatewayPolicyInt("dialogueTurnLimit"),
  );
  const perMessageCap = Math.max(
    64,
    Number(overrides?.perMessageCap) || resolveGatewayPolicyInt("dialogueMessageCharCap"),
  );
  const charBudget = Math.max(
    512,
    Number(overrides?.charBudget) || resolveGatewayPolicyInt("dialogueCharBudget"),
  );

  const selected = history.slice(Math.max(0, history.length - maxTurns));
  const reverseBuffer: string[] = [];
  let used = 0;
  for (let i = selected.length - 1; i >= 0; i--) {
    const message = selected[i]!;
    const line = `${message.role.toUpperCase()}: ${clampText(message.content, perMessageCap)}`;
    if (line.length + used > charBudget && reverseBuffer.length > 0) break;
    reverseBuffer.push(line);
    used += line.length + 1;
    if (used >= charBudget) break;
  }

  const lines: string[] = [];
  for (let i = reverseBuffer.length - 1; i >= 0; i--) {
    lines.push(reverseBuffer[i]!);
  }
  return lines;
}

function detectOutputLanguage(
  meta: Record<string, unknown>,
  context: Record<string, unknown>,
  systemBlocks: string[],
): "any" | "en" | "pt" | "es" {
  const explicit = (meta.preferredLanguage as string) || (context.preferredLanguage as string);
  if (explicit === "en" || explicit === "pt" || explicit === "es") return explicit;
  const joined = systemBlocks.join("\n");
  if (/respond entirely in Portuguese/i.test(joined)) return "pt";
  if (/respond entirely in Spanish/i.test(joined)) return "es";
  return "en";
}

function resolveOperatorFamilyRouting(
  operator: string | null,
  meta: Record<string, unknown>,
  context: Record<string, unknown>,
): { operatorFamily: string | null; defaultAnswerMode: string | null } {
  const explicitFamily = firstNonEmptyString(
    meta.operatorFamily,
    context.operatorFamily,
    (meta.signals as Record<string, unknown> | undefined)?.operatorFamily,
    (context.signals as Record<string, unknown> | undefined)?.operatorFamily,
  );
  const familyBank = getOptionalBank<Record<string, unknown>>("operator_families");
  const families = Array.isArray(familyBank?.families)
    ? (familyBank.families as Array<Record<string, unknown>>)
    : [];
  const findFamilyById = (familyId: string) =>
    families.find((entry) => asNormalizedCode(entry?.id) === asNormalizedCode(familyId)) || null;

  let familyEntry = explicitFamily ? findFamilyById(explicitFamily) : null;
  if (!familyEntry && operator) {
    const normalizedOperator = asNormalizedCode(operator);
    familyEntry =
      families.find((entry) =>
        Array.isArray(entry?.operators)
          ? (entry.operators as unknown[]).some(
              (op: unknown) => asNormalizedCode(op) === normalizedOperator,
            )
          : false,
      ) || null;
  }

  if (!familyEntry) {
    return {
      operatorFamily: explicitFamily ? String(explicitFamily) : null,
      defaultAnswerMode: null,
    };
  }

  const operatorHints =
    familyEntry.operatorHints && typeof familyEntry.operatorHints === "object"
      ? familyEntry.operatorHints
      : null;
  const normalizedOperator = asNormalizedCode(operator);
  const hintedMode =
    normalizedOperator && operatorHints
      ? Object.entries(operatorHints).find(
          ([opId]) => asNormalizedCode(opId) === normalizedOperator,
        )?.[1]
      : null;
  const defaultAnswerMode = String(
    (hintedMode as Record<string, unknown> | undefined)?.defaultMode ||
      familyEntry.defaultAnswerMode ||
      "",
  ).trim();

  return {
    operatorFamily: String(familyEntry.id || "").trim() || null,
    defaultAnswerMode: defaultAnswerMode || null,
  };
}

function detectDisambiguation(
  meta: Record<string, unknown>,
  context: Record<string, unknown>,
  answerMode: string,
): GatewayDisambiguation | null {
  const contextSignals = (context?.signals as Record<string, unknown>) || {};
  const metaSignals = (meta?.signals as Record<string, unknown>) || {};
  const dm =
    (meta.disambiguation as Record<string, unknown>) ||
    (context.disambiguation as Record<string, unknown>) ||
    (contextSignals.disambiguation as Record<string, unknown>) ||
    (metaSignals.disambiguation as Record<string, unknown>) ||
    null;
  const needsClarification =
    meta.needsClarification === true ||
    context?.needsClarification === true ||
    contextSignals.needsClarification === true ||
    metaSignals.needsClarification === true;
  const active =
    answerMode === "rank_disambiguate" || needsClarification || dm?.active === true;
  if (!active) return null;

  const rawOptions = Array.isArray(dm?.options) ? (dm.options as Array<Record<string, unknown>>) : [];
  const options = rawOptions
    .map((option, idx) => ({
      id: String(option?.id || `opt_${idx + 1}`),
      label: String(option?.label || option?.title || "").trim(),
      score: typeof option?.score === "number" ? option.score : undefined,
    }))
    .filter((option) => option.label.length > 0);
  const candidateType = ["document", "sheet", "operator"].includes(String(dm?.candidateType))
    ? (dm!.candidateType as "document" | "sheet" | "operator")
    : "document";

  return {
    active: true,
    candidateType,
    options,
    maxOptions: Math.max(2, Math.min(6, Number(dm?.maxOptions ?? 4) || 4)),
    maxQuestions: Math.max(1, Math.min(2, Number(dm?.maxQuestions ?? 1) || 1)),
  };
}

function detectAnswerMode(args: {
  answerModeRouter: AnswerModeRouter;
  meta: Record<string, unknown>;
  systemBlocks: string[];
  evidencePack?: EvidencePackLike;
  context?: Record<string, unknown>;
  operatorRouting?: {
    operator?: string | null;
    operatorFamily?: string | null;
  };
  queryText?: string | null;
}): string {
  if (typeof args.meta.promptTask === "string" && args.meta.promptTask.trim()) {
    return args.answerModeRouter.decide({
      promptTask: String(args.meta.promptTask),
    }).answerMode;
  }
  const contextSignals = (args.context?.signals as Record<string, unknown>) || {};
  const metaSignals = (args.meta?.signals as Record<string, unknown>) || {};
  const needsClarification =
    args.meta.needsClarification === true ||
    args.context?.needsClarification === true ||
    contextSignals.needsClarification === true ||
    metaSignals.needsClarification === true;
  const disambiguationActive =
    (args.meta.disambiguation as Record<string, unknown> | undefined)?.active === true ||
    (args.context?.disambiguation as Record<string, unknown> | undefined)?.active === true ||
    (contextSignals.disambiguation as Record<string, unknown> | undefined)?.active === true ||
    (metaSignals.disambiguation as Record<string, unknown> | undefined)?.active === true;
  const evidenceDocCount = args.evidencePack?.evidence?.length
    ? new Set(args.evidencePack.evidence.map((e) => e.docId)).size
    : 0;

  return args.answerModeRouter.decide({
    promptTask:
      typeof args.meta.promptTask === "string" ? String(args.meta.promptTask) : null,
    explicitAnswerMode:
      typeof args.meta.answerMode === "string" ? String(args.meta.answerMode) : null,
    needsClarification,
    disambiguationActive,
    operator: args.operatorRouting?.operator,
    operatorFamily:
      args.operatorRouting?.operatorFamily || (args.context?.operatorFamily as string),
    intentFamily:
      (args.meta.intentFamily as string) || (args.context?.intentFamily as string) || null,
    evidenceDocCount,
    systemBlocks: args.systemBlocks,
    queryText: args.queryText || null,
  }).answerMode;
}

function parseIncomingMessages(
  params: {
    messages: Array<{ role: GatewayChatRole; content: string; attachments?: unknown | null }>;
    evidencePack?: EvidencePackLike | null;
    context?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  },
  answerModeRouter: AnswerModeRouter,
): ParsedGatewayRequest {
  const messages = params.messages || [];
  const lastUserIdx = [...messages].reverse().findIndex((message) => message.role === "user");
  const resolvedIdx =
    lastUserIdx >= 0 ? messages.length - 1 - lastUserIdx : messages.length - 1;
  const userText = clampText(
    messages[resolvedIdx]?.content || "",
    resolveGatewayPolicyInt("userTextCharCap"),
  );

  const history = messages.slice(0, Math.max(0, resolvedIdx));
  const promptTask =
    typeof params.meta?.promptTask === "string" ? String(params.meta.promptTask) : null;
  const rawMeta = params.meta || {};
  const rawContext = params.context || {};
  const evidencePack = params.evidencePack ?? undefined;
  const contextSignals = (rawContext?.signals as Record<string, unknown>) || {};
  const metaSignals = (rawMeta?.signals as Record<string, unknown>) || {};
  const systemBlocks = history
    .filter((message) => message.role === "system")
    .map((message) => clampText(message.content, resolveGatewayPolicyInt("systemBlockCharCap")));
  const dialogueHistory = history.filter((message) => message.role !== "system");

  const outputLanguage = detectOutputLanguage(rawMeta, rawContext, systemBlocks);
  const promptTaskName = String(promptTask || "").trim();
  const resolvedOperator =
    promptTaskName ||
    firstNonEmptyString(
      rawMeta.operator,
      rawContext.operator,
      contextSignals.operator,
      metaSignals.operator,
    ) ||
    null;
  const familyResolution = resolveOperatorFamilyRouting(resolvedOperator, rawMeta, rawContext);
  const answerMode = detectAnswerMode({
    answerModeRouter,
    meta: rawMeta,
    systemBlocks,
    evidencePack,
    context: rawContext,
    operatorRouting: {
      operator: resolvedOperator,
      operatorFamily: familyResolution.operatorFamily,
    },
    queryText: userText,
  });
  const disambiguation = detectDisambiguation(rawMeta, rawContext, answerMode);
  const operatorFamily =
    familyResolution.operatorFamily || (answerMode === "nav_pills" ? "file_actions" : null);
  const navType =
    (rawMeta.navType as "open" | "where" | "discover" | null) ??
    (answerMode === "nav_pills" ? "discover" : null);
  const reasonCode =
    typeof rawMeta.fallbackReasonCode === "string" ? rawMeta.fallbackReasonCode : null;
  const requestedPurpose = asNormalizedCode(
    firstNonEmptyString(
      rawMeta.purpose,
      rawContext.purpose,
      contextSignals.purpose,
      metaSignals.purpose,
    ),
  );
  const productHelpTopic = firstNonEmptyString(
    rawMeta.productHelpTopic,
    rawContext.productHelpTopic,
    contextSignals.productHelpTopic,
    metaSignals.productHelpTopic,
  );
  const productHelpSnippet = firstNonEmptyString(
    rawMeta.productHelpSnippet,
    rawContext.productHelpSnippet,
    contextSignals.productHelpSnippet,
    metaSignals.productHelpSnippet,
  );
  const styleProfile =
    firstNonEmptyString(
      rawMeta.styleProfile,
      rawContext.styleProfile,
      contextSignals.styleProfile,
      metaSignals.styleProfile,
    ) || null;
  const styleDecision =
    asObject(rawMeta.styleDecision) ??
    asObject(rawContext.styleDecision) ??
    asObject(contextSignals.styleDecision) ??
    asObject(metaSignals.styleDecision) ??
    null;
  const turnStyleState =
    asObject(rawMeta.turnStyleState) ??
    asObject(rawContext.turnStyleState) ??
    asObject(contextSignals.turnStyleState) ??
    asObject(metaSignals.turnStyleState) ??
    null;
  const styleMaxQuestions =
    asNonNegativeInt(
      rawMeta.styleMaxQuestions ??
        rawMeta.maxQuestions ??
        rawContext.styleMaxQuestions ??
        contextSignals.styleMaxQuestions ??
        contextSignals.maxQuestions ??
        metaSignals.styleMaxQuestions ??
        metaSignals.maxQuestions,
    ) ?? null;
  const styleMaxChars =
    asNonNegativeInt(
      rawMeta.styleMaxChars ??
        rawContext.styleMaxChars ??
        contextSignals.styleMaxChars ??
        contextSignals.profileMaxChars ??
        metaSignals.styleMaxChars,
    ) ?? null;
  const userRequestedShort =
    asBool(
      rawMeta.userRequestedShort ??
        rawMeta.truncationRetry ??
        rawContext.userRequestedShort ??
        rawContext.truncationRetry ??
        contextSignals.userRequestedShort ??
        contextSignals.truncationRetry ??
        contextSignals.shortAnswer ??
        metaSignals.userRequestedShort ??
        metaSignals.truncationRetry ??
        metaSignals.shortAnswer,
    ) === true;
  const boldingEnabledRaw =
    rawMeta.boldingEnabled ??
    rawContext.boldingEnabled ??
    contextSignals.boldingEnabled ??
    metaSignals.boldingEnabled;
  const boldingEnabled = typeof boldingEnabledRaw === "boolean" ? boldingEnabledRaw : null;
  const retrievalPlanningSignal =
    asBool(
      rawMeta.retrievalPlanning ??
        rawContext.retrievalPlanning ??
        contextSignals.retrievalPlanning ??
        metaSignals.retrievalPlanning,
    ) === true;
  const promptMode = normalizePromptMode(
    firstNonEmptyString(
      rawMeta.promptMode,
      rawContext.promptMode,
      contextSignals.promptMode,
      metaSignals.promptMode,
      requestedPurpose === "retrieval_planning" ? "retrieval_plan" : null,
      retrievalPlanningSignal ? "retrieval_plan" : null,
    ),
  );
  const uiSurface =
    firstNonEmptyString(
      rawMeta.uiSurface,
      rawContext.uiSurface,
      contextSignals.uiSurface,
      metaSignals.uiSurface,
    ) || null;
  const usedBy = [
    ...asStringList(rawMeta.usedBy),
    ...asStringList(rawContext.usedBy),
    ...asStringList(contextSignals.usedBy),
    ...asStringList(metaSignals.usedBy),
  ];
  const semanticFlagsSet = new Set<string>();
  for (const value of [
    ...asStringList(rawMeta.semanticFlags),
    ...asStringList(rawContext.semanticFlags),
    ...asStringList(contextSignals.semanticFlags),
    ...asStringList(metaSignals.semanticFlags),
  ]) {
    semanticFlagsSet.add(value);
  }
  for (const obj of [contextSignals, metaSignals]) {
    if (!obj || typeof obj !== "object") continue;
    for (const [key, value] of Object.entries(obj)) {
      if (asBool(value) === true) semanticFlagsSet.add(String(key || "").trim());
    }
  }
  const semanticFlags = Array.from(semanticFlagsSet).filter(Boolean);
  const tightenedHistoryForDocGrounded =
    String(answerMode || "").startsWith("doc_grounded") && dialogueHistory.length > 12;
  const dialogue = buildDialogueContext(dialogueHistory, {
    maxTurns: tightenedHistoryForDocGrounded
      ? Math.min(resolveGatewayPolicyInt("dialogueTurnLimit"), 8)
      : undefined,
    perMessageCap: tightenedHistoryForDocGrounded
      ? Math.min(resolveGatewayPolicyInt("dialogueMessageCharCap"), 700)
      : undefined,
    charBudget: tightenedHistoryForDocGrounded
      ? Math.min(resolveGatewayPolicyInt("dialogueCharBudget"), 5000)
      : undefined,
  }).join("\n");
  const memoryParts: string[] = [];
  if (dialogue) memoryParts.push(`### Conversation History\n${dialogue}`);
  if (!promptTask && systemBlocks.length) {
    memoryParts.push(
      "### Runtime Context Data\n" +
        systemBlocks.map((s, i) => `[ctx_${i + 1}]\n${s}`).join("\n\n"),
    );
  }
  const joinedMemory = memoryParts.join("\n\n");
  const memoryPackCharCap = tightenedHistoryForDocGrounded
    ? Math.min(resolveGatewayPolicyInt("memoryPackCharCap"), 9000)
    : resolveGatewayPolicyInt("memoryPackCharCap");
  const memoryPack = memoryParts.length
    ? {
        contextText: clampText(joinedMemory, memoryPackCharCap),
        stats: { usedChars: joinedMemory.length },
      }
    : undefined;

  return {
    userText,
    outputLanguage,
    answerMode,
    intentFamily: (rawMeta.intentFamily as string) || null,
    operator: resolvedOperator,
    operatorFamily: promptTaskName ? "file_actions" : operatorFamily,
    navType,
    fallback: reasonCode ? { triggered: true, reasonCode } : { triggered: false },
    disambiguation,
    evidencePack,
    memoryPack,
    productHelpTopic,
    productHelpSnippet,
    styleProfile,
    styleDecision,
    turnStyleState,
    styleMaxQuestions,
    styleMaxChars,
    userRequestedShort,
    boldingEnabled,
    promptMode,
    uiSurface,
    usedBy: usedBy.length ? Array.from(new Set(usedBy)) : [],
    semanticFlags,
  };
}

function routeStageForParsedInput(parsed: ParsedGatewayRequest): {
  stage: "draft" | "final";
  reasonCodes: string[];
} {
  const needsFinal =
    (parsed.semanticFlags || []).some((flag) =>
      /numeric_strict|quote_strict|hallucination_guard|policy_retry|wrong_doc_detected|short_answer_quality_retry/.test(flag),
    ) ||
    (parsed.fallback?.reasonCode &&
      /numeric_truncation_detected|numeric_not_in_source|quote_too_long|hallucination_risk_high|wrong_doc_detected|refusal_required/.test(
        parsed.fallback.reasonCode,
      ));
  return {
    stage: needsFinal ? "final" : "draft",
    reasonCodes: [
      ...(parsed.fallback?.reasonCode ? [parsed.fallback.reasonCode] : []),
      ...(parsed.semanticFlags || []),
    ],
  };
}

export function prepareProviderRequest(args: {
  params: {
    traceId: string;
    userId: string;
    conversationId: string;
    messages: Array<{ role: GatewayChatRole; content: string; attachments?: unknown | null }>;
    evidencePack?: EvidencePackLike | null;
    context?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  };
  streaming: boolean;
  env: "production" | "staging" | "dev" | "local";
  modelId: string;
  defaultTemperature?: number;
  router: { route(ctx: RouteContext): LlmRoutePlan };
  builder: LlmRequestBuilderService;
  answerModeRouter: AnswerModeRouter;
}): PreparedGatewayRequest {
  const parsed = parseIncomingMessages(args.params, args.answerModeRouter);
  const routing = routeStageForParsedInput(parsed);
  const route = args.router.route({
    env: args.env,
    stage: routing.stage,
    answerMode: parsed.answerMode,
    intentFamily: parsed.intentFamily,
    operator: parsed.operator,
    operatorFamily: parsed.operatorFamily,
    reasonCodes: routing.reasonCodes,
    requireStreaming: args.streaming,
    allowTools: false,
  });

  const promptTask =
    typeof args.params.meta?.promptTask === "string"
      ? String(args.params.meta.promptTask)
      : null;
  const resolvedProductHelp = getProductHelpService().resolve({
    language: parsed.outputLanguage,
    explicitTopic: parsed.productHelpTopic,
    queryText: parsed.userText,
    answerMode: parsed.answerMode,
    operator: parsed.operator,
    intentFamily: parsed.intentFamily,
    fallbackReasonCode: parsed.fallback?.reasonCode ?? null,
  });
  const productHelpTopic = parsed.productHelpTopic || resolvedProductHelp?.topic || null;
  const productHelpSnippet =
    parsed.productHelpSnippet || resolvedProductHelp?.snippet || null;

  const buildInput: BuildRequestInput = {
    env: args.env,
    route,
    outputLanguage: parsed.outputLanguage,
    userText: parsed.userText,
    signals: {
      answerMode: parsed.answerMode,
      promptMode: parsed.promptMode ?? "compose",
      intentFamily: parsed.intentFamily,
      operator: parsed.operator,
      operatorFamily: parsed.operatorFamily,
      disallowJsonOutput:
        parsed.promptMode === "retrieval_plan" || isMachineJsonPromptTask(promptTask)
          ? false
          : true,
      maxQuestions:
        typeof parsed.styleMaxQuestions === "number" ? parsed.styleMaxQuestions : 1,
      navType: parsed.navType,
      fallback: parsed.fallback,
      disambiguation: parsed.disambiguation,
      productHelpTopic,
      productHelpSnippet,
      styleProfile: parsed.styleProfile,
      styleDecision: parsed.styleDecision,
      turnStyleState: parsed.turnStyleState,
      styleMaxChars: parsed.styleMaxChars,
      userRequestedShort: parsed.userRequestedShort,
      boldingEnabled:
        typeof parsed.boldingEnabled === "boolean" ? parsed.boldingEnabled : undefined,
      retrievalPlanning: parsed.promptMode === "retrieval_plan",
      uiSurface: parsed.uiSurface ?? null,
      usedBy: parsed.usedBy ?? [],
      semanticFlags: parsed.semanticFlags ?? [],
    },
    evidencePack: args.params.evidencePack ?? parsed.evidencePack,
    memoryPack: parsed.memoryPack,
    toolContext: promptTask
      ? {
          toolName: promptTask,
          toolArgs: (args.params.meta?.promptTaskArgs as Record<string, unknown>) || {},
        }
      : undefined,
    options: {
      stream: args.streaming,
      temperature: args.defaultTemperature,
    },
  };

  const built = args.builder.build(buildInput);
  const kodaMeta = built.kodaMeta as Record<string, unknown> | undefined;
  const promptTraceObj = kodaMeta?.promptTrace as Record<string, unknown> | undefined;
  const promptTraceRaw =
    (promptTraceObj?.orderedPrompts as Array<Record<string, unknown>>) ?? [];
  const promptTrace: GatewayPromptTrace = {
    promptIds: promptTraceRaw.map((p) => String(p?.bankId || "")).filter(Boolean),
    promptVersions: promptTraceRaw.map((p) => String(p?.version || "")).filter(Boolean),
    promptHashes: promptTraceRaw.map((p) => String(p?.hash || "")).filter(Boolean),
    promptTemplateIds: promptTraceRaw.map((p) => String(p?.templateId || "")).filter(Boolean),
  };
  if (!promptTrace.promptIds.length) {
    throw new Error("LlmGateway: missing prompt trace metadata (prompt bank path not used)");
  }

  const providerMessages: LLMMessage[] = built.messages.map((message) => ({
    role: message.role as LLMMessage["role"],
    content: message.content,
  }));
  const request: LLMRequest = {
    traceId: args.params.traceId,
    turnId: `turn_${Date.now().toString(36)}`,
    model: {
      provider: mapProviderForRequest(route.provider as LLMProvider),
      model: route.model || args.modelId,
    },
    messages: providerMessages,
    sampling: {
      temperature: built.options?.temperature,
      topP: built.options?.topP,
      maxOutputTokens: built.options?.maxOutputTokens,
    },
    purpose: mapPurpose(String(kodaMeta?.promptType || "compose_answer")),
    meta: {
      ...(args.params.meta || {}),
      userId: args.params.userId,
      conversationId: args.params.conversationId,
      promptType: kodaMeta?.promptType as string,
      promptTrace,
      route,
    },
  };

  return {
    route,
    request,
    promptType: String(kodaMeta?.promptType || "compose_answer"),
    promptTrace,
    outputLanguage: parsed.outputLanguage,
    promptMode: parsed.promptMode ?? "compose",
    userText: parsed.userText,
  };
}
