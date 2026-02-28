import type {
  LLMStreamingConfig,
  StreamSink,
} from "../../../services/llm/types/llmStreaming.types";
import { createHash } from "crypto";
import prisma from "../../../platform/db/prismaClient";
import type {
  ChatEngine,
  ChatMessageDTO,
  ChatRequest,
  ChatResult,
  ChatRole,
  ConversationDTO,
  ConversationListOptions,
  ConversationMessagesOptions,
  ConversationWithMessagesDTO,
  CreateMessageParams,
  AnswerClass,
  AnswerMode,
  NavType,
  ChatProvenanceDTO,
} from "../domain/chat.contracts";
import { ConversationNotFoundError } from "../domain/chat.contracts";
import type { EncryptedChatRepo } from "../../../services/chat/encryptedChatRepo.service";
import type { EncryptedChatContextService } from "../../../services/chat/encryptedChatContext.service";
import { resolveRuntimeFallbackMessage } from "../../../services/chat/chatMicrocopy.service";
import { ConversationMemoryService } from "../../../services/memory/conversationMemory.service";
import {
  MemoryPolicyEngine,
  type MemoryPolicyRuntimeConfig,
} from "../../../services/memory/memoryPolicyEngine.service";
import { MemoryRedactionService } from "../../../services/memory/memoryRedaction.service";
import { getBankLoaderInstance } from "../../domain/infra";
import {
  RetrievalEngineService,
  type EvidencePack,
  type EvidenceItem,
  type RetrievalRequest,
  buildAttachmentDocScopeLock,
  createDocScopeLock,
  EvidenceGateService,
  type EvidenceCheckResult,
  getSourceButtonsService,
  resolveSlot,
  PrismaRetrievalAdapterFactory,
} from "../../retrieval/application";
import {
  resolveDocumentReference,
  type DocumentReferenceDoc,
} from "../../../services/core/scope/documentReferenceResolver.service";
import {
  extractUsedDocuments,
  filterSourceButtonsByUsage,
  type SourceButtonsAttachment,
  type EvidenceChunkForFiltering,
} from "../../../services/core/retrieval/sourceButtons.service";
import {
  RuntimePolicyError,
  isRuntimePolicyError,
  toRuntimePolicyErrorCode,
} from "./runtimePolicyError";
import { logger as appLogger } from "../../../utils/logger";
import {
  QualityGateRunnerService,
  type QualityGateContext,
} from "../../../services/core/enforcement/qualityGateRunner.service";
import {
  getResponseContractEnforcer,
  type ResponseContractContext,
} from "../../../services/core/enforcement/responseContractEnforcer.service";
import { trimTextToTokenBudget } from "../../../services/core/enforcement/tokenBudget.service";
import {
  SEMANTIC_TRUNCATION_DETECTOR_VERSION,
  classifyProviderTruncation,
  classifyVisibleTruncation,
  isSemanticTruncationV2Enabled,
  normalizeFinishReason,
} from "./truncationClassifier";
import { buildChatProvenance } from "./provenance/ProvenanceBuilder";
import { validateChatProvenance } from "./provenance/ProvenanceValidator";
import {
  TraceWriterService,
  type TurnDebugPacket,
} from "../../../services/telemetry/traceWriter.service";

function mkTraceId(): string {
  return `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeTraceId(input: unknown): string | null {
  const candidate = String(input || "").trim();
  if (!candidate) return null;
  if (/^[A-Za-z0-9._:-]{8,64}$/.test(candidate)) return candidate;
  const normalized = candidate.replace(/[^A-Za-z0-9._:-]/g, "");
  if (normalized.length >= 8) {
    return normalized.slice(0, 64);
  }
  const digest = createHash("sha1").update(candidate).digest("hex");
  return `tr_${digest.slice(0, 24)}`;
}

function clampLimit(input: unknown, fallback: number): number {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.max(value, 1), 500);
}

function normalizeEnv(): "production" | "staging" | "dev" | "local" {
  const raw = String(process.env.NODE_ENV || "").toLowerCase();
  if (raw === "production") return "production";
  if (raw === "staging") return "staging";
  if (raw === "test" || raw === "development" || raw === "dev") return "dev";
  return "local";
}

function coerceRetrievalAnswerMode(
  value: unknown,
): RetrievalRequest["signals"]["answerMode"] {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  const allowed = new Set<
    NonNullable<RetrievalRequest["signals"]["answerMode"]>
  >([
    "nav_pills",
    "doc_grounded_single",
    "doc_grounded_multi",
    "doc_grounded_quote",
    "doc_grounded_table",
    "general_answer",
    "help_steps",
    "rank_disambiguate",
    "rank_autopick",
  ]);
  return allowed.has(
    normalized as NonNullable<RetrievalRequest["signals"]["answerMode"]>,
  )
    ? (normalized as NonNullable<RetrievalRequest["signals"]["answerMode"]>)
    : null;
}

export function buildAttachmentDocScopeSignals(
  attachedDocumentIds: string[],
): Pick<
  RetrievalRequest["signals"],
  | "docScopeLock"
  | "explicitDocLock"
  | "activeDocId"
  | "explicitDocRef"
  | "resolvedDocId"
  | "hardScopeActive"
  | "singleDocIntent"
> {
  const docScopeLock = buildAttachmentDocScopeLock(attachedDocumentIds);
  const activeDocId =
    docScopeLock.mode === "single_doc"
      ? docScopeLock.activeDocumentId || null
      : null;

  return {
    docScopeLock,
    explicitDocLock: docScopeLock.mode !== "none",
    activeDocId,
    explicitDocRef: docScopeLock.mode === "single_doc",
    resolvedDocId: activeDocId,
    hardScopeActive: docScopeLock.mode !== "none",
    singleDocIntent: docScopeLock.mode === "single_doc",
  };
}

export function applyConversationHistoryDocScopeFallback(params: {
  signals: Pick<
    RetrievalRequest["signals"],
    | "docScopeLock"
    | "explicitDocLock"
    | "activeDocId"
    | "explicitDocRef"
    | "resolvedDocId"
    | "hardScopeActive"
    | "singleDocIntent"
  >;
  attachedDocumentIds: string[];
  lastDocumentId?: string | null;
}): Pick<
  RetrievalRequest["signals"],
  | "docScopeLock"
  | "explicitDocLock"
  | "activeDocId"
  | "explicitDocRef"
  | "resolvedDocId"
  | "hardScopeActive"
  | "singleDocIntent"
> {
  const signals = { ...params.signals };
  const lastDocumentId = String(params.lastDocumentId || "").trim();
  if (!lastDocumentId) return signals;
  if (signals.resolvedDocId || signals.singleDocIntent) return signals;
  if (!params.attachedDocumentIds.includes(lastDocumentId)) return signals;

  // With multi-attachment turns, keep docset lock strict; do not narrow to a
  // single history doc unless the user explicitly referenced a single document.
  if (params.attachedDocumentIds.length !== 1) {
    return signals;
  }

  signals.docScopeLock = createDocScopeLock({
    mode: "single_doc",
    allowedDocumentIds: [lastDocumentId],
    activeDocumentId: lastDocumentId,
    source: "system",
  });
  signals.explicitDocLock = true;
  signals.activeDocId = lastDocumentId;
  signals.explicitDocRef = true;
  signals.resolvedDocId = lastDocumentId;
  signals.hardScopeActive = true;
  signals.singleDocIntent = true;
  return signals;
}

function fallbackSourceLabel(docId: string): string {
  const shortId = String(docId || "")
    .trim()
    .slice(0, 8);
  return shortId ? `Document ${shortId}` : "Document";
}

function toConversationDTO(row: {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ConversationDTO {
  return {
    id: String(row.id),
    title: String(row.title ?? "New Chat"),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function parseStoredMetadata(
  raw: string | null,
): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  } catch {
    return null;
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").trim())
    .filter((entry) => entry.length > 0);
}

function normalizeSnippetForHash(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildEvidenceMapForEnforcer(
  retrievalPack: EvidencePack | null,
): Array<{
  evidenceId: string;
  documentId: string;
  locationKey: string;
  snippetHash: string;
}> {
  const evidence = retrievalPack?.evidence || [];
  const out: Array<{
    evidenceId: string;
    documentId: string;
    locationKey: string;
    snippetHash: string;
  }> = [];
  for (const item of evidence) {
    const documentId = String(item.docId || "").trim();
    const locationKey = String(item.locationKey || "").trim();
    const snippet = String(item.snippet || "").trim();
    if (!documentId || !locationKey || !snippet) continue;
    const evidenceId = `${documentId}:${locationKey}`;
    const snippetHash = createHash("sha256")
      .update(normalizeSnippetForHash(snippet))
      .digest("hex")
      .slice(0, 16);
    out.push({ evidenceId, documentId, locationKey, snippetHash });
  }
  return out;
}

function toMessageDTO(row: {
  id: string;
  role: string;
  content: string | null;
  createdAt: Date;
  updatedAt?: Date;
  metadata: string | null;
}): ChatMessageDTO {
  const metadata = parseStoredMetadata(row.metadata);
  const attachments =
    metadata && "attachments" in metadata ? metadata.attachments : null;
  const telemetry =
    metadata && "telemetry" in metadata ? metadata.telemetry : null;
  return {
    id: String(row.id),
    role: row.role as ChatRole,
    content: String(row.content ?? ""),
    attachments: (attachments as unknown) ?? null,
    telemetry: (telemetry as Record<string, unknown> | null) ?? null,
    metadata,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt ?? row.createdAt).toISOString(),
  };
}

function textForRoleHistory(messages: ChatMessageDTO[]): Array<{
  role: ChatRole;
  content: string;
}> {
  return messages
    .map((m) => ({
      role: m.role,
      content: String(m.content || "").trim(),
    }))
    .filter((m) => m.content.length > 0);
}

function sanitizeSnippet(value: string, maxChars: number): string {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

type ChatSourceEntry = NonNullable<ChatResult["sources"]>[number];

type SourceGroundingOptions = {
  enforceScopedSources?: boolean;
};

function isDocGroundedAnswerMode(answerMode: AnswerMode): boolean {
  return String(answerMode || "").startsWith("doc_grounded");
}

export function resolveSourceInvariantFailureCode(params: {
  answerMode: AnswerMode;
  filteredSources: Array<{ documentId?: string | null }>;
}): "missing_provenance" | null {
  if (!isDocGroundedAnswerMode(params.answerMode)) return null;
  return Array.isArray(params.filteredSources) &&
    params.filteredSources.length === 0
    ? "missing_provenance"
    : null;
}

type SemanticSignalKey =
  | "hasQuotedText"
  | "hasFilename"
  | "userAskedForTable"
  | "userAskedForQuote"
  | "sheetHintPresent"
  | "rangeExplicit"
  | "timeConstraintsPresent"
  | "explicitYearOrQuarterComparison"
  | "tableExpected";

type MemoryRuntimeTuning = {
  recentContextLimit: number;
  historyClampMax: number;
  defaultStateSummary: string;
  defaultStateTopic: string;
  memorySummaryMaxChars: number;
  memoryRecallMaxItems: number;
  memoryRecallSnippetChars: number;
  evidenceSnippetMaxChars: number;
  queryKeywordMaxTerms: number;
  queryKeywordMinLength: number;
  queryStopWords: { any: string[]; pt?: string[]; es?: string[] };
  memoryArtifactStore?: {
    recentMessageIdMaxItems?: number;
    recallBufferMaxItems?: number;
    keyTopicMaxItems?: number;
    summaryRefreshAssistantEveryTurns?: number;
    staleTopicDecayTurns?: number;
    maxPersistedSourceDocumentIds?: number;
    maxPersistedRecallBytes?: number;
  };
  semanticSignals?: {
    regexFlags?: string;
    patterns?: Partial<Record<SemanticSignalKey, string[]>>;
  };
  semanticRetrieval?: {
    enableGlobalEvidenceSearch?: boolean;
    globalSearchMinQueryChars?: number;
    maxEvidenceItemsForAnswer?: number;
    preferActiveScopeWhenFollowup?: boolean;
    staleScopePenalty?: number;
    maxGlobalRetrievalsPerTurn?: number;
  };
};

function buildSourcesFromEvidence(evidence: EvidenceItem[]): ChatSourceEntry[] {
  const seen = new Set<string>();
  const out: ChatSourceEntry[] = [];

  for (const item of evidence) {
    if (!item.docId || seen.has(item.docId)) continue;
    seen.add(item.docId);
    out.push({
      documentId: item.docId,
      filename: String(
        item.filename || item.title || fallbackSourceLabel(item.docId),
      ),
      mimeType: null,
      page: item.location.page ?? null,
    });
    if (out.length >= 6) break;
  }

  return out;
}

function filterSourcesByProvenance(
  sources: ChatSourceEntry[],
  provenance: ChatProvenanceDTO | undefined,
  answerText: string,
  evidence: EvidenceItem[],
  options: SourceGroundingOptions = {},
): ChatSourceEntry[] {
  if (!provenance || sources.length === 0) {
    return options.enforceScopedSources ? [] : sources;
  }

  // Primary: use provenance sourceDocumentIds
  if (provenance.sourceDocumentIds.length > 0) {
    const allowed = new Set(provenance.sourceDocumentIds);
    const filtered = sources.filter((s) => allowed.has(s.documentId));
    if (filtered.length > 0) return filtered;
    return options.enforceScopedSources ? [] : sources.slice(0, 1);
  }

  // Fallback: text-matching via extractUsedDocuments
  const chunks: EvidenceChunkForFiltering[] = evidence.map((e) => ({
    docId: e.docId,
    fileName: String(e.filename || e.title || ""),
    docTitle: String(e.title || e.filename || ""),
    text: e.snippet || "",
    pageStart: e.location?.page ?? undefined,
    sheetName: e.location?.sheet ?? undefined,
    slideNumber: e.location?.slide ?? undefined,
  }));
  const usedDocIds = extractUsedDocuments(answerText, chunks);
  if (usedDocIds.size > 0) {
    const filtered = sources.filter((s) => usedDocIds.has(s.documentId));
    if (filtered.length > 0) return filtered;
    return options.enforceScopedSources ? [] : sources.slice(0, 1);
  }

  return options.enforceScopedSources ? [] : sources;
}

function filterAttachmentByProvenance(
  attachment: unknown | null,
  provenance: ChatProvenanceDTO | undefined,
  answerText: string,
  evidence: EvidenceItem[],
  options: SourceGroundingOptions = {},
): unknown | null {
  if (!attachment || !provenance) {
    return options.enforceScopedSources ? null : attachment;
  }

  let allowedDocIds: Set<string>;
  if (provenance.sourceDocumentIds.length > 0) {
    allowedDocIds = new Set(provenance.sourceDocumentIds);
  } else {
    const chunks: EvidenceChunkForFiltering[] = evidence.map((e) => ({
      docId: e.docId,
      fileName: String(e.filename || e.title || ""),
      docTitle: String(e.title || e.filename || ""),
      text: e.snippet || "",
    }));
    allowedDocIds = extractUsedDocuments(answerText, chunks);
  }
  if (allowedDocIds.size === 0) {
    return options.enforceScopedSources ? null : attachment;
  }
  return filterSourceButtonsByUsage(
    attachment as SourceButtonsAttachment,
    allowedDocIds,
  );
}

function toEngineEvidencePack(pack: EvidencePack | null) {
  if (!pack || !Array.isArray(pack.evidence) || pack.evidence.length === 0) {
    return undefined;
  }

  return {
    query: {
      original: pack.query.original,
      normalized: pack.query.normalized,
    },
    scope: {
      activeDocId: pack.scope.activeDocId ?? null,
      explicitDocLock: Boolean(pack.scope.explicitDocLock),
    },
    stats: {
      evidenceItems: pack.stats.evidenceItems,
      uniqueDocsInEvidence: pack.stats.uniqueDocsInEvidence,
      topScore: pack.stats.topScore,
      scoreGap: pack.stats.scoreGap,
    },
    evidence: pack.evidence.map((item) => ({
      docId: item.docId,
      title: item.title ?? null,
      filename: item.filename ?? null,
      location: {
        page: item.location.page ?? null,
        sheet: item.location.sheet ?? null,
        slide: item.location.slide ?? null,
        sectionKey: item.location.sectionKey ?? null,
      },
      locationKey: item.locationKey,
      snippet: item.snippet,
      score: {
        finalScore: item.score.finalScore,
      },
      evidenceType: item.evidenceType,
    })),
  };
}

function mergeAttachments(
  modelAttachments: unknown,
  sourceButtonsAttachment: unknown | null,
): unknown[] {
  const model = Array.isArray(modelAttachments)
    ? modelAttachments
    : modelAttachments
      ? [modelAttachments]
      : [];
  if (!sourceButtonsAttachment) return model;

  const hasSourceButtons = model.some((item) => {
    if (!item || typeof item !== "object") return false;
    return (item as Record<string, unknown>).type === "source_buttons";
  });
  if (hasSourceButtons) return model;
  return [sourceButtonsAttachment, ...model];
}

function buildEmptyAssistantText(params: {
  language?: string;
  reasonCode?: string | null;
  seed: string;
}): string {
  return resolveRuntimeFallbackMessage({
    language: params.language,
    reasonCode: params.reasonCode,
    seed: params.seed,
  });
}

function normalizeChatLanguage(value: unknown): "en" | "pt" | "es" {
  const lang = String(value || "")
    .trim()
    .toLowerCase();
  if (lang === "pt" || lang === "es") return lang;
  return "en";
}

function countRegexMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function looksLikelyPortuguese(text: string): boolean {
  const value = ` ${String(text || "").toLowerCase()} `;
  const ptWords =
    countRegexMatches(
      value,
      /\b(de|para|com|nao|voce|qual|quais|como|onde|porque|obrigado|resumo|tabela|evidencia|documento|documentos)\b/g,
    ) +
    countRegexMatches(value, /[ãõçáàâéêíóôú]/g) * 2;
  const enWords = countRegexMatches(
    value,
    /\b(the|with|this|that|for|from|please|summary|table|evidence|document|documents)\b/g,
  );
  return ptWords >= enWords + 2;
}

function looksLikelySpanish(text: string): boolean {
  const value = ` ${String(text || "").toLowerCase()} `;
  const esWords =
    countRegexMatches(
      value,
      /\b(de|para|con|donde|cual|cuales|gracias|resumen|tabla|evidencia|documento|documentos)\b/g,
    ) +
    countRegexMatches(value, /[ñ¿¡]/g) * 2;
  const enWords = countRegexMatches(
    value,
    /\b(the|with|this|that|for|from|please|summary|table|evidence|document|documents)\b/g,
  );
  return esWords >= enWords + 2;
}

function looksLikelyEnglish(text: string): boolean {
  const value = ` ${String(text || "").toLowerCase()} `;
  const enWords = countRegexMatches(
    value,
    /\b(the|with|this|that|for|from|please|summary|table|evidence|document|documents|according|based)\b/g,
  );
  const ptWords = countRegexMatches(
    value,
    /\b(de|para|com|nao|voce|qual|quais|como|onde|porque|obrigado|resumo|tabela|evidencia|documento|documentos)\b/g,
  );
  const esWords = countRegexMatches(
    value,
    /\b(de|para|con|donde|cual|cuales|gracias|resumen|tabla|evidencia|documento|documentos)\b/g,
  );
  return enWords >= Math.max(ptWords, esWords) + 2;
}

function buildLanguageContractFallback(language: "en" | "pt" | "es"): string {
  if (language === "pt") {
    return "Nao consegui finalizar a resposta no idioma solicitado com seguranca. Reenvie e eu respondo somente em portugues.";
  }
  if (language === "es") {
    return "No pude finalizar la respuesta en el idioma solicitado de forma segura. Reenvia y respondere solo en espanol.";
  }
  return "I could not safely finalize this answer in the requested language. Please retry and I will answer only in English.";
}

function enforceLanguageContract(params: {
  text: string;
  preferredLanguage?: string | null;
}): { text: string; adjusted: boolean } {
  const normalized = String(params.text || "").trim();
  if (!normalized) return { text: normalized, adjusted: false };
  const lang = normalizeChatLanguage(params.preferredLanguage);
  const mismatch =
    (lang === "en" && !looksLikelyEnglish(normalized)) ||
    (lang === "pt" && !looksLikelyPortuguese(normalized)) ||
    (lang === "es" && !looksLikelySpanish(normalized));
  if (!mismatch) return { text: normalized, adjusted: false };
  return { text: buildLanguageContractFallback(lang), adjusted: true };
}

function toPositiveInt(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.floor(num);
}

type ResolvedTruncationState = {
  contractOccurred: boolean;
  contractReason: string | null;
  providerOccurred: boolean;
  providerReason: string | null;
  semanticOccurred: boolean;
  semanticReason: string | null;
  detectorVersion: string;
};

function resolveTruncationState(params: {
  telemetry?: Record<string, unknown> | null;
  finalText: string;
  enforcementRepairs?: string[] | null;
}): ResolvedTruncationState {
  const provider = classifyProviderTruncation(params.telemetry);
  const semantic = classifyVisibleTruncation({
    finalText: params.finalText,
    enforcementRepairs: params.enforcementRepairs,
    providerTruncation: provider,
  });
  const useSemanticV2 = isSemanticTruncationV2Enabled();

  return {
    contractOccurred: useSemanticV2 ? semantic.occurred : provider.occurred,
    contractReason: useSemanticV2 ? semantic.reason : provider.reason,
    providerOccurred: provider.occurred,
    providerReason: provider.reason,
    semanticOccurred: semantic.occurred,
    semanticReason: semantic.reason,
    detectorVersion:
      semantic.detectorVersion || SEMANTIC_TRUNCATION_DETECTOR_VERSION,
  };
}

export function shouldApplyPreEnforcerTrim(params: {
  telemetry?: Record<string, unknown> | null;
  finalText: string;
  requestedMaxOutputTokens: number | null;
}): boolean {
  if (
    !params.requestedMaxOutputTokens ||
    params.requestedMaxOutputTokens <= 0
  ) {
    return false;
  }
  const provider = classifyProviderTruncation(params.telemetry);
  if (!provider.occurred) return false;
  const semantic = classifyVisibleTruncation({
    finalText: params.finalText,
    enforcementRepairs: [],
    providerTruncation: provider,
  });
  return semantic.occurred;
}

function isRuntimePolicyFailure(error: unknown): boolean {
  if (isRuntimePolicyError(error)) return true;
  const message = String((error as any)?.message || "");
  return (
    message.includes("memory_policy.config.runtimeTuning") ||
    message.includes("Required bank missing: memory_policy") ||
    message.includes("memory_policy.config.integrationHooks")
  );
}

export class CentralizedChatRuntimeDelegate {
  private encryptedRepo?: EncryptedChatRepo;
  private encryptedContext?: EncryptedChatContextService;
  private readonly retrievalFactory = new PrismaRetrievalAdapterFactory();
  private readonly evidenceGate = new EvidenceGateService();
  private readonly conversationMemory: ConversationMemoryService;
  private readonly memoryPolicyEngine: MemoryPolicyEngine;
  private readonly memoryRedaction: MemoryRedactionService;
  private readonly traceWriter = new TraceWriterService(prisma as any);

  constructor(
    private readonly engine: ChatEngine,
    opts?: {
      encryptedRepo?: EncryptedChatRepo;
      encryptedContext?: EncryptedChatContextService;
      conversationMemory?: ConversationMemoryService;
    },
  ) {
    this.encryptedRepo = opts?.encryptedRepo;
    this.encryptedContext = opts?.encryptedContext;
    this.conversationMemory =
      opts?.conversationMemory as ConversationMemoryService;
    if (!this.conversationMemory) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        "CentralizedChatRuntimeDelegate requires conversationMemory dependency",
      );
    }
    this.memoryPolicyEngine = new MemoryPolicyEngine();
    this.memoryRedaction = new MemoryRedactionService();
  }

  wireEncryption(
    encryptedRepo: EncryptedChatRepo,
    encryptedContext?: EncryptedChatContextService,
  ): void {
    this.encryptedRepo = encryptedRepo;
    if (encryptedContext) {
      this.encryptedContext = encryptedContext;
    }
  }

  private resolveTraceId(req: ChatRequest): string {
    const meta = asObject(req.meta);
    return sanitizeTraceId(meta.requestId) || mkTraceId();
  }

  private toTraceFinalStatus(
    status: ChatResult["status"] | undefined,
  ): "success" | "partial" | "clarification_required" | "blocked" | "failed" {
    if (status === "partial") return "partial";
    if (status === "clarification_required") return "clarification_required";
    if (status === "blocked") return "blocked";
    if (status === "failed") return "failed";
    return "success";
  }

  private extractTelemetryUsage(telemetry?: Record<string, unknown> | null): {
    inputTokens: number | null;
    outputTokens: number | null;
  } {
    const usage = asObject(asObject(telemetry).usage);
    const inputTokens = toPositiveInt(
      usage.inputTokens ??
        usage.promptTokens ??
        usage.input_tokens ??
        usage.prompt_tokens,
    );
    const outputTokens = toPositiveInt(
      usage.outputTokens ??
        usage.completionTokens ??
        usage.output_tokens ??
        usage.completion_tokens,
    );
    return { inputTokens, outputTokens };
  }

  private buildTurnDebugPacket(params: {
    traceId: string;
    req: ChatRequest;
    conversationId: string;
    retrievalPack: EvidencePack | null;
    answerMode: AnswerMode;
    status: ChatResult["status"];
    failureCode?: string | null;
    telemetry?: Record<string, unknown> | null;
    enforcement?: { repairs: string[]; warnings: string[] } | null;
    enforcementBlocked?: boolean;
    enforcementReasonCode?: string | null;
    provenance?: ChatProvenanceDTO | null;
    truncation?: ResolvedTruncationState | null;
  }): TurnDebugPacket {
    const meta = asObject(params.req.meta);
    const usage = this.extractTelemetryUsage(params.telemetry);
    const requestedMaxOutputTokens = toPositiveInt(
      asObject(params.telemetry).requestedMaxOutputTokens,
    );
    const observedOutputTokens = usage.outputTokens;
    const hardMaxOutputTokens =
      requestedMaxOutputTokens != null
        ? Math.ceil(requestedMaxOutputTokens * 1.25)
        : null;
    const evidenceIds = (params.retrievalPack?.evidence || [])
      .map((item) => `${item.docId}:${item.locationKey}`)
      .slice(0, 24);
    const evidenceMapHash =
      evidenceIds.length > 0
        ? createHash("sha256").update(evidenceIds.join("|")).digest("hex")
        : null;
    const attachedIds = Array.isArray(params.req.attachedDocumentIds)
      ? params.req.attachedDocumentIds
      : [];
    const docScopeMode: "none" | "single_doc" | "docset" =
      attachedIds.length > 1
        ? "docset"
        : attachedIds.length === 1
          ? "single_doc"
          : "none";

    return {
      traceId: params.traceId,
      requestId:
        typeof meta.requestId === "string" ? String(meta.requestId) : null,
      conversationId: params.conversationId || null,
      userIdHash: createHash("sha1")
        .update(String(params.req.userId || ""))
        .digest("hex")
        .slice(0, 16),
      answerMode: String(params.answerMode || "general_answer"),
      docScopeLock: {
        mode: docScopeMode,
        allowedDocumentIdsCount: attachedIds.length,
        activeDocumentId: attachedIds.length === 1 ? attachedIds[0] : null,
      },
      retrieval: {
        candidates: params.retrievalPack?.stats.candidatesConsidered ?? 0,
        selected: params.retrievalPack?.evidence.length ?? 0,
        topScore: params.retrievalPack?.stats.topScore ?? null,
        scopeCandidatesDropped:
          params.retrievalPack?.stats.scopeCandidatesDropped ?? 0,
        evidenceIds,
        documentIds: [
          ...new Set(
            (params.retrievalPack?.evidence || []).map((e) => e.docId),
          ),
        ].slice(0, 24),
      },
      provenance: {
        schemaVersion: "v1",
        evidenceMapHash,
        required: Boolean(params.provenance?.required),
        validated: Boolean(params.provenance?.validated),
        failureCode: params.provenance?.failureCode || null,
      },
      budget: {
        requestedMaxOutputTokens,
        hardMaxOutputTokens,
        observedOutputTokens,
      },
      enforcement: {
        blocked: Boolean(params.enforcementBlocked),
        reasonCode: params.enforcementReasonCode || null,
        repairs: params.enforcement?.repairs || [],
        warnings: params.enforcement?.warnings || [],
      },
      output: {
        sourceCount: params.retrievalPack?.evidence.length ?? 0,
        wasTruncated: Boolean(params.truncation?.contractOccurred),
        wasProviderTruncated: Boolean(params.truncation?.providerOccurred),
        wasSemanticallyTruncated: Boolean(params.truncation?.semanticOccurred),
        truncationReason: params.truncation?.contractReason || null,
        providerTruncationReason: params.truncation?.providerReason || null,
        semanticTruncationReason: params.truncation?.semanticReason || null,
        detectorVersion:
          params.truncation?.detectorVersion ||
          SEMANTIC_TRUNCATION_DETECTOR_VERSION,
        status: String(params.status || "success"),
        failureCode: params.failureCode || null,
      },
      createdAt: new Date().toISOString(),
    };
  }

  private extractTraceKeywords(
    query: string,
  ): Array<{ keyword: string; weight: number }> {
    const normalized = String(query || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3);
    const deduped = [...new Set(normalized)].slice(0, 16);
    return deduped.map((keyword, idx) => ({
      keyword,
      weight: Math.max(0.1, 1 - idx * 0.05),
    }));
  }

  private extractTraceEntities(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
  ): Array<{ type: string; value: string; confidence: number }> {
    const entities: Array<{ type: string; value: string; confidence: number }> =
      [];
    const docIds = new Set<string>([
      ...(Array.isArray(req.attachedDocumentIds)
        ? req.attachedDocumentIds
        : []),
      ...(retrievalPack?.scope?.candidateDocIds || []),
    ]);
    for (const docId of docIds) {
      const normalized = String(docId || "").trim();
      if (!normalized) continue;
      entities.push({
        type: "document_id",
        value: normalized,
        confidence: 1,
      });
      if (entities.length >= 20) return entities;
    }

    const years = String(req.message || "").match(/\b(?:19|20)\d{2}\b/g) || [];
    for (const year of years.slice(0, 8)) {
      entities.push({
        type: "year",
        value: year,
        confidence: 0.85,
      });
    }

    const amounts =
      String(req.message || "").match(
        /\b(?:\$|usd|eur|brl)?\s?\d[\d,.]{2,}\b/gi,
      ) || [];
    for (const amount of amounts.slice(0, 8)) {
      entities.push({
        type: "amount",
        value: amount.trim(),
        confidence: 0.7,
      });
    }
    return entities.slice(0, 20);
  }

  private mapEvidenceStrengthToScore(
    strength: EvidenceCheckResult["evidenceStrength"] | null | undefined,
  ): number | null {
    if (strength === "strong") return 0.9;
    if (strength === "moderate") return 0.65;
    if (strength === "weak") return 0.35;
    if (strength === "none") return 0.05;
    return null;
  }

  private async persistTraceArtifacts(params: {
    traceId: string;
    req: ChatRequest;
    conversationId: string;
    userMessageId?: string | null;
    assistantMessageId?: string | null;
    retrievalPack: EvidencePack | null;
    evidenceGateDecision?: EvidenceCheckResult | null;
    answerMode: AnswerMode;
    status: ChatResult["status"];
    failureCode?: string | null;
    fallbackReasonCode?: string;
    assistantText: string;
    telemetry?: Record<string, unknown> | null;
    totalMs: number;
    retrievalMs?: number | null;
    llmMs?: number | null;
    stream: boolean;
    enforcement?: { repairs: string[]; warnings: string[] } | null;
    enforcementBlocked?: boolean;
    enforcementReasonCode?: string | null;
    provenance?: ChatProvenanceDTO | null;
    truncation?: ChatResult["truncation"] | null;
  }): Promise<void> {
    const distinctDocIds = [
      ...new Set(
        (params.retrievalPack?.evidence || []).map((item) => item.docId),
      ),
    ];
    const inputTokensAndOutput = this.extractTelemetryUsage(params.telemetry);
    const totalTokens =
      (inputTokensAndOutput.inputTokens ?? 0) +
      (inputTokensAndOutput.outputTokens ?? 0);
    const evidenceAction =
      params.evidenceGateDecision?.suggestedAction ?? "answer";
    const evidenceStrength = this.mapEvidenceStrengthToScore(
      params.evidenceGateDecision?.evidenceStrength,
    );
    const meta = asObject(params.req.meta);
    const fallbackReason =
      params.failureCode || params.fallbackReasonCode || null;
    const retrievalAdequate = (params.retrievalPack?.evidence.length ?? 0) > 0;
    const resolvedOperator =
      typeof meta.operator === "string"
        ? String(meta.operator)
        : retrievalAdequate
          ? "answer_with_sources"
          : "answer";
    const resolvedIntent =
      typeof meta.intentFamily === "string"
        ? String(meta.intentFamily)
        : retrievalAdequate
          ? "documents"
          : "general";
    const resolvedDomain =
      typeof meta.domain === "string"
        ? String(meta.domain)
        : retrievalAdequate
          ? "documents"
          : "general";
    const derivedTruncation = resolveTruncationState({
      telemetry: params.telemetry,
      finalText: params.assistantText,
      enforcementRepairs: params.enforcement?.repairs || [],
    });
    const truncation: ResolvedTruncationState = params.truncation
      ? {
          contractOccurred: Boolean(params.truncation.occurred),
          contractReason: params.truncation.reason ?? null,
          providerOccurred:
            params.truncation.providerOccurred === undefined
              ? derivedTruncation.providerOccurred
              : Boolean(params.truncation.providerOccurred),
          providerReason:
            params.truncation.providerReason ??
            derivedTruncation.providerReason,
          semanticOccurred: derivedTruncation.semanticOccurred,
          semanticReason: derivedTruncation.semanticReason,
          detectorVersion:
            params.truncation.detectorVersion ??
            derivedTruncation.detectorVersion,
        }
      : derivedTruncation;
    const keywords = this.extractTraceKeywords(params.req.message);
    const entities = this.extractTraceEntities(
      params.req,
      params.retrievalPack,
    );

    this.traceWriter.recordBankUsage({
      traceId: params.traceId,
      bankType: "policy_bank",
      bankId: "memory_policy",
      stageUsed: "retrieval",
    });
    this.traceWriter.recordBankUsage({
      traceId: params.traceId,
      bankType: "policy_bank",
      bankId: "truncation_and_limits.any.json",
      stageUsed: "output_contract",
    });
    this.traceWriter.recordKeywords(params.traceId, keywords);
    this.traceWriter.recordEntities(params.traceId, entities);
    this.traceWriter.writeTurnDebugPacket(
      this.buildTurnDebugPacket({
        traceId: params.traceId,
        req: params.req,
        conversationId: params.conversationId,
        retrievalPack: params.retrievalPack,
        answerMode: params.answerMode,
        status: params.status,
        failureCode: params.failureCode,
        telemetry: params.telemetry,
        enforcement: params.enforcement || null,
        enforcementBlocked: params.enforcementBlocked,
        enforcementReasonCode: params.enforcementReasonCode,
        provenance: params.provenance || null,
        truncation,
      }),
    );
    const ruleEvents = Array.isArray(
      params.retrievalPack?.telemetry?.ruleEvents,
    )
      ? params.retrievalPack?.telemetry?.ruleEvents
      : [];
    const retrievalRuleEventWrites = ruleEvents.map((event) => {
      const payload = asObject(event?.payload);
      const eventName = String(event?.event || "").trim();
      const scoreDeltaSummaryRaw = asObject(payload.scoreDeltaSummary);
      const toFiniteNumberOrNull = (value: unknown): number | null => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const scoreDeltaSummary =
        Object.keys(scoreDeltaSummaryRaw).length > 0
          ? {
              candidateHits: toPositiveInt(scoreDeltaSummaryRaw.candidateHits),
              totalDelta: toFiniteNumberOrNull(scoreDeltaSummaryRaw.totalDelta),
              averageDelta: toFiniteNumberOrNull(
                scoreDeltaSummaryRaw.averageDelta,
              ),
              maxDelta: toFiniteNumberOrNull(scoreDeltaSummaryRaw.maxDelta),
            }
          : null;
      return this.traceWriter.writeRetrievalEvent({
        traceId: params.traceId,
        userId: params.req.userId,
        conversationId: params.conversationId,
        operator:
          typeof payload.operator === "string"
            ? String(payload.operator)
            : resolvedOperator,
        intent:
          typeof payload.intent === "string"
            ? String(payload.intent)
            : resolvedIntent,
        domain:
          typeof payload.domain === "string"
            ? String(payload.domain)
            : resolvedDomain,
        docLockEnabled:
          Boolean(params.retrievalPack?.scope.explicitDocLock) ||
          (params.req.attachedDocumentIds || []).length > 0,
        strategy: "document_intelligence_rule_event",
        candidates: null,
        selected: null,
        evidenceStrength: null,
        refined: undefined,
        wrongDocPrevented: undefined,
        sourcesCount: null,
        navPillsUsed: undefined,
        fallbackReasonCode: null,
        at: new Date(),
        meta: {
          eventType: eventName,
          ruleId:
            typeof payload.ruleId === "string" ? String(payload.ruleId) : null,
          reason:
            typeof payload.reason === "string" ? String(payload.reason) : null,
          variantCount: toPositiveInt(payload.variantCount),
          anchorsCount: toPositiveInt(payload.anchorsCount),
          requiredExplicitDocs: toPositiveInt(payload.requiredExplicitDocs),
          actualExplicitDocs: toPositiveInt(payload.actualExplicitDocs),
          scoreDeltaSummary,
        },
      });
    });

    await Promise.all([
      this.traceWriter.upsertQueryTelemetry({
        traceId: params.traceId,
        userId: params.req.userId,
        conversationId: params.conversationId,
        messageId: params.assistantMessageId || params.userMessageId || null,
        queryText: params.req.message,
        intent: resolvedIntent,
        intentConfidence: retrievalAdequate ? 0.92 : 0.72,
        domain: resolvedDomain,
        answerMode: params.answerMode,
        operatorFamily:
          typeof meta.operatorFamily === "string"
            ? String(meta.operatorFamily)
            : typeof meta.operator === "string"
              ? String(meta.operator)
              : retrievalAdequate
                ? "answer_with_sources"
                : "answer",
        chunksReturned: params.retrievalPack?.evidence.length ?? 0,
        distinctDocs: distinctDocIds.length,
        documentIds: distinctDocIds,
        topRelevanceScore: params.retrievalPack?.stats.topScore ?? null,
        retrievalAdequate,
        evidenceGateAction: evidenceAction,
        evidenceShouldProceed:
          evidenceAction === "answer" || evidenceAction === "hedge",
        hadFallback: Boolean(fallbackReason),
        fallbackScenario: fallbackReason,
        answerLength: String(params.assistantText || "").length,
        wasTruncated: truncation.contractOccurred,
        wasProviderTruncated: truncation.providerOccurred,
        truncationDetectorVersion: truncation.detectorVersion,
        truncationReason: truncation.contractReason,
        providerTruncationReason: truncation.providerReason,
        failureCode: params.failureCode || null,
        hasErrors: params.status === "failed" || Boolean(params.failureCode),
        warnings: fallbackReason ? [fallbackReason] : [],
        totalMs: params.totalMs,
        ttft: toPositiveInt(asObject(params.telemetry).firstTokenMs),
        retrievalMs: params.retrievalMs ?? null,
        llmMs: params.llmMs ?? null,
        model:
          typeof params.telemetry?.model === "string"
            ? params.telemetry.model
            : null,
        inputTokens: inputTokensAndOutput.inputTokens,
        outputTokens: inputTokensAndOutput.outputTokens,
        totalTokens,
        pipelineSignature: params.stream
          ? "chat_runtime_delegate:stream"
          : "chat_runtime_delegate:chat",
        environment: normalizeEnv(),
        errors: params.failureCode ? { failureCode: params.failureCode } : null,
      }),
      this.traceWriter.writeRetrievalEvent({
        traceId: params.traceId,
        userId: params.req.userId,
        conversationId: params.conversationId,
        operator: resolvedOperator,
        intent: resolvedIntent,
        domain: resolvedDomain,
        docLockEnabled:
          Boolean(params.retrievalPack?.scope.explicitDocLock) ||
          (params.req.attachedDocumentIds || []).length > 0,
        strategy: params.retrievalPack ? "hybrid_keyword_ranked" : "none",
        candidates: params.retrievalPack?.stats.candidatesConsidered ?? 0,
        selected: params.retrievalPack?.evidence.length ?? 0,
        evidenceStrength,
        refined: (params.retrievalPack?.stats.scoreGap ?? 0) > 0.08,
        wrongDocPrevented:
          (params.retrievalPack?.stats.scopeCandidatesDropped ?? 0) > 0,
        sourcesCount: params.retrievalPack?.evidence.length ?? 0,
        navPillsUsed: params.answerMode === "nav_pills",
        fallbackReasonCode: fallbackReason,
        at: new Date(),
        meta: {
          requestId:
            typeof meta.requestId === "string" ? String(meta.requestId) : null,
          evidenceGateAction: evidenceAction,
          retrievalStats: params.retrievalPack?.stats || null,
          retrievalRuleSummary:
            params.retrievalPack?.telemetry?.summary || null,
        },
      }),
      ...retrievalRuleEventWrites,
    ]);

    await this.traceWriter.flush(params.traceId, {
      status: this.toTraceFinalStatus(params.status),
    });
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const traceId = this.resolveTraceId(req);
    const turnStartedAt = Date.now();
    const inputSpanId = this.traceWriter.startSpan(
      traceId,
      "input_normalization",
      {
        hasConversationId: Boolean(req.conversationId),
      },
    );
    let conversationId = "";
    let lastDocumentId: string | null = null;
    let userMessage: ChatMessageDTO | null = null;
    let retrievalPack:
      | (EvidencePack & { resolvedDocId?: string | null })
      | null = null;
    let evidenceGateDecision: EvidenceCheckResult | null = null;
    let answerMode: AnswerMode =
      (req.attachedDocumentIds || []).length > 0
        ? "help_steps"
        : "general_answer";
    let retrievalMs: number | null = null;
    let llmMs: number | null = null;
    try {
      const conv = await this.ensureConversation(
        req.userId,
        req.conversationId,
      );
      conversationId = conv.id;
      lastDocumentId = conv.lastDocumentId;

      userMessage = await this.createMessage({
        conversationId,
        role: "user",
        content: req.message,
        userId: req.userId,
      });

      const history = await this.loadRecentForEngine(
        conversationId,
        this.resolveRecentContextLimit(),
        req.userId,
        req.message,
      );
      this.traceWriter.endSpan(traceId, inputSpanId, {
        status: "ok",
        metadata: {
          conversationId,
          userMessageId: userMessage.id,
          historyMessages: history.length,
        },
      });

      const retrievalSpanId = this.traceWriter.startSpan(traceId, "retrieval");
      const retrievalStartedAt = Date.now();
      retrievalPack = await this.retrieveEvidence(req, lastDocumentId);
      retrievalMs = Date.now() - retrievalStartedAt;

      // Persist resolved doc for conversation-history follow-up scoping
      const resolvedDocId = retrievalPack?.resolvedDocId ?? null;
      if (resolvedDocId && resolvedDocId !== lastDocumentId) {
        prisma.conversation
          .update({
            where: { id: conversationId },
            data: { lastDocumentId: resolvedDocId },
          })
          .catch(() => {}); // fire-and-forget, non-blocking
      }

      this.traceWriter.endSpan(traceId, retrievalSpanId, {
        status: "ok",
        metadata: {
          evidenceItems: retrievalPack?.evidence.length ?? 0,
          uniqueDocs: retrievalPack?.stats.uniqueDocsInEvidence ?? 0,
          candidates: retrievalPack?.stats.candidatesConsidered ?? 0,
          topScore: retrievalPack?.stats.topScore ?? null,
        },
      });

      const evidenceGateSpanId = this.traceWriter.startSpan(
        traceId,
        "evidence_gate",
      );
      evidenceGateDecision = this.evaluateEvidenceGateDecision(
        req,
        retrievalPack,
      );
      answerMode = this.resolveAnswerMode(req, retrievalPack);
      this.traceWriter.endSpan(traceId, evidenceGateSpanId, {
        status: "ok",
        metadata: {
          action: evidenceGateDecision?.suggestedAction ?? "answer",
          strength: evidenceGateDecision?.evidenceStrength ?? "none",
          missingEvidenceCount:
            evidenceGateDecision?.missingEvidence.length ?? 0,
        },
      });
      const answerClass: AnswerClass =
        answerMode === "general_answer" ? "GENERAL" : "DOCUMENT";
      const navType: NavType = null;

      const sourceButtonsAttachment = this.buildSourceButtonsAttachment(
        retrievalPack,
        req.preferredLanguage,
      );
      const sources: ChatSourceEntry[] = buildSourcesFromEvidence(
        retrievalPack?.evidence ?? [],
      );
      const bypass = this.resolveEvidenceGateBypass(
        evidenceGateDecision,
        req.preferredLanguage,
        {
          attachedDocumentIds: req.attachedDocumentIds,
          evidenceCount: retrievalPack?.evidence.length ?? 0,
        },
      );
      if (bypass) {
        const assistantMessage = await this.createMessage({
          conversationId,
          role: "assistant",
          content: bypass.text,
          userId: req.userId,
          attachments: sourceButtonsAttachment,
          telemetry: null,
          metadata: {
            sources,
            answerMode,
            answerClass,
            navType,
            fallbackReasonCode: bypass.failureCode,
            evidenceGate: {
              action: evidenceGateDecision?.suggestedAction ?? "unknown",
              strength: evidenceGateDecision?.evidenceStrength ?? "none",
            },
          },
        });
        const result: ChatResult = {
          conversationId,
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
          traceId,
          assistantText: bypass.text,
          attachmentsPayload: sourceButtonsAttachment,
          assistantTelemetry: undefined,
          sources: [...sources],
          followups: [],
          answerMode,
          answerClass,
          navType,
          fallbackReasonCode: bypass.failureCode,
          status: "partial",
          failureCode: bypass.failureCode,
          completion: {
            answered: false,
            missingSlots: [],
            nextAction: null,
          },
          truncation: {
            occurred: false,
            reason: null,
            resumeToken: null,
            providerOccurred: false,
            providerReason: null,
            detectorVersion: SEMANTIC_TRUNCATION_DETECTOR_VERSION,
          },
          evidence: {
            required: (req.attachedDocumentIds || []).length > 0,
            provided: sources.length > 0,
            sourceIds: sources.map((s) => s.documentId),
          },
        };
        await this.persistTraceArtifacts({
          traceId,
          req,
          conversationId,
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
          retrievalPack,
          evidenceGateDecision,
          answerMode,
          status: result.status,
          failureCode: result.failureCode,
          fallbackReasonCode: result.fallbackReasonCode,
          assistantText: result.assistantText,
          telemetry: null,
          totalMs: Date.now() - turnStartedAt,
          retrievalMs,
          llmMs,
          stream: false,
          truncation: result.truncation,
        }).catch((error) => {
          appLogger.warn("[trace-writer] failed to persist bypass trace", {
            traceId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
        return result;
      }

      const messages = this.buildEngineMessages(
        history,
        req.message,
        req.preferredLanguage,
        evidenceGateDecision,
      );
      const composeSpanId = this.traceWriter.startSpan(traceId, "compose");
      const llmStartedAt = Date.now();
      const generated = await this.engine.generate({
        traceId,
        userId: req.userId,
        conversationId,
        messages,
        evidencePack: toEngineEvidencePack(retrievalPack),
        context: this.buildRuntimeContext(req, retrievalPack),
        meta: this.buildRuntimeMeta(
          req,
          retrievalPack,
          answerMode,
          evidenceGateDecision,
        ),
      });
      llmMs = Date.now() - llmStartedAt;
      this.traceWriter.endSpan(traceId, composeSpanId, {
        status: "ok",
        metadata: {
          finishReason: String(
            ((generated.telemetry as Record<string, unknown>) || {})
              .finishReason || "unknown",
          ),
          model: String(
            ((generated.telemetry as Record<string, unknown>) || {}).model ||
              "",
          ),
        },
      });

      const assistantTextRaw = String(generated.text || "").trim();
      const fallbackReasonCode = this.resolveFallbackReasonCode(
        req,
        retrievalPack,
      );
      const assistantTextBase =
        assistantTextRaw ||
        buildEmptyAssistantText({
          language: req.preferredLanguage,
          reasonCode: fallbackReasonCode,
          seed: `${conversationId}:chat:${fallbackReasonCode || "empty_model_response"}`,
        });
      const assistantTextWithGate = this.applyEvidenceGatePostProcessText(
        assistantTextBase,
        evidenceGateDecision,
      );

      // Finalize turn: quality gates + enforcer + followups + truncation recovery
      const qualitySpanId = this.traceWriter.startSpan(
        traceId,
        "quality_gates",
      );
      const finalized = await this.finalizeChatTurn({
        assistantText: assistantTextWithGate,
        req,
        answerMode,
        answerClass,
        retrievalPack,
        sources,
        telemetry: (generated.telemetry as Record<string, unknown>) ?? null,
      });
      this.traceWriter.endSpan(traceId, qualitySpanId, {
        status: "ok",
        metadata: {
          followups: finalized.followups.length,
          failureCode: finalized.failureCode ?? null,
        },
      });

      const enforceScopedSources = isDocGroundedAnswerMode(answerMode);
      let assistantText = finalized.assistantText;
      const filteredSources = filterSourcesByProvenance(
        sources,
        finalized.provenance,
        assistantText,
        retrievalPack?.evidence ?? [],
        { enforceScopedSources },
      );
      const filteredAttachment = filterAttachmentByProvenance(
        sourceButtonsAttachment,
        finalized.provenance,
        assistantText,
        retrievalPack?.evidence ?? [],
        { enforceScopedSources },
      );
      const attachmentsPayload = mergeAttachments(
        generated.attachmentsPayload,
        filteredAttachment,
      );
      const sourceInvariantFailureCode = resolveSourceInvariantFailureCode({
        answerMode,
        filteredSources,
      });
      if (sourceInvariantFailureCode) {
        assistantText = buildEmptyAssistantText({
          language: req.preferredLanguage,
          reasonCode: sourceInvariantFailureCode,
          seed: `${req.userId}:sources:${sourceInvariantFailureCode}`,
        });
      }

      const outputSpanId = this.traceWriter.startSpan(
        traceId,
        "output_contract",
      );
      const assistantMessage = await this.createMessage({
        conversationId,
        role: "assistant",
        content: assistantText,
        userId: req.userId,
        attachments: attachmentsPayload,
        telemetry: generated.telemetry ?? null,
        metadata: {
          sources: filteredSources,
          answerMode,
          answerClass,
          navType,
          fallbackReasonCode,
          evidenceGate: evidenceGateDecision
            ? {
                action: evidenceGateDecision.suggestedAction,
                strength: evidenceGateDecision.evidenceStrength,
              }
            : null,
          enforcement: finalized.enforcement ?? null,
          provenance: finalized.provenance ?? null,
        },
      });
      this.traceWriter.endSpan(traceId, outputSpanId, {
        status: "ok",
        metadata: {
          assistantMessageId: assistantMessage.id,
          answerLength: assistantText.length,
        },
      });

      const resolvedTruncation = resolveTruncationState({
        telemetry: (generated.telemetry as Record<string, unknown>) ?? null,
        finalText: assistantText,
        enforcementRepairs: finalized.enforcement?.repairs || [],
      });
      const truncation = {
        occurred: resolvedTruncation.contractOccurred,
        reason: resolvedTruncation.contractReason,
        resumeToken: null,
        providerOccurred: resolvedTruncation.providerOccurred,
        providerReason: resolvedTruncation.providerReason,
        detectorVersion: resolvedTruncation.detectorVersion,
      };
      const status =
        finalized.failureCode || sourceInvariantFailureCode || !assistantTextRaw
          ? "partial"
          : "success";
      const failureCode =
        finalized.failureCode ||
        sourceInvariantFailureCode ||
        (assistantTextRaw ? null : "EMPTY_MODEL_RESPONSE");

      const result: ChatResult = {
        conversationId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        traceId,
        assistantText,
        attachmentsPayload,
        assistantTelemetry:
          (generated.telemetry as Record<string, unknown>) ?? undefined,
        provenance: finalized.provenance,
        sources: [...filteredSources],
        followups: finalized.followups,
        answerMode,
        answerClass,
        navType,
        fallbackReasonCode,
        status,
        failureCode,
        completion: {
          answered: assistantTextRaw.length > 0,
          missingSlots: [],
          nextAction: null,
        },
        truncation,
        evidence: {
          required: (req.attachedDocumentIds || []).length > 0,
          provided: filteredSources.length > 0,
          sourceIds: filteredSources.map((s) => s.documentId),
        },
      };
      await this.persistTraceArtifacts({
        traceId,
        req,
        conversationId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        retrievalPack,
        evidenceGateDecision,
        answerMode,
        status,
        failureCode,
        fallbackReasonCode,
        assistantText,
        telemetry: (generated.telemetry as Record<string, unknown>) ?? null,
        totalMs: Date.now() - turnStartedAt,
        retrievalMs,
        llmMs,
        stream: false,
        enforcement: finalized.enforcement ?? null,
        enforcementBlocked: Boolean(finalized.failureCode),
        enforcementReasonCode: finalized.failureCode ?? null,
        provenance: finalized.provenance ?? null,
        truncation,
      }).catch((error) => {
        appLogger.warn("[trace-writer] failed to persist chat trace", {
          traceId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      return result;
    } catch (error) {
      if (!isRuntimePolicyFailure(error)) {
        await this.persistTraceArtifacts({
          traceId,
          req,
          conversationId: conversationId || String(req.conversationId || ""),
          userMessageId: userMessage?.id || null,
          assistantMessageId: null,
          retrievalPack,
          evidenceGateDecision,
          answerMode,
          status: "failed",
          failureCode: "CHAT_RUNTIME_ERROR",
          fallbackReasonCode: undefined,
          assistantText: "",
          telemetry: null,
          totalMs: Date.now() - turnStartedAt,
          retrievalMs,
          llmMs,
          stream: false,
        }).catch((persistError) => {
          appLogger.warn("[trace-writer] failed to persist crash trace", {
            traceId,
            error:
              persistError instanceof Error
                ? persistError.message
                : String(persistError),
          });
        });
        throw error;
      }
      const runtimePolicyResult = await this.buildRuntimePolicyFailureResult({
        req,
        conversationId,
        userMessage,
        code: toRuntimePolicyErrorCode(error),
      });
      const result: ChatResult = { ...runtimePolicyResult, traceId };
      await this.persistTraceArtifacts({
        traceId,
        req,
        conversationId: result.conversationId,
        userMessageId: result.userMessageId,
        assistantMessageId: result.assistantMessageId,
        retrievalPack,
        evidenceGateDecision,
        answerMode: result.answerMode || answerMode,
        status: result.status || "failed",
        failureCode: result.failureCode || null,
        fallbackReasonCode: result.fallbackReasonCode,
        assistantText: result.assistantText,
        telemetry: null,
        totalMs: Date.now() - turnStartedAt,
        retrievalMs,
        llmMs,
        stream: false,
      }).catch((persistError) => {
        appLogger.warn(
          "[trace-writer] failed to persist runtime-policy trace",
          {
            traceId,
            error:
              persistError instanceof Error
                ? persistError.message
                : String(persistError),
          },
        );
      });
      return result;
    }
  }

  async streamChat(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult> {
    const { req, sink, streamingConfig } = params;
    const traceId = this.resolveTraceId(req);
    const turnStartedAt = Date.now();
    const inputSpanId = this.traceWriter.startSpan(
      traceId,
      "input_normalization",
      {
        hasConversationId: Boolean(req.conversationId),
        stream: true,
      },
    );
    let conversationId = "";
    let lastDocumentId: string | null = null;
    let userMessage: ChatMessageDTO | null = null;
    let retrievalPack:
      | (EvidencePack & { resolvedDocId?: string | null })
      | null = null;
    let evidenceGateDecision: EvidenceCheckResult | null = null;
    let answerMode: AnswerMode =
      (req.attachedDocumentIds || []).length > 0
        ? "help_steps"
        : "general_answer";
    let retrievalMs: number | null = null;
    let llmMs: number | null = null;
    try {
      const conv = await this.ensureConversation(
        req.userId,
        req.conversationId,
      );
      conversationId = conv.id;
      lastDocumentId = conv.lastDocumentId;

      userMessage = await this.createMessage({
        conversationId,
        role: "user",
        content: req.message,
        userId: req.userId,
      });

      if (sink.isOpen()) {
        sink.write({
          event: "progress",
          data: {
            stage: "retrieval",
            message: "Retrieving evidence",
            t: Date.now(),
          },
        });
      }

      const history = await this.loadRecentForEngine(
        conversationId,
        this.resolveRecentContextLimit(),
        req.userId,
        req.message,
      );
      this.traceWriter.endSpan(traceId, inputSpanId, {
        status: "ok",
        metadata: {
          conversationId,
          userMessageId: userMessage.id,
          historyMessages: history.length,
        },
      });

      const retrievalSpanId = this.traceWriter.startSpan(traceId, "retrieval", {
        stream: true,
      });
      const retrievalStartedAt = Date.now();
      retrievalPack = await this.retrieveEvidence(req, lastDocumentId);
      retrievalMs = Date.now() - retrievalStartedAt;

      // Persist resolved doc for conversation-history follow-up scoping
      const resolvedDocId = retrievalPack?.resolvedDocId ?? null;
      if (resolvedDocId && resolvedDocId !== lastDocumentId) {
        prisma.conversation
          .update({
            where: { id: conversationId },
            data: { lastDocumentId: resolvedDocId },
          })
          .catch(() => {}); // fire-and-forget, non-blocking
      }

      this.traceWriter.endSpan(traceId, retrievalSpanId, {
        status: "ok",
        metadata: {
          evidenceItems: retrievalPack?.evidence.length ?? 0,
          uniqueDocs: retrievalPack?.stats.uniqueDocsInEvidence ?? 0,
          candidates: retrievalPack?.stats.candidatesConsidered ?? 0,
          topScore: retrievalPack?.stats.topScore ?? null,
        },
      });

      const evidenceGateSpanId = this.traceWriter.startSpan(
        traceId,
        "evidence_gate",
        { stream: true },
      );
      evidenceGateDecision = this.evaluateEvidenceGateDecision(
        req,
        retrievalPack,
      );
      answerMode = this.resolveAnswerMode(req, retrievalPack);
      this.traceWriter.endSpan(traceId, evidenceGateSpanId, {
        status: "ok",
        metadata: {
          action: evidenceGateDecision?.suggestedAction ?? "answer",
          strength: evidenceGateDecision?.evidenceStrength ?? "none",
          missingEvidenceCount:
            evidenceGateDecision?.missingEvidence.length ?? 0,
        },
      });
      const answerClass: AnswerClass =
        answerMode === "general_answer" ? "GENERAL" : "DOCUMENT";
      const navType: NavType = null;

      const sourceButtonsAttachment = this.buildSourceButtonsAttachment(
        retrievalPack,
        req.preferredLanguage,
      );
      const sources: ChatSourceEntry[] = buildSourcesFromEvidence(
        retrievalPack?.evidence ?? [],
      );
      const bypass = this.resolveEvidenceGateBypass(
        evidenceGateDecision,
        req.preferredLanguage,
        {
          attachedDocumentIds: req.attachedDocumentIds,
          evidenceCount: retrievalPack?.evidence.length ?? 0,
        },
      );
      if (bypass) {
        if (sink.isOpen()) {
          sink.write({
            event: "progress",
            data: {
              stage: "validation",
              message: "Evidence policy requested clarification",
              t: Date.now(),
            },
          });
        }
        const assistantMessage = await this.createMessage({
          conversationId,
          role: "assistant",
          content: bypass.text,
          userId: req.userId,
          attachments: sourceButtonsAttachment,
          telemetry: null,
          metadata: {
            sources,
            answerMode,
            answerClass,
            navType,
            fallbackReasonCode: bypass.failureCode,
            evidenceGate: {
              action: evidenceGateDecision?.suggestedAction ?? "unknown",
              strength: evidenceGateDecision?.evidenceStrength ?? "none",
            },
          },
        });
        const result: ChatResult = {
          conversationId,
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
          traceId,
          assistantText: bypass.text,
          attachmentsPayload: sourceButtonsAttachment,
          assistantTelemetry: undefined,
          sources: [...sources],
          followups: [],
          answerMode,
          answerClass,
          navType,
          fallbackReasonCode: bypass.failureCode,
          status: "partial",
          failureCode: bypass.failureCode,
          completion: {
            answered: false,
            missingSlots: [],
            nextAction: null,
          },
          truncation: {
            occurred: false,
            reason: null,
            resumeToken: null,
            providerOccurred: false,
            providerReason: null,
            detectorVersion: SEMANTIC_TRUNCATION_DETECTOR_VERSION,
          },
          evidence: {
            required: (req.attachedDocumentIds || []).length > 0,
            provided: sources.length > 0,
            sourceIds: sources.map((s) => s.documentId),
          },
        };
        await this.persistTraceArtifacts({
          traceId,
          req,
          conversationId,
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
          retrievalPack,
          evidenceGateDecision,
          answerMode,
          status: result.status,
          failureCode: result.failureCode,
          fallbackReasonCode: result.fallbackReasonCode,
          assistantText: result.assistantText,
          telemetry: null,
          totalMs: Date.now() - turnStartedAt,
          retrievalMs,
          llmMs,
          stream: true,
          truncation: result.truncation,
        }).catch((error) => {
          appLogger.warn(
            "[trace-writer] failed to persist stream bypass trace",
            {
              traceId,
              error: error instanceof Error ? error.message : String(error),
            },
          );
        });
        return result;
      }

      const messages = this.buildEngineMessages(
        history,
        req.message,
        req.preferredLanguage,
        evidenceGateDecision,
      );

      if (sink.isOpen() && sources.length > 0) {
        sink.write({
          event: "progress",
          data: {
            stage: "compose",
            message: "Composing answer with grounded sources",
            t: Date.now(),
          },
        });
        sink.write({
          event: "worklog",
          data: {
            eventType: "STEP_ADD",
            label: `Grounded in ${sources.length} source${sources.length === 1 ? "" : "s"}`,
            t: Date.now(),
          },
        } as any);
      }

      const streamSpanId = this.traceWriter.startSpan(traceId, "stream");
      const llmStartedAt = Date.now();
      const streamed = await this.engine.stream({
        traceId,
        userId: req.userId,
        conversationId,
        messages,
        evidencePack: toEngineEvidencePack(retrievalPack),
        context: this.buildRuntimeContext(req, retrievalPack),
        meta: this.buildRuntimeMeta(
          req,
          retrievalPack,
          answerMode,
          evidenceGateDecision,
        ),
        sink,
        streamingConfig,
      });
      llmMs = Date.now() - llmStartedAt;
      this.traceWriter.endSpan(traceId, streamSpanId, {
        status: "ok",
        metadata: {
          finishReason: String(
            ((streamed.telemetry as Record<string, unknown>) || {})
              .finishReason || "unknown",
          ),
          model: String(
            ((streamed.telemetry as Record<string, unknown>) || {}).model || "",
          ),
        },
      });

      const assistantTextRaw = String(streamed.finalText || "").trim();
      const fallbackReasonCode = this.resolveFallbackReasonCode(
        req,
        retrievalPack,
      );
      const assistantTextBase =
        assistantTextRaw ||
        buildEmptyAssistantText({
          language: req.preferredLanguage,
          reasonCode: fallbackReasonCode,
          seed: `${conversationId}:stream:${fallbackReasonCode || "empty_model_response"}`,
        });
      const assistantTextWithGate = this.applyEvidenceGatePostProcessText(
        assistantTextBase,
        evidenceGateDecision,
      );

      // Finalize turn: quality gates + enforcer + followups + truncation recovery
      const qualitySpanId = this.traceWriter.startSpan(
        traceId,
        "quality_gates",
        {
          stream: true,
        },
      );
      const finalized = await this.finalizeChatTurn({
        assistantText: assistantTextWithGate,
        req,
        answerMode,
        answerClass,
        retrievalPack,
        sources,
        telemetry: (streamed.telemetry as Record<string, unknown>) ?? null,
      });
      this.traceWriter.endSpan(traceId, qualitySpanId, {
        status: "ok",
        metadata: {
          followups: finalized.followups.length,
          failureCode: finalized.failureCode ?? null,
        },
      });

      const enforceScopedSources = isDocGroundedAnswerMode(answerMode);
      let assistantText = finalized.assistantText;
      const filteredSources = filterSourcesByProvenance(
        sources,
        finalized.provenance,
        assistantText,
        retrievalPack?.evidence ?? [],
        { enforceScopedSources },
      );
      const filteredAttachment = filterAttachmentByProvenance(
        sourceButtonsAttachment,
        finalized.provenance,
        assistantText,
        retrievalPack?.evidence ?? [],
        { enforceScopedSources },
      );
      const attachmentsPayload = mergeAttachments(
        streamed.attachmentsPayload,
        filteredAttachment,
      );
      const sourceInvariantFailureCode = resolveSourceInvariantFailureCode({
        answerMode,
        filteredSources,
      });
      if (sourceInvariantFailureCode) {
        assistantText = buildEmptyAssistantText({
          language: req.preferredLanguage,
          reasonCode: sourceInvariantFailureCode,
          seed: `${req.userId}:sources:${sourceInvariantFailureCode}`,
        });
      }

      const outputSpanId = this.traceWriter.startSpan(
        traceId,
        "output_contract",
        {
          stream: true,
        },
      );
      const assistantMessage = await this.createMessage({
        conversationId,
        role: "assistant",
        content: assistantText,
        userId: req.userId,
        attachments: attachmentsPayload,
        telemetry: streamed.telemetry ?? null,
        metadata: {
          sources: filteredSources,
          answerMode,
          answerClass,
          navType,
          fallbackReasonCode,
          evidenceGate: evidenceGateDecision
            ? {
                action: evidenceGateDecision.suggestedAction,
                strength: evidenceGateDecision.evidenceStrength,
              }
            : null,
          enforcement: finalized.enforcement ?? null,
          provenance: finalized.provenance ?? null,
        },
      });
      this.traceWriter.endSpan(traceId, outputSpanId, {
        status: "ok",
        metadata: {
          assistantMessageId: assistantMessage.id,
          answerLength: assistantText.length,
        },
      });

      const resolvedTruncation = resolveTruncationState({
        telemetry: (streamed.telemetry as Record<string, unknown>) ?? null,
        finalText: assistantText,
        enforcementRepairs: finalized.enforcement?.repairs || [],
      });
      const truncation = {
        occurred: resolvedTruncation.contractOccurred,
        reason: resolvedTruncation.contractReason,
        resumeToken: null,
        providerOccurred: resolvedTruncation.providerOccurred,
        providerReason: resolvedTruncation.providerReason,
        detectorVersion: resolvedTruncation.detectorVersion,
      };
      const status =
        finalized.failureCode || sourceInvariantFailureCode || !assistantTextRaw
          ? "partial"
          : "success";
      const failureCode =
        finalized.failureCode ||
        sourceInvariantFailureCode ||
        (assistantTextRaw ? null : "EMPTY_MODEL_RESPONSE");

      const result: ChatResult = {
        conversationId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        traceId,
        assistantText,
        attachmentsPayload,
        assistantTelemetry:
          (streamed.telemetry as Record<string, unknown>) ?? undefined,
        provenance: finalized.provenance,
        sources: [...filteredSources],
        followups: finalized.followups,
        answerMode,
        answerClass,
        navType,
        fallbackReasonCode,
        status,
        failureCode,
        completion: {
          answered: assistantTextRaw.length > 0,
          missingSlots: [],
          nextAction: null,
        },
        truncation,
        evidence: {
          required: (req.attachedDocumentIds || []).length > 0,
          provided: filteredSources.length > 0,
          sourceIds: filteredSources.map((s) => s.documentId),
        },
      };
      await this.persistTraceArtifacts({
        traceId,
        req,
        conversationId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        retrievalPack,
        evidenceGateDecision,
        answerMode,
        status,
        failureCode,
        fallbackReasonCode,
        assistantText,
        telemetry: (streamed.telemetry as Record<string, unknown>) ?? null,
        totalMs: Date.now() - turnStartedAt,
        retrievalMs,
        llmMs,
        stream: true,
        enforcement: finalized.enforcement ?? null,
        enforcementBlocked: Boolean(finalized.failureCode),
        enforcementReasonCode: finalized.failureCode ?? null,
        provenance: finalized.provenance ?? null,
        truncation,
      }).catch((error) => {
        appLogger.warn("[trace-writer] failed to persist stream trace", {
          traceId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      return result;
    } catch (error) {
      if (!isRuntimePolicyFailure(error)) {
        await this.persistTraceArtifacts({
          traceId,
          req,
          conversationId: conversationId || String(req.conversationId || ""),
          userMessageId: userMessage?.id || null,
          assistantMessageId: null,
          retrievalPack,
          evidenceGateDecision,
          answerMode,
          status: "failed",
          failureCode: "CHAT_STREAM_RUNTIME_ERROR",
          fallbackReasonCode: undefined,
          assistantText: "",
          telemetry: null,
          totalMs: Date.now() - turnStartedAt,
          retrievalMs,
          llmMs,
          stream: true,
        }).catch((persistError) => {
          appLogger.warn(
            "[trace-writer] failed to persist stream crash trace",
            {
              traceId,
              error:
                persistError instanceof Error
                  ? persistError.message
                  : String(persistError),
            },
          );
        });
        throw error;
      }
      if (sink.isOpen()) {
        sink.write({
          event: "worklog",
          data: {
            eventType: "RUN_ERROR",
            summary: "Runtime policy configuration error",
            t: Date.now(),
          },
        } as any);
      }
      const runtimePolicyResult = await this.buildRuntimePolicyFailureResult({
        req,
        conversationId,
        userMessage,
        code: toRuntimePolicyErrorCode(error),
      });
      const result: ChatResult = { ...runtimePolicyResult, traceId };
      await this.persistTraceArtifacts({
        traceId,
        req,
        conversationId: result.conversationId,
        userMessageId: result.userMessageId,
        assistantMessageId: result.assistantMessageId,
        retrievalPack,
        evidenceGateDecision,
        answerMode: result.answerMode || answerMode,
        status: result.status || "failed",
        failureCode: result.failureCode || null,
        fallbackReasonCode: result.fallbackReasonCode,
        assistantText: result.assistantText,
        telemetry: null,
        totalMs: Date.now() - turnStartedAt,
        retrievalMs,
        llmMs,
        stream: true,
      }).catch((persistError) => {
        appLogger.warn(
          "[trace-writer] failed to persist stream runtime-policy trace",
          {
            traceId,
            error:
              persistError instanceof Error
                ? persistError.message
                : String(persistError),
          },
        );
      });
      return result;
    }
  }

  async createConversation(params: {
    userId: string;
    title?: string;
  }): Promise<ConversationDTO> {
    const now = new Date();
    const rawTitle = String(params.title ?? "New Chat");
    const lowered = rawTitle.toLowerCase();
    const contextType = lowered.startsWith("__viewer__:")
      ? "viewer"
      : lowered.startsWith("__editor__:")
        ? "editor"
        : null;

    const created = await prisma.conversation.create({
      data: {
        userId: params.userId,
        title: rawTitle,
        createdAt: now,
        updatedAt: now,
        ...(contextType ? { contextType } : {}),
      },
    });

    return toConversationDTO(created);
  }

  async listConversations(
    userId: string,
    opts: ConversationListOptions = {},
  ): Promise<ConversationDTO[]> {
    const limit = clampLimit(opts.limit, 50);

    const rows = await prisma.conversation.findMany({
      where: {
        userId,
        isDeleted: false,
        NOT: {
          OR: [
            { contextType: { in: ["viewer", "editor"] } },
            { title: { startsWith: "__viewer__:" } },
            { title: { startsWith: "__editor__:" } },
          ],
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });

    return rows.map(toConversationDTO);
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationDTO | null> {
    const row = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
    });
    return row ? toConversationDTO(row) : null;
  }

  async getConversationWithMessages(
    userId: string,
    conversationId: string,
    opts: ConversationMessagesOptions = {},
  ): Promise<ConversationWithMessagesDTO | null> {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
    });
    if (!conv) return null;

    const limit = clampLimit(opts.limit, 200);

    if (this.encryptedRepo) {
      const decrypted = await this.encryptedRepo.listMessagesDecrypted(
        userId,
        conversationId,
        limit,
      );
      const ordered =
        opts.order === "desc" ? [...decrypted].reverse() : decrypted;
      return {
        ...toConversationDTO(conv),
        messages: ordered.map((message) =>
          toMessageDTO({
            id: message.id,
            role: String(message.role),
            content: message.content,
            createdAt: message.createdAt,
            updatedAt: message.createdAt,
            metadata: message.metadata ?? null,
          }),
        ),
      };
    }

    const rows = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: opts.order === "desc" ? "desc" : "asc" },
      take: limit,
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
        metadata: true,
      },
    });

    return {
      ...toConversationDTO(conv),
      messages: rows.map(toMessageDTO),
    };
  }

  async updateTitle(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<ConversationDTO | null> {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!conv) return null;

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: { title, updatedAt: new Date() },
    });
    return toConversationDTO(updated);
  }

  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ ok: boolean }> {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!conv) return { ok: false };

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    return { ok: true };
  }

  async deleteAllConversations(
    userId: string,
  ): Promise<{ ok: boolean; deleted: number }> {
    const result = await prisma.conversation.updateMany({
      where: { userId, isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    return { ok: true, deleted: result.count };
  }

  async listMessages(
    userId: string,
    conversationId: string,
    opts: ConversationMessagesOptions = {},
  ): Promise<ChatMessageDTO[]> {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!conv) return [];

    const limit = clampLimit(opts.limit, 200);
    if (this.encryptedRepo) {
      const decrypted = await this.encryptedRepo.listMessagesDecrypted(
        userId,
        conversationId,
        limit,
      );
      const ordered =
        opts.order === "desc" ? [...decrypted].reverse() : decrypted;
      return ordered.map((message) =>
        toMessageDTO({
          id: message.id,
          role: String(message.role),
          content: message.content,
          createdAt: message.createdAt,
          updatedAt: message.createdAt,
          metadata: message.metadata ?? null,
        }),
      );
    }

    const rows = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: opts.order === "desc" ? "desc" : "asc" },
      take: limit,
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
        metadata: true,
      },
    });
    return rows.map(toMessageDTO);
  }

  async createMessage(params: CreateMessageParams): Promise<ChatMessageDTO> {
    const now = new Date();
    const mergedMetadata: Record<string, unknown> = {
      ...(params.metadata || {}),
    };

    if (params.attachments !== undefined) {
      mergedMetadata.attachments = params.attachments;
    }
    if (params.telemetry !== undefined) {
      mergedMetadata.telemetry = params.telemetry;
    }

    const metadataJson =
      Object.keys(mergedMetadata).length > 0
        ? JSON.stringify(mergedMetadata)
        : null;

    if (this.encryptedRepo && params.userId) {
      const saved = await this.encryptedRepo.saveMessage(
        params.userId,
        params.conversationId,
        params.role,
        params.content ?? "",
      );

      if (metadataJson) {
        await prisma.message.update({
          where: { id: saved.id },
          data: { metadata: metadataJson },
        });
      }

      await prisma.conversation.update({
        where: { id: params.conversationId },
        data: { updatedAt: now },
      });

      try {
        await this.recordConversationMemoryArtifacts({
          messageId: saved.id,
          conversationId: params.conversationId,
          userId: params.userId,
          role: params.role,
          content: params.content ?? "",
          metadata: mergedMetadata,
          createdAt: now,
        });
      } catch {
        // Non-fatal: persistence succeeded even if memory artifact sync fails.
      }

      return {
        id: saved.id,
        role: saved.role as ChatRole,
        content: params.content ?? "",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        attachments: (mergedMetadata.attachments as unknown) ?? null,
        telemetry:
          (mergedMetadata.telemetry as Record<string, unknown>) ?? null,
        metadata: mergedMetadata,
      };
    }

    const created = await prisma.message.create({
      data: {
        conversationId: params.conversationId,
        role: params.role,
        content: params.content ?? "",
        createdAt: now,
        ...(metadataJson ? { metadata: metadataJson } : {}),
      },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
        metadata: true,
      },
    });

    await prisma.conversation.update({
      where: { id: params.conversationId },
      data: { updatedAt: now },
    });

    try {
      await this.recordConversationMemoryArtifacts({
        messageId: created.id,
        conversationId: params.conversationId,
        userId: params.userId,
        role: params.role,
        content: params.content ?? "",
        metadata: mergedMetadata,
        createdAt: now,
      });
    } catch {
      // Non-fatal: persistence succeeded even if memory artifact sync fails.
    }

    return toMessageDTO(created);
  }

  /**
   * Sentence-boundary recovery: if the LLM was truncated mid-word/sentence
   * (finish_reason === "length"), trim to the last complete sentence.
   */
  private applySentenceBoundaryRecovery(
    text: string,
    telemetry?: Record<string, unknown> | null,
  ): string {
    const finishReason = normalizeFinishReason(
      telemetry && typeof telemetry === "object"
        ? telemetry.finishReason
        : null,
    );
    const truncatedReasons = new Set([
      "length",
      "max_tokens",
      "max_output_tokens",
    ]);
    if (!truncatedReasons.has(finishReason)) return text;
    // Find last sentence boundary
    const lastPeriod = Math.max(
      text.lastIndexOf("."),
      text.lastIndexOf("!"),
      text.lastIndexOf("?"),
      text.lastIndexOf("。"),
    );
    if (lastPeriod > text.length * 0.3) {
      return text.slice(0, lastPeriod + 1).trim();
    }
    // If no good boundary found, keep as-is rather than making it worse
    return text;
  }

  /**
   * When provider overflow cuts a markdown table mid-structure, replace the
   * broken scaffold with a complete short sentence so the user never receives
   * a dangling header-only table.
   */
  private repairProviderOverflowStructuredOutput(
    text: string,
    telemetry?: Record<string, unknown> | null,
    preferredLanguage?: string | null,
  ): string {
    const finishReason = normalizeFinishReason(
      telemetry && typeof telemetry === "object"
        ? telemetry.finishReason
        : null,
    );
    const overflow = new Set(["length", "max_tokens", "max_output_tokens"]);
    if (!overflow.has(finishReason)) return text;

    const value = String(text || "").trim();
    if (!value) return text;

    const lines = value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const semantic = classifyVisibleTruncation({
      finalText: value,
      enforcementRepairs: [],
      providerTruncation: { occurred: true, reason: finishReason },
    });
    if (!semantic.occurred) return text;

    const tableLines = lines.filter((line) => line.includes("|"));
    if (!tableLines.length) {
      const lang = normalizeChatLanguage(preferredLanguage);
      if (lang === "pt") {
        return "A resposta foi interrompida antes de concluir. Posso reenviar em bullets para garantir completude.";
      }
      if (lang === "es") {
        return "La respuesta se interrumpió antes de terminar. Puedo reenviarla en viñetas para garantizar completitud.";
      }
      return "The response was interrupted before completion. I can resend it as bullets to guarantee completeness.";
    }

    const separatorOnly = (line: string): boolean =>
      /^[:\-\|\s]+$/.test(line.replace(/\|/g, ""));
    const contentRows = tableLines.filter((line) => !separatorOnly(line));
    const incompleteTable =
      contentRows.length <= 1 || /\|\s*$/.test(value) || lines.length < 3;
    if (!incompleteTable) {
      const lang = normalizeChatLanguage(preferredLanguage);
      if (lang === "pt") {
        return "A resposta foi interrompida antes de concluir. Posso reenviar em bullets para garantir completude.";
      }
      if (lang === "es") {
        return "La respuesta se interrumpió antes de terminar. Puedo reenviarla en viñetas para garantizar completitud.";
      }
      return "The response was interrupted before completion. I can resend it as bullets to guarantee completeness.";
    }

    const lang = normalizeChatLanguage(preferredLanguage);
    const narrative = lines
      .filter((line) => !line.includes("|"))
      .join(" ")
      .trim();
    const fallback =
      lang === "pt"
        ? "A tabela foi interrompida antes de concluir. Posso reenviar em bullets para evitar corte."
        : lang === "es"
          ? "La tabla se interrumpió antes de terminar. Puedo reenviarla en viñetas para evitar cortes."
          : "The table was cut before completion. I can resend it as bullets to avoid truncation.";

    const base = narrative || fallback;
    const punctuated = /[.!?]$/.test(base) ? base : `${base}.`;
    return punctuated;
  }

  /**
   * Generate bank-driven followup suggestions for doc-grounded answers.
   */
  private generateFollowups(
    req: ChatRequest,
    answerMode: AnswerMode,
    retrievalPack: EvidencePack | null,
  ): Array<{ label: string; query: string }> {
    const isDocGrounded =
      answerMode === "doc_grounded_single" ||
      answerMode === "doc_grounded_multi" ||
      answerMode === "doc_grounded_quote" ||
      answerMode === "doc_grounded_table";

    if (!isDocGrounded || !retrievalPack) return [];

    const lang = normalizeChatLanguage(req.preferredLanguage);
    const followups: Array<{ label: string; query: string }> = [];
    const evidenceCount = retrievalPack.evidence.length;
    const hasMultipleDocs =
      new Set(retrievalPack.evidence.map((e) => e.docId)).size > 1;

    // Extract key topic from query for contextual follow-ups
    const topicKeywords = this.extractQueryKeywords(req.message).slice(0, 3);
    const topic = topicKeywords.join(" ");

    // Always suggest a deeper-dive question
    if (lang === "pt") {
      followups.push({
        label: "Aprofundar",
        query: topic
          ? `Pode detalhar mais sobre ${topic}?`
          : "Pode detalhar mais sobre isso?",
      });
      if (hasMultipleDocs) {
        followups.push({
          label: "Comparar documentos",
          query: topic
            ? `Quais são as diferenças entre os documentos sobre ${topic}?`
            : "Quais são as diferenças entre os documentos sobre este tema?",
        });
      }
      if (evidenceCount >= 1) {
        followups.push({
          label: "Resumo",
          query: topic
            ? `Faça um resumo conciso sobre ${topic}.`
            : "Faça um resumo conciso dos pontos principais.",
        });
      }
    } else if (lang === "es") {
      followups.push({
        label: "Profundizar",
        query: topic
          ? `¿Puede dar más detalles sobre ${topic}?`
          : "¿Puede dar más detalles sobre esto?",
      });
      if (hasMultipleDocs) {
        followups.push({
          label: "Comparar documentos",
          query: topic
            ? `¿Cuáles son las diferencias entre los documentos sobre ${topic}?`
            : "¿Cuáles son las diferencias entre los documentos sobre este tema?",
        });
      }
    } else {
      followups.push({
        label: "More details",
        query: topic
          ? `Can you elaborate on ${topic}?`
          : "Can you elaborate on this?",
      });
      if (hasMultipleDocs) {
        followups.push({
          label: "Compare documents",
          query: topic
            ? `What are the differences between the documents on ${topic}?`
            : "What are the differences between the documents on this topic?",
        });
      }
      if (evidenceCount >= 1) {
        followups.push({
          label: "Summary",
          query: topic
            ? `Give me a concise summary about ${topic}.`
            : "Give me a concise summary of the key points.",
        });
      }
    }

    return followups.slice(0, 3);
  }

  /**
   * Unified turn finalization: runs quality gates, response contract enforcer,
   * generates followups, and applies sentence-boundary recovery.
   *
   * ALL return paths in chat() and streamChat() must funnel through this.
   */
  private async finalizeChatTurn(params: {
    assistantText: string;
    req: ChatRequest;
    answerMode: AnswerMode;
    answerClass: AnswerClass;
    retrievalPack: EvidencePack | null;
    sources: ChatSourceEntry[];
    telemetry?: Record<string, unknown> | null;
  }): Promise<{
    assistantText: string;
    followups: Array<{ label: string; query: string }>;
    enforcement?: { repairs: string[]; warnings: string[] };
    provenance?: ChatProvenanceDTO;
    failureCode?: string | null;
  }> {
    let text = params.assistantText;
    let failureCode: string | null = null;
    const sourceDocumentIdsFromSources = Array.from(
      new Set(
        (params.sources || [])
          .map((source) => String(source.documentId || "").trim())
          .filter(Boolean),
      ),
    );
    const requestedMaxOutputTokens = toPositiveInt(
      params.telemetry &&
        typeof params.telemetry === "object" &&
        "requestedMaxOutputTokens" in params.telemetry
        ? (params.telemetry as Record<string, unknown>).requestedMaxOutputTokens
        : null,
    );
    const observedOutputTokens = toPositiveInt(
      params.telemetry &&
        typeof params.telemetry === "object" &&
        (params.telemetry as Record<string, unknown>).usage &&
        typeof (params.telemetry as Record<string, unknown>).usage === "object"
        ? (
            (params.telemetry as Record<string, unknown>).usage as Record<
              string,
              unknown
            >
          ).outputTokens
        : null,
    );

    // 1. Sentence boundary recovery for truncated outputs
    text = this.applySentenceBoundaryRecovery(text, params.telemetry);
    const preEnforcerTrim = shouldApplyPreEnforcerTrim({
      telemetry: (params.telemetry as Record<string, unknown>) ?? null,
      finalText: text,
      requestedMaxOutputTokens,
    });
    if (preEnforcerTrim && requestedMaxOutputTokens) {
      const trimmed = trimTextToTokenBudget(text, requestedMaxOutputTokens, {
        preserveSentenceBoundary: true,
      });
      if (trimmed.truncated) {
        text = trimmed.text;
      }
    }

    let provenance = buildChatProvenance({
      answerText: text,
      answerMode: params.answerMode,
      answerClass: params.answerClass,
      retrievalPack: params.retrievalPack,
    });
    const provenanceValidation = validateChatProvenance({
      provenance,
      answerMode: params.answerMode,
      answerClass: params.answerClass,
      allowedDocumentIds: params.req.attachedDocumentIds || [],
    });
    provenance = {
      ...provenance,
      validated: provenanceValidation.ok,
      failureCode: provenanceValidation.failureCode,
      sourceDocumentIds:
        provenance.sourceDocumentIds.length > 0
          ? provenance.sourceDocumentIds
          : sourceDocumentIdsFromSources,
    };

    // 2. Run quality gates (format checks, brevity, markdown sanity)
    try {
      const qualityRunner = new QualityGateRunnerService();
      const gateCtx: QualityGateContext = {
        answerMode: params.answerMode,
        language: normalizeChatLanguage(params.req.preferredLanguage),
        evidenceItems: params.retrievalPack?.evidence.map((e) => ({
          snippet: e.snippet,
          docId: e.docId,
        })),
      };
      const gateResult = await qualityRunner.runGates(text, gateCtx);
      if (!gateResult.allPassed) {
        appLogger.debug("[finalizeChatTurn] Quality gate issues", {
          issues: gateResult.results
            .filter((r) => !r.passed)
            .map((r) => r.gateName),
        });
      }
    } catch (error) {
      appLogger.warn("[finalizeChatTurn] Quality gate runner error", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 3. Run response contract enforcer (format repair, strip leakage, length limits)
    let enforcement: { repairs: string[]; warnings: string[] } | undefined;
    try {
      const enforcer = getResponseContractEnforcer();
      const evidenceMap = buildEvidenceMapForEnforcer(params.retrievalPack);
      const enforcerCtx: ResponseContractContext = {
        answerMode: params.answerMode,
        language: normalizeChatLanguage(params.req.preferredLanguage),
        evidenceRequired: provenance.required,
        allowedDocumentIds: params.req.attachedDocumentIds || [],
        provenance,
        evidenceMapSchemaVersion: "v1",
        evidenceMap,
        constraints: {
          maxOutputTokens: requestedMaxOutputTokens ?? undefined,
          hardMaxOutputTokens: requestedMaxOutputTokens
            ? Math.ceil(requestedMaxOutputTokens * 1.25)
            : undefined,
          expectedOutputTokens: observedOutputTokens ?? undefined,
        },
      };
      const enforced = enforcer.enforce(
        { content: text, attachments: [] },
        enforcerCtx,
      );
      if (enforced.enforcement.blocked && enforced.enforcement.reasonCode) {
        appLogger.warn("[finalizeChatTurn] Response blocked by enforcer", {
          reasonCode: enforced.enforcement.reasonCode,
        });
        failureCode = enforced.enforcement.reasonCode;
        text =
          enforced.content ||
          buildEmptyAssistantText({
            language: params.req.preferredLanguage,
            reasonCode: enforced.enforcement.reasonCode,
            seed: `${params.req.userId}:enforcer:${enforced.enforcement.reasonCode}`,
          });
      } else {
        text = enforced.content;
      }
      enforcement = {
        repairs: enforced.enforcement.repairs,
        warnings: enforced.enforcement.warnings,
      };
    } catch (error) {
      const reasonCode = "enforcer_runtime_error";
      const modelName =
        params.telemetry && typeof params.telemetry === "object"
          ? String(
              (params.telemetry as Record<string, unknown>).model || "",
            ).trim() || null
          : null;
      appLogger.error("[finalizeChatTurn] enforcer_failed_closed", {
        event: "enforcer_failed_closed",
        requestId: this.resolveTraceId(params.req),
        model: modelName,
        attachedDocCount: Array.isArray(params.req.attachedDocumentIds)
          ? params.req.attachedDocumentIds.length
          : 0,
        error: error instanceof Error ? error.message : String(error),
      });
      failureCode = reasonCode;
      text = buildEmptyAssistantText({
        language: params.req.preferredLanguage,
        reasonCode,
        seed: `${params.req.userId}:enforcer:${reasonCode}`,
      });
      enforcement = {
        repairs: [],
        warnings: ["ENFORCER_RUNTIME_ERROR_FAIL_CLOSED"],
      };
    }

    if (!failureCode) {
      text = this.repairProviderOverflowStructuredOutput(
        text,
        (params.telemetry as Record<string, unknown>) ?? null,
        params.req.preferredLanguage,
      );
      const revalidatedProvenance = buildChatProvenance({
        answerText: text,
        answerMode: params.answerMode,
        answerClass: params.answerClass,
        retrievalPack: params.retrievalPack,
      });
      const revalidated = validateChatProvenance({
        provenance: revalidatedProvenance,
        answerMode: params.answerMode,
        answerClass: params.answerClass,
        allowedDocumentIds: params.req.attachedDocumentIds || [],
      });
      provenance = {
        ...provenance,
        validated: revalidated.ok,
        failureCode: revalidated.failureCode,
        sourceDocumentIds:
          revalidatedProvenance.sourceDocumentIds.length > 0
            ? revalidatedProvenance.sourceDocumentIds
            : provenance.sourceDocumentIds.length > 0
              ? provenance.sourceDocumentIds
              : sourceDocumentIdsFromSources,
        snippetRefs:
          revalidatedProvenance.snippetRefs.length > 0
            ? revalidatedProvenance.snippetRefs
            : provenance.snippetRefs,
      };
      if (!revalidated.ok) {
        failureCode = revalidated.failureCode;
        text = buildEmptyAssistantText({
          language: params.req.preferredLanguage,
          reasonCode: revalidated.failureCode,
          seed: `${params.req.userId}:provenance:${revalidated.failureCode}`,
        });
      }
    }

    const languageContract = enforceLanguageContract({
      text,
      preferredLanguage: params.req.preferredLanguage,
    });
    if (languageContract.adjusted) {
      appLogger.warn("[finalizeChatTurn] language_contract_fail_closed", {
        requestId: this.resolveTraceId(params.req),
        preferredLanguage: normalizeChatLanguage(params.req.preferredLanguage),
      });
      text = languageContract.text;
    }

    // 4. Generate followups for doc-grounded answers
    const followups = this.generateFollowups(
      params.req,
      params.answerMode,
      params.retrievalPack,
    );

    return {
      assistantText: text,
      followups,
      enforcement,
      provenance,
      failureCode,
    };
  }

  private async ensureConversation(
    userId: string,
    conversationId?: string,
  ): Promise<{ id: string; lastDocumentId: string | null }> {
    if (conversationId) {
      const existing = await prisma.conversation.findFirst({
        where: { id: conversationId, userId, isDeleted: false },
        select: { id: true, lastDocumentId: true },
      });
      if (existing)
        return {
          id: existing.id,
          lastDocumentId: existing.lastDocumentId ?? null,
        };
      throw new ConversationNotFoundError(
        "Conversation not found for this account.",
      );
    }

    const created = await this.createConversation({
      userId,
      title: "New Chat",
    });
    return { id: created.id, lastDocumentId: null };
  }

  private async buildRuntimePolicyFailureResult(input: {
    req: ChatRequest;
    conversationId: string;
    userMessage: ChatMessageDTO | null;
    code: "RUNTIME_POLICY_MISSING" | "RUNTIME_POLICY_INVALID";
  }): Promise<ChatResult> {
    const req = input.req;
    const conversationId =
      input.conversationId ||
      (await this.ensureConversation(req.userId, req.conversationId)).id;
    const userMessage =
      input.userMessage ||
      (await this.createMessage({
        conversationId,
        role: "user",
        content: req.message,
        userId: req.userId,
      }));

    const assistantText = buildEmptyAssistantText({
      language: req.preferredLanguage,
      reasonCode: input.code,
      seed: `${conversationId}:runtime_policy:${input.code}`,
    });
    const answerMode: AnswerMode =
      (req.attachedDocumentIds || []).length > 0
        ? "help_steps"
        : "general_answer";
    const answerClass: AnswerClass =
      answerMode === "general_answer" || answerMode === "help_steps"
        ? "GENERAL"
        : "DOCUMENT";

    const assistantMessage = await this.createMessage({
      conversationId,
      role: "assistant",
      content: assistantText,
      userId: req.userId,
      metadata: {
        failureCode: input.code,
        answerMode,
        answerClass,
      },
    });

    return {
      conversationId,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      assistantText,
      attachmentsPayload: [],
      assistantTelemetry: undefined,
      sources: [],
      followups: [],
      answerMode,
      answerClass,
      navType: null,
      fallbackReasonCode: input.code,
      status: "failed",
      failureCode: input.code,
      completion: {
        answered: false,
        missingSlots: ["runtime_policy"],
        nextAction: null,
      },
      truncation: {
        occurred: false,
        reason: null,
        resumeToken: null,
        providerOccurred: false,
        providerReason: null,
        detectorVersion: SEMANTIC_TRUNCATION_DETECTOR_VERSION,
      },
      evidence: {
        required: (req.attachedDocumentIds || []).length > 0,
        provided: false,
        sourceIds: [],
      },
    };
  }

  private async loadRecentForEngine(
    conversationId: string,
    limit: number,
    userId: string,
    queryText?: string,
  ): Promise<Array<{ role: ChatRole; content: string }>> {
    const runtimeCfg = this.getMemoryRuntimeTuning();
    const safeLimit = clampLimit(limit, runtimeCfg.historyClampMax);

    let recent: Array<{ role: ChatRole; content: string }>;
    if (this.encryptedContext) {
      recent = await this.encryptedContext.buildLLMContext(
        userId,
        conversationId,
        safeLimit,
      );
    } else {
      const rows = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        take: safeLimit,
        select: {
          role: true,
          content: true,
        },
      });
      recent = rows.map((row) => ({
        role: row.role as ChatRole,
        content: String(row.content ?? ""),
      }));
    }

    const memoryBlocks = await this.buildMemorySystemBlocks({
      conversationId,
      userId,
      queryText: queryText || "",
    });

    return [...memoryBlocks, ...recent];
  }

  private resolveRecentContextLimit(): number {
    return this.getMemoryRuntimeTuning().recentContextLimit;
  }

  private getMemoryPolicyRuntimeConfig(): MemoryPolicyRuntimeConfig {
    return this.memoryPolicyEngine.resolveRuntimeConfig();
  }

  private getMemoryRuntimeTuning(): MemoryRuntimeTuning {
    return this.getMemoryPolicyRuntimeConfig()
      .runtimeTuning as MemoryRuntimeTuning;
  }

  private resolveSemanticSignalRegexFlags(): string {
    const flags = String(
      this.getMemoryRuntimeTuning().semanticSignals?.regexFlags || "",
    ).trim();
    if (!flags) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        "memory_policy.config.runtimeTuning.semanticSignals.regexFlags is required",
      );
    }
    return flags;
  }

  private resolveSemanticSignalPatterns(signal: SemanticSignalKey): string[] {
    const patterns =
      this.getMemoryRuntimeTuning().semanticSignals?.patterns?.[signal];
    if (!Array.isArray(patterns) || patterns.length === 0) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        `memory_policy.config.runtimeTuning.semanticSignals.patterns.${signal} is required`,
      );
    }
    return patterns;
  }

  private detectSemanticSignal(
    signal: SemanticSignalKey,
    text: string,
  ): boolean {
    const input = String(text || "");
    if (!input.trim()) return false;
    const flags = this.resolveSemanticSignalRegexFlags();
    const patterns = this.resolveSemanticSignalPatterns(signal);
    return patterns.some((pattern) => {
      try {
        return new RegExp(pattern, flags).test(input);
      } catch {
        throw new RuntimePolicyError(
          "RUNTIME_POLICY_INVALID",
          `Invalid regex in memory_policy semanticSignals for ${signal}: ${pattern}`,
        );
      }
    });
  }

  private collectSemanticSignals(
    queryText: string,
    contextSignals: Record<string, unknown>,
  ): Record<SemanticSignalKey, boolean> {
    const keys: SemanticSignalKey[] = [
      "hasQuotedText",
      "hasFilename",
      "userAskedForTable",
      "userAskedForQuote",
      "sheetHintPresent",
      "rangeExplicit",
      "timeConstraintsPresent",
      "explicitYearOrQuarterComparison",
      "tableExpected",
    ];
    const out = {} as Record<SemanticSignalKey, boolean>;
    for (const key of keys) {
      out[key] =
        contextSignals[key] === true ||
        this.detectSemanticSignal(key, queryText);
    }
    return out;
  }

  private extractQueryKeywords(queryText: string): string[] {
    const cfg = this.getMemoryRuntimeTuning();
    const stopWords = new Set([
      ...(Array.isArray(cfg.queryStopWords?.any) ? cfg.queryStopWords.any : []),
      ...(Array.isArray(cfg.queryStopWords?.pt) ? cfg.queryStopWords.pt : []),
      ...(Array.isArray(cfg.queryStopWords?.es) ? cfg.queryStopWords.es : []),
    ]);
    return String(queryText || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(
        (term) =>
          term.length >= cfg.queryKeywordMinLength && !stopWords.has(term),
      )
      .slice(0, cfg.queryKeywordMaxTerms);
  }

  private async buildMemorySystemBlocks(params: {
    conversationId: string;
    userId: string;
    queryText: string;
  }): Promise<Array<{ role: ChatRole; content: string }>> {
    const cfg = this.getMemoryRuntimeTuning();
    const blocks: Array<{ role: ChatRole; content: string }> = [];
    const keywords = this.extractQueryKeywords(params.queryText);
    const memoryStoreCfg = asObject(cfg.memoryArtifactStore);
    const recallBufferMaxItems = Math.max(
      cfg.memoryRecallMaxItems,
      Number(memoryStoreCfg.recallBufferMaxItems || 0) || 0,
    );
    const keyTopicMaxItems = Math.max(
      1,
      Number(memoryStoreCfg.keyTopicMaxItems || 0) || 0,
    );

    let memoryMeta: Record<string, unknown> = {};
    try {
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.conversationId,
          userId: params.userId,
          isDeleted: false,
        },
        select: {
          summary: true,
          contextMeta: true,
        },
      });
      const contextMeta = asObject(conversation?.contextMeta);
      memoryMeta = asObject(contextMeta.memory);
    } catch {
      // Non-fatal; continue with in-memory recall only.
    }

    const stateSummary = sanitizeSnippet(
      String(memoryMeta.summary || "").trim() || cfg.defaultStateSummary,
      cfg.memorySummaryMaxChars,
    );
    const currentTopic = String(memoryMeta.currentTopic || "").trim();
    if (stateSummary) {
      blocks.push({
        role: "system",
        content: [
          "CONVERSATION_MEMORY_STATE",
          `summary: ${stateSummary}`,
          `topic: ${currentTopic || cfg.defaultStateTopic}`,
        ].join("\n"),
      });
    }

    const keyTopics = toStringArray(memoryMeta.keyTopics).slice(
      0,
      keyTopicMaxItems,
    );
    const turnsSinceLastSummary = Number(memoryMeta.turnsSinceLastSummary);
    if (keyTopics.length > 0 || Number.isFinite(turnsSinceLastSummary)) {
      blocks.push({
        role: "system",
        content: [
          "CONVERSATION_CONTEXT_MEMORY",
          keyTopics.length > 0 ? `keyTopics: ${keyTopics.join(", ")}` : null,
          Number.isFinite(turnsSinceLastSummary)
            ? `turnsSinceLastSummary: ${Math.max(0, Math.floor(turnsSinceLastSummary))}`
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
      });
    }

    const recallCandidates: Array<{
      summary: string;
      createdAt: number;
    }> = [];

    for (const entry of Array.isArray(memoryMeta.recall)
      ? memoryMeta.recall
      : []) {
      const record = asObject(entry);
      const summary = String(record.summary || "").trim();
      const createdAtRaw = String(record.createdAt || "");
      const createdAtTs = Date.parse(createdAtRaw);
      if (!summary) continue;
      recallCandidates.push({
        summary,
        createdAt: Number.isFinite(createdAtTs) ? createdAtTs : 0,
      });
      if (recallCandidates.length >= recallBufferMaxItems) break;
    }

    if (recallCandidates.length > 0) {
      const ranked = recallCandidates
        .map((entry) => {
          const text = `${entry.summary}`.toLowerCase();
          const score = keywords.reduce(
            (acc, term) => (text.includes(term) ? acc + 1 : acc),
            0,
          );
          return { ...entry, score };
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return b.createdAt - a.createdAt;
        })
        .filter((entry) => entry.score > 0 || keywords.length === 0)
        .slice(0, cfg.memoryRecallMaxItems);

      if (ranked.length > 0) {
        blocks.push({
          role: "system",
          content: [
            "CONVERSATION_MEMORY_RECALL",
            ...ranked.map((entry, idx) => `${idx + 1}. ${entry.summary}`),
          ].join("\n"),
        });
      }
    }

    try {
      const inMemoryContext = await this.conversationMemory.getContext(
        params.conversationId,
        params.userId,
      );
      const inMemoryMessages = inMemoryContext?.messages || [];
      if (inMemoryMessages.length > 0) {
        const tail = inMemoryMessages
          .slice(-Math.min(inMemoryMessages.length, cfg.memoryRecallMaxItems))
          .map(
            (m) =>
              `${m.role.toUpperCase()}: ${sanitizeSnippet(
                m.content || "",
                cfg.memoryRecallSnippetChars,
              )}`,
          );
        blocks.push({
          role: "system",
          content: ["CONVERSATION_MEMORY_TAIL", ...tail].join("\n"),
        });
      }
    } catch {
      // Non-fatal cache/read path.
    }

    return blocks;
  }

  private async recordConversationMemoryArtifacts(input: {
    messageId: string;
    conversationId: string;
    userId: string;
    role: ChatRole;
    content: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }): Promise<void> {
    if (!input.userId) return;

    const cfg = this.getMemoryRuntimeTuning();
    const policyConfig = this.getMemoryPolicyRuntimeConfig();
    const memoryRole =
      input.role === "user" || input.role === "assistant" ? input.role : null;

    const rawSourceDocumentIds = Array.isArray((input.metadata as any)?.sources)
      ? (input.metadata as any).sources
          .map((source: any) => String(source?.documentId || "").trim())
          .filter(Boolean)
      : [];
    const storeCfg = asObject(cfg.memoryArtifactStore);
    const maxPersistedSourceDocumentIds = Math.max(
      1,
      Number(storeCfg.maxPersistedSourceDocumentIds || 0) || 0,
    );
    const sourceDocumentIds = this.memoryRedaction.sanitizeSourceDocumentIds(
      rawSourceDocumentIds,
      maxPersistedSourceDocumentIds,
    );
    const intentFamily = this.memoryRedaction.normalizeIntentFamily(
      (input.metadata as any)?.intentFamily,
    );

    try {
      if (memoryRole) {
        await this.conversationMemory.addMessage(
          input.conversationId,
          memoryRole,
          input.content,
          {
            intent:
              typeof input.metadata.intentFamily === "string"
                ? String(input.metadata.intentFamily)
                : undefined,
            sourceDocumentIds,
          },
          input.userId,
        );
      }
    } catch (error) {
      appLogger.warn("[Memory] in-memory mirror update failed", {
        conversationId: input.conversationId,
        messageId: input.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const now = input.createdAt;
    const nowIso = now.toISOString();
    const recentMessageIdMaxItems = Math.max(
      1,
      Number(storeCfg.recentMessageIdMaxItems || 0) || 0,
    );
    const recallBufferMaxItems = Math.max(
      cfg.memoryRecallMaxItems,
      Number(storeCfg.recallBufferMaxItems || 0) || 0,
    );
    const keyTopicMaxItems = Math.max(
      1,
      Number(storeCfg.keyTopicMaxItems || 0) || 0,
    );
    const summaryRefreshAssistantEveryTurns = Math.max(
      1,
      Number(storeCfg.summaryRefreshAssistantEveryTurns || 0) || 1,
    );
    const staleTopicDecayTurns = Math.max(
      1,
      Number(storeCfg.staleTopicDecayTurns || 0) || 1,
    );
    const maxPersistedRecallBytes = Math.max(
      256,
      Number(storeCfg.maxPersistedRecallBytes || 0) || 24000,
    );

    try {
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const existing = await prisma.conversation.findFirst({
          where: {
            id: input.conversationId,
            userId: input.userId,
            isDeleted: false,
          },
          select: {
            summary: true,
            contextMeta: true,
            updatedAt: true,
          },
        });
        if (!existing) return;

        const contextMeta = asObject(existing.contextMeta);
        const priorMemory = asObject(contextMeta.memory);
        const priorRecentMessageIds = toStringArray(
          priorMemory.recentMessageIds,
        );
        if (priorRecentMessageIds.includes(input.messageId)) {
          return;
        }
        const priorKeyTopics = toStringArray(priorMemory.keyTopics);
        const priorSourceDocumentIds = toStringArray(
          priorMemory.sourceDocumentIds,
        );
        const priorRecall = Array.isArray(priorMemory.recall)
          ? priorMemory.recall
          : [];
        const priorTurnsSinceLastSummary = Number(
          priorMemory.turnsSinceLastSummary,
        );

        const nextRecentMessageIds = [
          input.messageId,
          ...priorRecentMessageIds,
        ].slice(0, recentMessageIdMaxItems);
        const nextKeyTopics = Array.from(
          new Set([...priorKeyTopics, intentFamily]),
        )
          .filter(Boolean)
          .slice(0, keyTopicMaxItems);

        const nextSourceDocumentIds =
          this.memoryRedaction.sanitizeSourceDocumentIds(
            [...priorSourceDocumentIds, ...sourceDocumentIds],
            maxPersistedSourceDocumentIds,
          );

        const nextRecall = [
          this.memoryRedaction.buildPersistedRecallEntry({
            messageId: input.messageId,
            role: memoryRole || "assistant",
            intentFamily,
            sourceDocumentIds,
            content: input.content,
            createdAt: now,
          }),
          ...priorRecall.map((entry) => {
            const record = asObject(entry);
            return {
              messageId: String(record.messageId || ""),
              role:
                String(record.role || "").toLowerCase() === "assistant"
                  ? "assistant"
                  : "user",
              intentFamily: this.memoryRedaction.normalizeIntentFamily(
                record.intentFamily,
              ),
              sourceDocumentIds: this.memoryRedaction.sanitizeSourceDocumentIds(
                toStringArray(record.sourceDocumentIds),
                maxPersistedSourceDocumentIds,
              ),
              sourceCount: Math.max(
                0,
                Number(
                  record.sourceCount ||
                    toStringArray(record.sourceDocumentIds).length,
                ) || 0,
              ),
              summary: String(record.summary || "").trim(),
              contentHash: String(record.contentHash || "").trim(),
              createdAt: String(record.createdAt || nowIso),
            };
          }),
        ]
          .filter((entry) => entry.messageId && entry.summary)
          .slice(0, recallBufferMaxItems);

        while (
          nextRecall.length > 1 &&
          this.memoryRedaction.approximateBytes(nextRecall) >
            maxPersistedRecallBytes
        ) {
          nextRecall.pop();
        }

        const nextTurnsSinceLastSummary =
          input.role === "assistant"
            ? (Math.max(0, Math.floor(priorTurnsSinceLastSummary || 0)) + 1) %
              summaryRefreshAssistantEveryTurns
            : Number.isFinite(priorTurnsSinceLastSummary)
              ? Math.max(0, Math.floor(priorTurnsSinceLastSummary) + 1)
              : 1;

        const topicHasDecayed =
          nextTurnsSinceLastSummary >= staleTopicDecayTurns &&
          input.role !== "assistant";
        const effectiveKeyTopics = topicHasDecayed ? [] : nextKeyTopics;
        const nextTopic = effectiveKeyTopics[0] || cfg.defaultStateTopic;
        const nextConversationSummary = cfg.defaultStateSummary;

        const nextMemory = {
          ...priorMemory,
          summary: nextConversationSummary,
          summaryMode: "structural",
          currentTopic: nextTopic,
          keyTopics: effectiveKeyTopics,
          recentMessageIds: nextRecentMessageIds,
          sourceDocumentIds: nextSourceDocumentIds,
          recall: nextRecall,
          turnsSinceLastSummary: nextTurnsSinceLastSummary,
          lastSummaryAt: nowIso,
          lastRole: input.role,
          lastMessageId: input.messageId,
        };

        if (policyConfig.privacy.doNotPersistExtractedPIIValues) {
          delete (nextMemory as any).rawUserTextHistory;
          delete (nextMemory as any).fullRetrievedChunks;
          delete (nextMemory as any).debugTraces;
        }
        if (policyConfig.privacy.doNotPersistRawNumbersFromDocs) {
          delete (nextMemory as any).numericSnapshots;
          delete (nextMemory as any).rawNumbers;
        }

        const updated = await prisma.conversation.updateMany({
          where: {
            id: input.conversationId,
            userId: input.userId,
            isDeleted: false,
            updatedAt: existing.updatedAt,
          },
          data: {
            updatedAt: now,
            summary: nextConversationSummary,
            contextMeta: {
              ...contextMeta,
              memory: nextMemory,
            } as any,
          },
        });

        if (updated.count > 0) return;
      }

      appLogger.warn("[Memory] durable artifact write retried out", {
        conversationId: input.conversationId,
        messageId: input.messageId,
      });
    } catch (error) {
      appLogger.warn("[Memory] durable artifact write failed", {
        conversationId: input.conversationId,
        messageId: input.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Fuzzy-match the query text against attached document names to resolve
   * an explicit document reference even when no file extension is present.
   */
  private async resolveDocNameFromQuery(
    query: string,
    attachedDocIds: string[],
    userId: string,
  ): Promise<{
    resolvedDocId: string | null;
    explicitDocRef: boolean;
    matchedDocIds: string[];
    confidence: number;
  }> {
    if (attachedDocIds.length === 0)
      return {
        resolvedDocId: null,
        explicitDocRef: false,
        matchedDocIds: [],
        confidence: 0,
      };

    const dependencies = this.retrievalFactory.createForUser(userId);
    const docs: DocumentReferenceDoc[] = [];
    for (const docId of attachedDocIds) {
      const meta = await dependencies.docStore.getDocMeta(docId);
      if (meta) {
        docs.push({
          docId: meta.docId,
          title: meta.title,
          filename: meta.filename,
        });
      }
    }

    if (docs.length === 0)
      return {
        resolvedDocId: null,
        explicitDocRef: false,
        matchedDocIds: [],
        confidence: 0,
      };

    const resolution = resolveDocumentReference(query, docs);
    return {
      resolvedDocId: resolution.resolvedDocId,
      explicitDocRef: resolution.explicitDocRef,
      matchedDocIds: resolution.matchedDocIds,
      confidence: resolution.confidence,
    };
  }

  private async retrieveEvidence(
    req: ChatRequest,
    lastDocumentId?: string | null,
  ): Promise<(EvidencePack & { resolvedDocId: string | null }) | null> {
    const cfg = this.getMemoryRuntimeTuning();
    const attachedBase = Array.isArray(req.attachedDocumentIds)
      ? req.attachedDocumentIds.filter(
          (id) => typeof id === "string" && id.trim(),
        )
      : [];
    const contextSignals = asObject((req.context as any)?.signals || {});
    const preferActiveScopeWhenFollowup = Boolean(
      cfg.semanticRetrieval?.preferActiveScopeWhenFollowup,
    );
    const staleScopePenalty = Number(cfg.semanticRetrieval?.staleScopePenalty);
    if (!Number.isFinite(staleScopePenalty) || staleScopePenalty < 0) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        "memory_policy.config.runtimeTuning.semanticRetrieval.staleScopePenalty is required",
      );
    }
    const maxGlobalRetrievalsPerTurn = Number(
      cfg.semanticRetrieval?.maxGlobalRetrievalsPerTurn,
    );
    if (
      !Number.isFinite(maxGlobalRetrievalsPerTurn) ||
      maxGlobalRetrievalsPerTurn < 0
    ) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        "memory_policy.config.runtimeTuning.semanticRetrieval.maxGlobalRetrievalsPerTurn is required",
      );
    }
    const followupActive = contextSignals.isFollowup === true;
    const activeDocHint = String(contextSignals.activeDocId || "").trim();
    const attached =
      attachedBase.length === 0 &&
      preferActiveScopeWhenFollowup &&
      followupActive &&
      activeDocHint
        ? [activeDocHint]
        : attachedBase;

    const globalSearchEnabled = Boolean(
      cfg.semanticRetrieval?.enableGlobalEvidenceSearch,
    );
    const minGlobalChars = Number(
      cfg.semanticRetrieval?.globalSearchMinQueryChars,
    );
    if (!Number.isFinite(minGlobalChars) || minGlobalChars < 0) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        "memory_policy.config.runtimeTuning.semanticRetrieval.globalSearchMinQueryChars is required",
      );
    }
    const allowGlobalScope =
      attached.length === 0 &&
      globalSearchEnabled &&
      maxGlobalRetrievalsPerTurn > 0 &&
      String(req.message || "").trim().length >= minGlobalChars;

    if (attached.length === 0 && !allowGlobalScope) return null;

    const dependencies = this.retrievalFactory.createForUser(req.userId);
    const retrievalEngine = new RetrievalEngineService(
      getBankLoaderInstance(),
      dependencies.docStore,
      dependencies.semanticIndex,
      dependencies.lexicalIndex,
      dependencies.structuralIndex,
    );
    const semanticSignals = this.collectSemanticSignals(
      req.message,
      contextSignals,
    );

    // Slot extraction: resolve entity-role contract from query
    const detectedLanguage = normalizeChatLanguage(req.preferredLanguage);
    const slotResult = resolveSlot(req.message, detectedLanguage);

    const docScopeSignals = buildAttachmentDocScopeSignals(attached);

    // Resolve document name reference from query (fuzzy match against doc names)
    const docNameMatch = await this.resolveDocNameFromQuery(
      req.message,
      attached,
      req.userId,
    );
    if (docNameMatch.matchedDocIds.length === 1 && docNameMatch.resolvedDocId) {
      const resolvedDocId = docNameMatch.resolvedDocId;
      docScopeSignals.docScopeLock = createDocScopeLock({
        mode: "single_doc",
        allowedDocumentIds: [resolvedDocId],
        activeDocumentId: resolvedDocId,
        source: "user_explicit",
      });
      docScopeSignals.explicitDocLock = true;
      docScopeSignals.activeDocId = resolvedDocId;
      docScopeSignals.explicitDocRef = true;
      docScopeSignals.resolvedDocId = resolvedDocId;
      docScopeSignals.hardScopeActive = true;
      docScopeSignals.singleDocIntent = true;
    } else if (docNameMatch.matchedDocIds.length > 1) {
      docScopeSignals.docScopeLock = createDocScopeLock({
        mode: "docset",
        allowedDocumentIds: docNameMatch.matchedDocIds,
        source: "user_explicit",
      });
      docScopeSignals.explicitDocLock = true;
      docScopeSignals.activeDocId = null;
      docScopeSignals.explicitDocRef = false;
      docScopeSignals.resolvedDocId = null;
      docScopeSignals.hardScopeActive = true;
      docScopeSignals.singleDocIntent = false;
    }

    Object.assign(
      docScopeSignals,
      applyConversationHistoryDocScopeFallback({
        signals: docScopeSignals,
        attachedDocumentIds: attached,
        lastDocumentId,
      }),
    );

    const retrievalReq: RetrievalRequest = {
      query: req.message,
      env: normalizeEnv(),
      signals: {
        intentFamily:
          typeof (req.meta as any)?.intentFamily === "string"
            ? String((req.meta as any).intentFamily)
            : "documents",
        operator:
          typeof (req.meta as any)?.operator === "string"
            ? String((req.meta as any).operator)
            : null,
        answerMode: coerceRetrievalAnswerMode((req.meta as any)?.answerMode),
        ...docScopeSignals,
        hasQuotedText: semanticSignals.hasQuotedText,
        hasFilename: semanticSignals.hasFilename,
        userAskedForTable: semanticSignals.userAskedForTable,
        userAskedForQuote: semanticSignals.userAskedForQuote,
        sheetHintPresent: semanticSignals.sheetHintPresent,
        resolvedSheetName:
          typeof contextSignals.resolvedSheetName === "string"
            ? String(contextSignals.resolvedSheetName)
            : null,
        rangeExplicit: semanticSignals.rangeExplicit,
        resolvedRangeA1:
          typeof contextSignals.resolvedRangeA1 === "string"
            ? String(contextSignals.resolvedRangeA1)
            : null,
        timeConstraintsPresent: semanticSignals.timeConstraintsPresent,
        explicitYearOrQuarterComparison:
          semanticSignals.explicitYearOrQuarterComparison,
        tableExpected: semanticSignals.tableExpected,
        corpusSearchAllowed: allowGlobalScope,
        unsafeGate: contextSignals.unsafeGate === true,
        slotContract: slotResult.contract,
        isExtractionQuery: slotResult.isExtractionQuery,
        allowExpansion:
          contextSignals.allowExpansion !== false &&
          !(
            followupActive &&
            attached.length === 0 &&
            staleScopePenalty >= 0.5
          ),
      },
    };

    const pack = await retrievalEngine.retrieve(retrievalReq);
    const maxEvidence = Number(
      cfg.semanticRetrieval?.maxEvidenceItemsForAnswer,
    );
    if (!Number.isFinite(maxEvidence) || maxEvidence <= 0) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        "memory_policy.config.runtimeTuning.semanticRetrieval.maxEvidenceItemsForAnswer is required",
      );
    }
    pack.evidence = pack.evidence.slice(0, Math.floor(maxEvidence));

    return Object.assign(pack, {
      resolvedDocId: docScopeSignals.resolvedDocId ?? null,
    });
  }

  private buildEngineMessages(
    history: Array<{ role: ChatRole; content: string }>,
    userText: string,
    preferredLanguage?: string,
    evidenceGateDecision?: EvidenceCheckResult | null,
  ): Array<{ role: ChatRole; content: string; attachments?: unknown | null }> {
    const cleanedHistory = textForRoleHistory(
      history.map((item, idx) => ({
        id: String(idx),
        role: item.role,
        content: item.content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    );

    const lastUserIndex = [...cleanedHistory]
      .reverse()
      .findIndex((m) => m.role === "user");
    const resolvedLastUserIndex =
      lastUserIndex === -1 ? -1 : cleanedHistory.length - 1 - lastUserIndex;

    const withEvidence: Array<{ role: ChatRole; content: string }> = [];
    if (resolvedLastUserIndex >= 0) {
      withEvidence.push(...cleanedHistory.slice(0, resolvedLastUserIndex));
    } else {
      withEvidence.push(...cleanedHistory);
    }

    const gatePrompt = this.renderEvidenceGatePromptBlock(
      evidenceGateDecision || null,
      preferredLanguage,
    );
    if (gatePrompt) {
      withEvidence.push({
        role: "system",
        content: gatePrompt,
      });
    }

    if (resolvedLastUserIndex >= 0) {
      withEvidence.push(cleanedHistory[resolvedLastUserIndex]);
    } else {
      withEvidence.push({ role: "user", content: userText.trim() });
    }

    return withEvidence.map((item) => ({
      role: item.role,
      content: item.content,
      attachments: null,
    }));
  }

  private buildRuntimeMeta(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
    answerMode: AnswerMode,
    evidenceGateDecision?: EvidenceCheckResult | null,
  ): Record<string, unknown> {
    const sourceCount = retrievalPack?.evidence.length ?? 0;
    return {
      ...(req.meta || {}),
      preferredLanguage: req.preferredLanguage || "en",
      answerMode,
      intentFamily: sourceCount > 0 ? "documents" : "general",
      operator: sourceCount > 0 ? "answer_with_sources" : "answer",
      fallbackReasonCode: this.resolveFallbackReasonCode(req, retrievalPack),
      retrievalStats: retrievalPack?.stats ?? null,
      evidenceGate: evidenceGateDecision
        ? {
            action: evidenceGateDecision.suggestedAction,
            strength: evidenceGateDecision.evidenceStrength,
            missingEvidence: evidenceGateDecision.missingEvidence,
          }
        : null,
    };
  }

  private evaluateEvidenceGateDecision(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
  ): EvidenceCheckResult | null {
    if (!retrievalPack) return null;
    const hasDocContext =
      (req.attachedDocumentIds || []).length > 0 ||
      Boolean(retrievalPack.scope?.hardScopeActive) ||
      retrievalPack.evidence.length > 0;
    if (!hasDocContext) return null;
    return this.evidenceGate.checkEvidence(
      req.message,
      retrievalPack.evidence.map((item) => ({ text: item.snippet ?? "" })),
      normalizeChatLanguage(req.preferredLanguage || "en"),
    );
  }

  private resolveEvidenceGateBypass(
    decision: EvidenceCheckResult | null | undefined,
    language?: string,
    opts?: {
      attachedDocumentIds?: string[];
      evidenceCount?: number;
    },
  ): { text: string; failureCode: string } | null {
    if (!decision) return null;
    const lang = normalizeChatLanguage(language);

    // RC7 fix: Do NOT bypass with clarification when documents ARE attached
    // AND retrieval found evidence from those docs. The user already provided
    // the documents; asking them to "confirm" is a false refusal.
    const hasAttachedDocs = (opts?.attachedDocumentIds || []).length > 0;
    const hasEvidence = (opts?.evidenceCount ?? 0) > 0;

    if (decision.suggestedAction === "clarify") {
      if (hasAttachedDocs && hasEvidence) {
        // Don't bypass — let the LLM attempt an answer with the evidence.
        // The hedge mechanism will add uncertainty prefix if needed.
        return null;
      }
      const question =
        String(decision.clarifyQuestion || "").trim() ||
        (lang === "pt"
          ? "Qual parte exata você quer validar no documento?"
          : lang === "es"
            ? "¿Qué parte exacta quieres validar en el documento?"
            : "Which exact part do you want me to validate in the document?");
      const prompt =
        lang === "pt"
          ? `Preciso de uma confirmação para responder com precisão: ${question}`
          : lang === "es"
            ? `Necesito una confirmación para responder con precisión: ${question}`
            : `I need one clarification to answer precisely: ${question}`;
      return {
        text: prompt,
        failureCode: "EVIDENCE_NEEDS_CLARIFICATION",
      };
    }
    if (decision.suggestedAction === "apologize") {
      // RC8 fix: When documents ARE attached and retrieval returned evidence,
      // do not block entirely — let the LLM hedge instead of refusing.
      // The user already provided documents; a full refusal is a false negative.
      if (hasAttachedDocs && hasEvidence) {
        return null;
      }
      const text =
        lang === "pt"
          ? "Não encontrei evidência suficiente nos documentos para responder com segurança."
          : lang === "es"
            ? "No encontré evidencia suficiente en los documentos para responder con seguridad."
            : "I could not find enough evidence in your documents to answer safely.";
      return {
        text,
        failureCode: "EVIDENCE_INSUFFICIENT",
      };
    }
    return null;
  }

  private applyEvidenceGatePostProcessText(
    text: string,
    decision: EvidenceCheckResult | null | undefined,
  ): string {
    const normalized = String(text || "").trim();
    if (!normalized || !decision) return normalized;
    if (decision.suggestedAction !== "hedge") return normalized;
    const prefix = String(decision.hedgePrefix || "").trim();
    if (!prefix) return normalized;
    const startsWithPrefix =
      normalized.toLowerCase().startsWith(prefix.toLowerCase()) ||
      normalized.toLowerCase().startsWith(`${prefix.toLowerCase()},`);
    if (startsWithPrefix) return normalized;
    return `${prefix} ${normalized}`.trim();
  }

  private renderEvidenceGatePromptBlock(
    decision: EvidenceCheckResult | null,
    language?: string,
  ): string | null {
    if (!decision) return null;
    const prompt = this.evidenceGate.getPromptModification(
      decision,
      normalizeChatLanguage(language || "en"),
    );
    const trimmed = String(prompt || "").trim();
    return trimmed || null;
  }

  private buildRuntimeContext(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
  ): Record<string, unknown> {
    return {
      ...(req.context || {}),
      preferredLanguage: req.preferredLanguage || "en",
      attachedDocumentIds: req.attachedDocumentIds || [],
      retrieval: retrievalPack
        ? {
            query: retrievalPack.query,
            scope: retrievalPack.scope,
            stats: retrievalPack.stats,
          }
        : null,
    };
  }

  private resolveAnswerMode(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
  ): AnswerMode {
    const docsAttached = (req.attachedDocumentIds || []).length > 0;
    const operator = String((req.meta as any)?.operator || "")
      .trim()
      .toLowerCase();
    const evidenceCount = retrievalPack?.evidence.length ?? 0;
    const contextSignals = asObject((req.context as any)?.signals || {});
    const semanticSignals = this.collectSemanticSignals(
      req.message,
      contextSignals,
    );
    if (operator === "open" || operator === "navigate") {
      return "nav_pills";
    }
    const askForTable =
      semanticSignals.userAskedForTable || semanticSignals.tableExpected;
    const askForQuote = semanticSignals.userAskedForQuote;
    if (evidenceCount > 0 && askForQuote) return "doc_grounded_quote";
    if (evidenceCount > 0 && askForTable) return "doc_grounded_table";
    if (evidenceCount > 1) return "doc_grounded_multi";
    if (evidenceCount === 1) return "doc_grounded_single";
    // Attached docs with zero evidence must fail closed as a scoped-not-found
    // guidance turn, not a generic fallback answer.
    if (docsAttached) return "help_steps";
    return "general_answer";
  }

  private resolveFallbackReasonCode(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
  ): string | undefined {
    if (!retrievalPack) return undefined;
    if (retrievalPack.evidence.length > 0) return undefined;
    if (retrievalPack.scope?.hardScopeActive) {
      if ((retrievalPack.scope?.candidateDocIds || []).length === 0) {
        return "explicit_doc_not_found";
      }
      return "scope_hard_constraints_empty";
    }
    if ((req.attachedDocumentIds || []).length > 0) {
      return "no_relevant_chunks_in_scoped_docs";
    }
    return undefined;
  }

  private buildSourceButtonsAttachment(
    retrievalPack: EvidencePack | null,
    preferredLanguage?: string,
  ): unknown | null {
    if (!retrievalPack || retrievalPack.evidence.length === 0) return null;
    const sourceButtonsService = getSourceButtonsService();
    const rawSources = retrievalPack.evidence.map((item) => ({
      documentId: item.docId,
      filename: String(
        item.filename || item.title || fallbackSourceLabel(item.docId),
      ),
      pageNumber: item.location.page ?? undefined,
      sheetName: item.location.sheet ?? undefined,
      slideNumber: item.location.slide ?? undefined,
      score: item.score.finalScore,
    }));
    return sourceButtonsService.buildSourceButtons(rawSources, {
      context: "qa",
      language: normalizeChatLanguage(preferredLanguage),
    });
  }
}
