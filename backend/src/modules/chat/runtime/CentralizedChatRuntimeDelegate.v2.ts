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
  ChatQualityGateFailure,
  ChatQualityGateState,
  ChatWarningState,
} from "../domain/chat.contracts";
import { ConversationNotFoundError } from "../domain/chat.contracts";
import type { EncryptedChatRepo } from "../../../services/chat/encryptedChatRepo.service";
import type { EncryptedChatContextService } from "../../../services/chat/encryptedChatContext.service";
import {
  resolveRuntimeFallbackMessage,
  type FallbackMessageContext,
  type FallbackRouteHints,
} from "../../../services/chat/chatMicrocopy.service";
import { ConversationMemoryService } from "../../../services/memory/conversationMemory.service";
import {
  MemoryPolicyEngine,
  type MemoryPolicyRuntimeConfig,
} from "../../../services/memory/memoryPolicyEngine.service";
import { MemoryRedactionService } from "../../../services/memory/memoryRedaction.service";
import { getBankLoaderInstance, getOptionalBank } from "../../domain/infra";
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
  filterSourceButtonsByUsage,
  type SourceButtonsAttachment,
} from "../../../services/core/retrieval/sourceButtons.service";
import {
  getRetrievalPlanParser,
  type RetrievalPlan,
} from "../../../services/core/retrieval/retrievalPlanParser.service";
import {
  RuntimePolicyError,
  isRuntimePolicyError,
  toRuntimePolicyErrorCode,
} from "./runtimePolicyError";
import { logger as appLogger } from "../../../utils/logger";
import {
  QualityGateRunnerService,
  type QualityGateContext,
  type QualityGateResult,
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
  normalizeFinishReason,
} from "./truncationClassifier";
import { buildChatProvenance } from "./provenance/ProvenanceBuilder";
import { validateChatProvenance } from "./provenance/ProvenanceValidator";
import { hashSnippetForProvenance } from "./provenance/provenanceHash";
import {
  TraceWriterService,
  type TurnDebugPacket,
} from "../../../services/telemetry/traceWriter.service";
import { coerceRetrievalAnswerMode } from "../domain/answerModes";
import { RefusalPolicyService } from "../../../services/core/policy/refusalPolicy.service";
import { ClarificationPolicyService } from "../../../services/core/policy/clarificationPolicy.service";
import { CompliancePolicyService } from "../../../services/core/policy/compliancePolicy.service";
import { FallbackDecisionPolicyService } from "../../../services/core/policy/fallbackDecisionPolicy.service";

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

const USER_FACING_FALLBACK_REASON_CODES = new Set<string>([
  "no_docs_indexed",
  "scope_hard_constraints_empty",
  "no_relevant_chunks_in_scoped_docs",
  "explicit_doc_not_found",
  "needs_doc_choice",
  "doc_ambiguous",
  "indexing_in_progress",
  "extraction_failed",
]);

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

  // With multi-attachment turns, keep the full docset lock but set the
  // activeDocId hint so follow-up queries have a preferred doc context.
  if (params.attachedDocumentIds.length !== 1) {
    signals.activeDocId = lastDocumentId;
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

function resolveAnswerClassFromMode(answerMode: AnswerMode): AnswerClass {
  return String(answerMode || "").startsWith("doc_grounded")
    ? "DOCUMENT"
    : "GENERAL";
}

const PLACEHOLDER_CONVERSATION_TITLES = new Set(["", "new chat", "untitled"]);

function normalizeTitleKey(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function isPlaceholderConversationTitle(value: unknown): boolean {
  return PLACEHOLDER_CONVERSATION_TITLES.has(normalizeTitleKey(value));
}

function deriveAutoConversationTitleFromMessage(
  message: string,
  opts?: { maxWords?: number; maxChars?: number },
): string | null {
  const maxWords = Math.max(3, Math.min(16, Number(opts?.maxWords) || 10));
  const maxChars = Math.max(24, Math.min(120, Number(opts?.maxChars) || 80));

  const cleaned = String(message || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s"'`“”‘’\-–—:;,.!?()[\]{}]+/, "")
    .trim();
  if (!cleaned) return null;

  const words = cleaned.split(" ").filter(Boolean);
  if (!words.length) return null;

  let title = words.slice(0, maxWords).join(" ").trim();
  title = title.replace(/[\s"'`“”‘’\-–—:;,.!?()[\]{}]+$/, "").trim();
  if (!title) return null;

  if (title.length > maxChars) {
    title = title.slice(0, maxChars).replace(/\s+\S*$/, "").trim();
  }
  return title || null;
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
    const snippetHash = hashSnippetForProvenance(snippet);
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

type ProvenanceRuntimeTelemetry = {
  action: "allow" | "hedge" | "block";
  reasonCode: string | null;
  severity: "warning" | "error" | null;
  stage: "enforcer" | "revalidation";
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
    if (!item.docId) continue;
    const dedupeKey = [
      item.docId,
      String(item.locationKey || "").trim().toLowerCase(),
      String(item.location.page ?? ""),
      String(item.location.slide ?? ""),
      String(item.location.sheet || "").trim().toLowerCase(),
      String(item.location.sectionKey || "").trim().toLowerCase(),
    ].join("|");
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const sectionKey = String(item.location.sectionKey || "").trim();
    const isCellRef = /^[A-Za-z]{1,4}[0-9]{1,7}(?::[A-Za-z]{1,4}[0-9]{1,7})?$/.test(sectionKey);
    const locationLabel = item.location.page
      ? `Page ${item.location.page}`
      : item.location.slide
        ? `Slide ${item.location.slide}`
        : item.location.sheet && isCellRef
          ? `${String(item.location.sheet)}!${sectionKey.toUpperCase()}`
          : item.location.sheet
            ? String(item.location.sheet)
            : sectionKey || null;
    out.push({
      documentId: item.docId,
      docId: item.docId,
      filename: String(
        item.filename || item.title || fallbackSourceLabel(item.docId),
      ),
      mimeType: null,
      page: item.location.page ?? null,
      slide: item.location.slide ?? null,
      sheet: item.location.sheet ?? null,
      cell: isCellRef ? sectionKey : null,
      section: !isCellRef ? sectionKey || null : null,
      locationKey: item.locationKey || null,
      locationLabel,
      snippet: item.snippet || null,
    });
    if (out.length >= 6) break;
  }

  return out;
}

export function ensureFallbackSourceCoverage(params: {
  sources: ChatSourceEntry[];
  answerMode: AnswerMode;
  attachedDocumentIds: string[];
  retrievalPack: EvidencePack | null;
}): ChatSourceEntry[] {
  if (params.sources.length > 0) return params.sources;
  const allowFallbackCoverage =
    params.answerMode === "fallback" || params.answerMode === "help_steps";
  if (!allowFallbackCoverage) return params.sources;

  const attachedDocIds = (params.attachedDocumentIds || [])
    .map((id) => String(id || "").trim())
    .filter((id) => id.length > 0);
  if (attachedDocIds.length === 0) return params.sources;

  const attachedSet = new Set(attachedDocIds);
  const activeDocId = String(
    params.retrievalPack?.scope?.activeDocId || "",
  ).trim();
  const candidateDocIds = Array.isArray(
    params.retrievalPack?.scope?.candidateDocIds,
  )
    ? params.retrievalPack?.scope?.candidateDocIds
        .map((id) => String(id || "").trim())
        .filter((id) => id.length > 0)
    : [];

  const searchOrder = [activeDocId, ...candidateDocIds, ...attachedDocIds];
  let selectedDocId = "";
  for (const docId of searchOrder) {
    if (!docId || !attachedSet.has(docId)) continue;
    selectedDocId = docId;
    break;
  }
  if (!selectedDocId) {
    selectedDocId = attachedDocIds[0];
  }
  if (!selectedDocId) return params.sources;

  return [
    {
      documentId: selectedDocId,
      filename: fallbackSourceLabel(selectedDocId),
      mimeType: null,
      page: null,
    },
  ];
}

function filterSourcesByProvenance(
  sources: ChatSourceEntry[],
  provenance: ChatProvenanceDTO | undefined,
  answerText: string,
  evidence: EvidenceItem[],
  options: SourceGroundingOptions = {},
): ChatSourceEntry[] {
  void answerText;
  void evidence;
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

  return options.enforceScopedSources ? [] : sources;
}

function filterAttachmentByProvenance(
  attachment: unknown | null,
  provenance: ChatProvenanceDTO | undefined,
  answerText: string,
  evidence: EvidenceItem[],
  options: SourceGroundingOptions = {},
): unknown | null {
  void answerText;
  void evidence;
  if (!attachment || !provenance) {
    return options.enforceScopedSources ? null : attachment;
  }

  const allowedDocIds = new Set(provenance.sourceDocumentIds);
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
  context?: FallbackMessageContext;
  routeHints?: FallbackRouteHints;
}): string {
  const reason = String(params.reasonCode || "")
    .trim()
    .toLowerCase();
  // Fail-closed provenance errors should not emit synthetic prose. Returning
  // empty text prevents ungrounded fallback content when no valid sources exist.
  if (reason === "missing_provenance") {
    return "";
  }
  return resolveRuntimeFallbackMessage({
    language: params.language,
    reasonCode: params.reasonCode,
    seed: params.seed,
    context: params.context,
    routeHints: params.routeHints,
  });
}

function buildFallbackMicrocopyParams(input: {
  reasonCode?: string | null;
  query?: string;
  retrievalPack?: EvidencePack | null;
  attachedDocumentIds?: string[];
}): {
  context: FallbackMessageContext;
  routeHints: FallbackRouteHints;
} {
  const reason = String(input.reasonCode || "")
    .trim()
    .toLowerCase();
  const retrievalPack = input.retrievalPack || null;
  const evidence = Array.isArray(retrievalPack?.evidence)
    ? retrievalPack.evidence
    : [];
  const firstEvidence = evidence[0] || null;
  const scope: Partial<EvidencePack["scope"]> = retrievalPack?.scope || {};
  const candidateDocCount = Array.isArray(scope.candidateDocIds)
    ? scope.candidateDocIds.length
    : 0;
  const fallbackScopeName =
    candidateDocCount > 0
      ? candidateDocCount === 1
        ? "selected document"
        : "selected documents"
      : scope.hardScopeActive
        ? "current scope"
        : "all documents";

  const suggestedOptions = Array.from(
    new Set(
      evidence
        .map((item) => String(item?.filename || item?.title || "").trim())
        .filter((value) => value.length > 0),
    ),
  ).slice(0, 4);

  const context: FallbackMessageContext = {
    fileName: firstEvidence?.filename || "",
    docTitle: firstEvidence?.title || "",
    scopeName: fallbackScopeName,
    reasonShort: reason || "unknown",
    expectedDocTypes: "PDF, DOCX, XLSX, PPTX",
    uploadLimit: "25 MB",
    indexName: "knowledge index",
    queryHint: String(input.query || "").trim().slice(0, 120),
  };

  const routeHints: FallbackRouteHints = {
    hasIndexedDocs:
      reason === "no_docs_indexed"
        ? false
        : candidateDocCount > 0 || evidence.length > 0,
    hardScopeActive: Boolean(scope.hardScopeActive),
    explicitDocRef: reason === "explicit_doc_not_found",
    needsDocChoice: reason === "needs_doc_choice" || reason === "doc_ambiguous",
    disambiguationOptions: suggestedOptions,
    topConfidence:
      typeof retrievalPack?.stats?.topScore === "number"
        ? retrievalPack.stats.topScore
        : undefined,
    confidenceGap:
      typeof retrievalPack?.stats?.scoreGap === "number"
        ? retrievalPack.stats.scoreGap
        : undefined,
  };

  return { context, routeHints };
}

function normalizeChatLanguage(value: unknown): "en" | "pt" | "es" {
  const lang = String(value || "")
    .trim()
    .toLowerCase();
  if (lang === "pt" || lang === "es") return lang;
  return "en";
}

function hashSeed(input: string): number {
  let h = 0;
  const text = String(input || "");
  for (let i = 0; i < text.length; i += 1) {
    h = (h * 31 + text.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}

function countRegexMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function isRuntimeFlagEnabled(flagName: string, defaultValue = true): boolean {
  const raw = String(process.env[flagName] || "")
    .trim()
    .toLowerCase();
  if (!raw) return defaultValue;
  if (["1", "true", "on", "yes"].includes(raw)) return true;
  if (["0", "false", "off", "no"].includes(raw)) return false;
  return defaultValue;
}

const EN_LANGUAGE_MARKERS =
  /\b(the|with|this|that|for|from|please|summary|table|evidence|document|documents|according|based|thanks|yes|no)\b/g;
const PT_LANGUAGE_MARKERS =
  /\b(nao|não|voce|você|com|como|onde|porque|obrigado|obrigada|resumo|tabela|evidencia|evidência|documento|documentos|sim)\b/g;
const ES_LANGUAGE_MARKERS =
  /\b(con|donde|cual|cuál|cuales|cuáles|gracias|resumen|tabla|evidencia|documento|documentos|si|sí)\b/g;
const ENGLISH_STRUCTURAL_WORDS = /\b(and|or|to|of|in|on|is|are|was|were)\b/g;
const PORTUGUESE_STRUCTURAL_WORDS =
  /\b(e|ou|para|de|do|da|dos|das|que|em|ao|aos)\b/g;
const SPANISH_STRUCTURAL_WORDS = /\b(y|o|para|de|del|la|las|los|que|en|al)\b/g;
const EN_DISTINCT_LANGUAGE_MARKERS =
  /\b(the|with|this|that|please|summary|according|based|thanks|answer)\b/g;
const PT_DISTINCT_LANGUAGE_MARKERS =
  /\b(nao|não|voce|você|obrigado|obrigada|resumo|portugues|português|resposta|envio)\b/g;
const ES_DISTINCT_LANGUAGE_MARKERS =
  /\b(gracias|resumen|respuesta|envio|envío|espanol|español|segun|según)\b/g;

function languageScoreFor(
  language: "en" | "pt" | "es",
  scores: { en: number; pt: number; es: number },
): number {
  if (language === "pt") return scores.pt;
  if (language === "es") return scores.es;
  return scores.en;
}

function strongestCompetingLanguageScore(
  language: "en" | "pt" | "es",
  scores: { en: number; pt: number; es: number },
): number {
  if (language === "en") return Math.max(scores.pt, scores.es);
  if (language === "pt") return Math.max(scores.en, scores.es);
  return Math.max(scores.en, scores.pt);
}

function languageDistinctSignals(text: string): {
  en: number;
  pt: number;
  es: number;
} {
  const value = ` ${String(text || "").toLowerCase()} `;
  return {
    en: countRegexMatches(value, EN_DISTINCT_LANGUAGE_MARKERS),
    pt: countRegexMatches(value, PT_DISTINCT_LANGUAGE_MARKERS),
    es: countRegexMatches(value, ES_DISTINCT_LANGUAGE_MARKERS),
  };
}

function hasStrongMixedLanguageSignal(params: {
  text: string;
  preferredLanguage: "en" | "pt" | "es";
  scores: { en: number; pt: number; es: number };
}): boolean {
  const normalized = String(params.text || "").trim();
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const longEnough = wordCount >= 12 || normalized.length >= 72;
  if (!longEnough) return false;

  const primaryScore = languageScoreFor(
    params.preferredLanguage,
    params.scores,
  );
  const competingScore = strongestCompetingLanguageScore(
    params.preferredLanguage,
    params.scores,
  );
  if (competingScore < 1.6) return false;

  const strongCombinedSignal = primaryScore + competingScore >= 3.4;
  const nearParity =
    primaryScore <= 0.1
      ? competingScore >= 1.8
      : competingScore >= primaryScore * 0.82;

  const distinct = languageDistinctSignals(normalized);
  const primaryDistinct = languageScoreFor(params.preferredLanguage, distinct);
  const competingDistinct = strongestCompetingLanguageScore(
    params.preferredLanguage,
    distinct,
  );
  const distinctConflict =
    competingDistinct >= 2 && competingDistinct >= primaryDistinct + 1;

  return strongCombinedSignal && nearParity && distinctConflict;
}

function hasSentenceLanguageSwitch(params: {
  text: string;
  preferredLanguage: "en" | "pt" | "es";
}): boolean {
  const fragments = String(params.text || "")
    .split(/[.!?]+\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part.split(/\s+/).length >= 4);
  if (fragments.length < 2) return false;

  let hasPreferredSentence = false;
  let hasCompetingSentence = false;
  for (const fragment of fragments) {
    const scores = languageScores(fragment);
    const entries = [
      { language: "en", score: scores.en },
      { language: "pt", score: scores.pt },
      { language: "es", score: scores.es },
    ].sort((a, b) => b.score - a.score);
    if (entries[0].score < 1.2 || entries[0].score < entries[1].score + 0.5) {
      continue;
    }
    if (entries[0].language === params.preferredLanguage) {
      hasPreferredSentence = true;
    } else {
      hasCompetingSentence = true;
    }
  }

  return hasPreferredSentence && hasCompetingSentence;
}

function languageScores(text: string): { en: number; pt: number; es: number } {
  const value = ` ${String(text || "").toLowerCase()} `;
  const enMarkers = countRegexMatches(value, EN_LANGUAGE_MARKERS);
  const ptMarkers = countRegexMatches(value, PT_LANGUAGE_MARKERS);
  const esMarkers = countRegexMatches(value, ES_LANGUAGE_MARKERS);
  const enStructure = countRegexMatches(value, ENGLISH_STRUCTURAL_WORDS) * 0.25;
  const ptStructure =
    countRegexMatches(value, PORTUGUESE_STRUCTURAL_WORDS) * 0.25;
  const esStructure = countRegexMatches(value, SPANISH_STRUCTURAL_WORDS) * 0.25;
  const ptAccents = countRegexMatches(value, /[ãõçâêô]/g) * 0.9;
  const esSignals =
    countRegexMatches(value, /[ñ¿¡]/g) * 1.2 +
    countRegexMatches(value, /(?:\bción\b|\bciones\b)/g) * 0.7;
  const latinAccentSignal = countRegexMatches(value, /[áéíóú]/g) * 0.25;

  return {
    en: enMarkers + enStructure,
    pt: ptMarkers + ptStructure + ptAccents + latinAccentSignal * 0.5,
    es: esMarkers + esStructure + esSignals + latinAccentSignal * 0.5,
  };
}

function isShortNeutralText(text: string): boolean {
  const normalized = String(text || "").trim();
  if (!normalized) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  const alphaChars = (normalized.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  const hasSentenceEnding = /[.!?]$/.test(normalized);
  return words.length <= 4 && alphaChars <= 24 && hasSentenceEnding;
}

function hasSubstantialAlphabeticContent(text: string): boolean {
  const alphaChars = (String(text || "").match(/[A-Za-zÀ-ÿ]/g) || []).length;
  return alphaChars >= 8;
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

function stripRepeatedDocLeadIn(
  text: string,
  language: "en" | "pt" | "es",
): string {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  const patterns =
    language === "pt"
      ? [
          /^com base nos documentos (enviados|fornecidos),?\s*(segue a resposta:)?\s*/i,
          /^aqui est[aá] o que encontrei nos documentos:?\s*/i,
          /^resumo objetivo do que os documentos mostram:?\s*/i,
        ]
      : language === "es"
        ? [
            /^con base en los documentos (enviados|proporcionados),?\s*/i,
            /^aqui est[aá] lo que encontr[eé] en los documentos:?\s*/i,
          ]
        : [
            /^based on the documents (provided|shared),?\s*(here(?:'| i)s (?:the )?answer:)?\s*/i,
            /^here(?:'| i)s what i found in the documents:?\s*/i,
          ];
  let out = raw;
  for (const re of patterns) {
    out = out.replace(re, "");
  }
  return out.trim() || raw;
}

function softRepairLanguageContract(
  text: string,
  language: "en" | "pt" | "es",
): string {
  let out = stripRepeatedDocLeadIn(text, language);
  if (!out) return String(text || "").trim();

  if (language === "pt") {
    out = out
      .replace(/\bhere(?:'| i)s what i found in the documents:?\s*/gi, "")
      .replace(
        /\bbased on the documents (provided|shared),?\s*(here(?:'| i)s (?:the )?answer:?)?/gi,
        "",
      )
      .replace(/\bsummary of what the documents show:?\s*/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  } else if (language === "es") {
    out = out
      .replace(/\bhere(?:'| i)s what i found in the documents:?\s*/gi, "")
      .replace(/\bbased on the documents (provided|shared),?\s*/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  return out || String(text || "").trim();
}

function stripAnalyticalSourceNoiseForLanguageCheck(text: string): string {
  const value = String(text || "").trim();
  if (!value) return value;
  const lines = value.split("\n");
  const kept: string[] = [];
  let inSourcesBlock = false;
  for (const rawLine of lines) {
    const line = String(rawLine || "");
    const trimmed = line.trim();
    if (/^sources used:\s*$/i.test(trimmed)) {
      inSourcesBlock = true;
      continue;
    }
    if (inSourcesBlock) {
      if (/^[-*]\s+/.test(trimmed)) continue;
      if (/^(direct answer|key evidence)\s*:/i.test(trimmed)) {
        inSourcesBlock = false;
      } else if (!trimmed) {
        continue;
      }
    }
    if (/^[-*]\s+evidence referenced from\s+/i.test(trimmed)) continue;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

function hasLanguageMismatch(
  normalized: string,
  lang: "en" | "pt" | "es",
): boolean {
  if (isShortNeutralText(normalized)) return false;
  if (!hasSubstantialAlphabeticContent(normalized)) return false;
  const scores = languageScores(normalized);
  const signalStrength = scores.en + scores.pt + scores.es;
  if (signalStrength < 1.1) return false;
  const langScore = languageScoreFor(lang, scores);
  const otherTop = strongestCompetingLanguageScore(lang, scores);
  return (
    otherTop >= langScore + 1.2 ||
    hasStrongMixedLanguageSignal({
      text: normalized,
      preferredLanguage: lang,
      scores,
    }) ||
    hasSentenceLanguageSwitch({
      text: normalized,
      preferredLanguage: lang,
    })
  );
}

export function enforceLanguageContract(params: {
  text: string;
  preferredLanguage?: string | null;
  allowFailClosed?: boolean;
}): { text: string; adjusted: boolean; failClosed: boolean } {
  if (!isRuntimeFlagEnabled("LANGUAGE_CONTRACT_V2", true)) {
    return {
      text: String(params.text || "").trim(),
      adjusted: false,
      failClosed: false,
    };
  }
  const normalized = String(params.text || "").trim();
  if (!normalized)
    return { text: normalized, adjusted: false, failClosed: false };
  const lang = normalizeChatLanguage(params.preferredLanguage);
  const languageProbe = stripAnalyticalSourceNoiseForLanguageCheck(normalized);
  const mismatch = hasLanguageMismatch(languageProbe || normalized, lang);
  if (!mismatch)
    return { text: normalized, adjusted: false, failClosed: false };

  // Soft-repair first to avoid dropping grounded content when mismatch is recoverable.
  const repaired = softRepairLanguageContract(normalized, lang);
  if (repaired && !hasLanguageMismatch(repaired, lang)) {
    return { text: repaired, adjusted: true, failClosed: false };
  }

  if (params.allowFailClosed === false) {
    return {
      text: normalized,
      adjusted: true,
      failClosed: false,
    };
  }

  return {
    text: buildLanguageContractFallback(lang),
    adjusted: true,
    failClosed: true,
  };
}

const DEFAULT_BLOCKING_QUALITY_GATES = new Set<string>([
  "wrong_doc_lock_enforcement",
  "redaction_default_pii_identity_tax_banking",
  "medical_safety_boundaries",
  "privacy_minimal",
]);

type QualityGatesBank = {
  config?: {
    gateSeverityByName?: Record<string, "warn" | "block" | "warning" | "error">;
  };
};

function normalizeGateSeverity(value: unknown): "warn" | "block" | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "block" || normalized === "error") return "block";
  if (normalized === "warn" || normalized === "warning") return "warn";
  return null;
}

function resolveQualityGateSeverity(
  gateName: string,
  severityByName: Record<string, "warn" | "block">,
): "warn" | "block" {
  const normalized = String(gateName || "").trim();
  if (!normalized) return "warn";
  if (severityByName[normalized]) return severityByName[normalized];
  if (DEFAULT_BLOCKING_QUALITY_GATES.has(normalized)) return "block";
  if (normalized.startsWith("redaction_")) return "block";
  if (normalized.startsWith("medical_")) return "block";
  return "warn";
}

function resolveQualityGateSeverityMap(): Record<string, "warn" | "block"> {
  const out: Record<string, "warn" | "block"> = {};
  const bank = getOptionalBank<QualityGatesBank>("quality_gates");
  const map = bank?.config?.gateSeverityByName;
  if (!map || typeof map !== "object") return out;
  for (const [gateName, severityRaw] of Object.entries(map)) {
    const normalized = normalizeGateSeverity(severityRaw);
    if (!normalized) continue;
    const key = String(gateName || "").trim();
    if (!key) continue;
    out[key] = normalized;
  }
  return out;
}

function toQualityGateFailure(
  gate: QualityGateResult,
  severityByName: Record<string, "warn" | "block">,
): ChatQualityGateFailure {
  const reason =
    Array.isArray(gate.issues) && gate.issues.length > 0
      ? gate.issues.join(" | ")
      : null;
  return {
    gateName: gate.gateName,
    severity: resolveQualityGateSeverity(gate.gateName, severityByName),
    reason,
  };
}

type RuntimeFailureMode = "fail_closed" | "fail_soft";

const HARD_FAIL_CLOSED_REASON_CODES = new Set<string>([
  "language_contract_mismatch",
  "json_not_allowed",
  "banned_phrase_critical",
  "empty_after_contract_enforcement",
  "out_of_scope_provenance",
  "missing_evidence_map",
  "policy_refusal_required",
  "compliance_blocked",
]);

function normalizeReasonCode(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isHardFailClosedReason(reasonCode: string): boolean {
  const normalized = normalizeReasonCode(reasonCode);
  if (!normalized) return false;
  if (HARD_FAIL_CLOSED_REASON_CODES.has(normalized)) return true;
  if (normalized.startsWith("policy_")) return true;
  if (normalized.startsWith("compliance_")) return true;
  if (normalized.startsWith("security_")) return true;
  if (normalized.includes("prompt_injection")) return true;
  if (normalized.includes("jailbreak")) return true;
  if (normalized.includes("unsafe")) return true;
  return false;
}

function resolveRuntimeFailureMode(
  reasonCode: string,
  failSoftEnabled: boolean,
): RuntimeFailureMode {
  if (isHardFailClosedReason(reasonCode)) return "fail_closed";
  return failSoftEnabled ? "fail_soft" : "fail_closed";
}

function buildWarningMessageForReason(params: {
  reasonCode: string;
  language: "en" | "pt" | "es";
}): string {
  const reason = normalizeReasonCode(params.reasonCode);
  const lang = params.language;
  if (reason === "quality_gate_blocked" || reason === "quality_gate_runner_error") {
    if (lang === "pt")
      return "Nem todas as verificacoes de qualidade passaram. Revise os pontos importantes com as fontes.";
    if (lang === "es")
      return "No se completaron todas las verificaciones de calidad. Revisa los puntos clave con las fuentes.";
    return "Not all quality checks passed. Please verify key points against the sources.";
  }
  if (
    reason === "missing_provenance" ||
    reason === "insufficient_provenance_coverage"
  ) {
    if (lang === "pt")
      return "Parte da resposta pode estar sem rastreabilidade completa para as fontes.";
    if (lang === "es")
      return "Parte de la respuesta puede no tener trazabilidad completa a las fuentes.";
    return "Parts of this answer may be missing full source traceability.";
  }
  if (reason === "enforcer_runtime_error") {
    if (lang === "pt")
      return "Nao consegui aplicar todas as validacoes finais. Revise os detalhes criticos.";
    if (lang === "es")
      return "No pude aplicar todas las validaciones finales. Revisa los detalles criticos.";
    return "I could not apply all final validations. Please review critical details.";
  }
  if (reason === "language_contract_mismatch") {
    if (lang === "pt")
      return "Nao consegui finalizar com seguranca no idioma solicitado.";
    if (lang === "es")
      return "No pude finalizar de forma segura en el idioma solicitado.";
    return "I could not safely finalize in the requested language.";
  }
  if (reason === "table_contract_violation") {
    if (lang === "pt")
      return "A resposta pode ter problemas de formatacao de tabela.";
    if (lang === "es")
      return "La respuesta puede tener problemas de formato en tablas.";
    return "This response may contain table formatting issues.";
  }
  if (lang === "pt")
    return "Algumas validacoes nao foram concluídas completamente. Revise os detalhes importantes.";
  if (lang === "es")
    return "Algunas validaciones no se completaron totalmente. Revisa los detalles importantes.";
  return "Some validations did not fully complete. Please review important details.";
}

function buildWarningEntry(params: {
  code: string;
  language: "en" | "pt" | "es";
  severity?: "warning" | "error";
  source?: ChatWarningState["source"];
}): ChatWarningState {
  return {
    code: String(params.code || "").trim(),
    message: buildWarningMessageForReason({
      reasonCode: params.code,
      language: params.language,
    }),
    severity: params.severity || "warning",
    ...(params.source ? { source: params.source } : {}),
  };
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

  return {
    contractOccurred: semantic.occurred,
    contractReason: semantic.reason,
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
  private readonly refusalPolicy = new RefusalPolicyService();
  private readonly clarificationPolicy = new ClarificationPolicyService();
  private readonly compliancePolicy = new CompliancePolicyService();
  private readonly fallbackDecisionPolicy = new FallbackDecisionPolicyService();
  private readonly traceWriter = new TraceWriterService(prisma as any);
  private readonly retrievalPlanParser = getRetrievalPlanParser();
  private readonly lowConfidenceSurfaceFallback =
    String(process.env.LOW_CONFIDENCE_SURFACE_FALLBACK || "")
      .trim()
      .toLowerCase() === "true";
  private readonly provenanceUserFailOpenWithEvidence = false;

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
    // Prefer body meta.requestId, fall back to HTTP middleware requestId
    return sanitizeTraceId(meta.requestId) || sanitizeTraceId(meta.httpRequestId) || mkTraceId();
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
    provenanceTelemetry?: ProvenanceRuntimeTelemetry | null;
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
        action: params.provenanceTelemetry?.action || null,
        severity: params.provenanceTelemetry?.severity || null,
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
    fallbackReasonCodeTelemetry?: string;
    fallbackPolicyMeta?: Record<string, unknown> | null;
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
    provenanceTelemetry?: ProvenanceRuntimeTelemetry | null;
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
    const fallbackPolicyMeta = asObject(params.fallbackPolicyMeta);
    const fallbackReasonTelemetryFromPolicy = String(
      fallbackPolicyMeta.reasonCode || "",
    ).trim();
    const fallbackReasonForUser =
      params.failureCode || params.fallbackReasonCode || null;
    const fallbackReasonForTelemetry =
      params.failureCode ||
      params.fallbackReasonCodeTelemetry ||
      fallbackReasonTelemetryFromPolicy ||
      params.fallbackReasonCode ||
      null;
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
        provenanceTelemetry: params.provenanceTelemetry || null,
        truncation,
      }),
    );
    const ruleEvents = Array.isArray(
      params.retrievalPack?.telemetry?.ruleEvents,
    )
      ? params.retrievalPack?.telemetry?.ruleEvents
      : [];
    const provenanceReasonForTelemetry = String(
      params.provenanceTelemetry?.reasonCode || "",
    ).trim();
    const warningCodes = [
      fallbackReasonForTelemetry,
      provenanceReasonForTelemetry || null,
    ].filter(Boolean) as string[];
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
        hadFallback: Boolean(fallbackReasonForTelemetry),
        fallbackScenario: fallbackReasonForTelemetry,
        answerLength: String(params.assistantText || "").length,
        wasTruncated: truncation.contractOccurred,
        wasProviderTruncated: truncation.providerOccurred,
        truncationDetectorVersion: truncation.detectorVersion,
        truncationReason: truncation.contractReason,
        providerTruncationReason: truncation.providerReason,
        failureCode: params.failureCode || null,
        hasErrors: params.status === "failed" || Boolean(params.failureCode),
        warnings: warningCodes,
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
        fallbackReasonCode: fallbackReasonForTelemetry,
        at: new Date(),
        meta: {
          requestId:
            typeof meta.requestId === "string" ? String(meta.requestId) : null,
          evidenceGateAction: evidenceAction,
          retrievalStats: params.retrievalPack?.stats || null,
          retrievalRuleSummary:
            params.retrievalPack?.telemetry?.summary || null,
          bankSelection:
            asObject(
              (params.retrievalPack as unknown as Record<string, unknown>)
                ?.bankSelection,
            ) ||
            null,
          fallbackPolicy:
            Object.keys(fallbackPolicyMeta).length > 0
              ? fallbackPolicyMeta
              : null,
          fallbackReasonCodeUser: fallbackReasonForUser,
          provenanceTelemetry: params.provenanceTelemetry || null,
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
    let generatedConversationTitle: string | null = null;
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
      const titleWasPlaceholder = isPlaceholderConversationTitle(conv.title);

      userMessage = await this.createMessage({
        conversationId,
        role: "user",
        content: req.message,
        userId: req.userId,
      });
      generatedConversationTitle = await this.resolveGeneratedTitleForTurn({
        conversationId,
        titleWasPlaceholder,
      });

      const governanceBlock = this.resolveGovernancePolicyBlock(req);
      if (governanceBlock) {
        const result = await this.buildGovernanceBlockedResult({
          req,
          conversationId,
          userMessage,
          code: governanceBlock.code,
          text: governanceBlock.text,
          status: governanceBlock.status,
        });
        await this.persistTraceArtifacts({
          traceId,
          req,
          conversationId: result.conversationId,
          userMessageId: result.userMessageId,
          assistantMessageId: result.assistantMessageId,
          retrievalPack,
          evidenceGateDecision,
          answerMode: result.answerMode || answerMode,
          status: result.status || "blocked",
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
            "[trace-writer] failed to persist governance-policy trace",
            {
              traceId,
              error:
                persistError instanceof Error
                  ? persistError.message
                  : String(persistError),
            },
          );
        });
        return this.withGeneratedConversationTitle(
          { ...result, traceId },
          generatedConversationTitle,
        );
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

      const retrievalSpanId = this.traceWriter.startSpan(traceId, "retrieval");
      const retrievalStartedAt = Date.now();
      retrievalPack = await this.retrieveEvidence(req, lastDocumentId, {
        traceId,
        conversationId,
      });
      retrievalMs = Date.now() - retrievalStartedAt;

      // Persist resolved doc for conversation-history follow-up scoping
      const resolvedDocId = retrievalPack?.resolvedDocId ?? null;
      await this.persistResolvedDocScope({
        traceId,
        conversationId,
        previousDocId: lastDocumentId,
        resolvedDocId,
        stream: false,
      });

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
      const answerClass: AnswerClass = resolveAnswerClassFromMode(answerMode);
      const navType: NavType = null;

      const sourceButtonsAttachment = this.buildSourceButtonsAttachment(
        retrievalPack,
        req.preferredLanguage,
      );
      const sources: ChatSourceEntry[] = ensureFallbackSourceCoverage({
        sources: buildSourcesFromEvidence(retrievalPack?.evidence ?? []),
        answerMode,
        attachedDocumentIds: req.attachedDocumentIds || [],
        retrievalPack,
      });
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
          status:
            bypass.failureCode === "EVIDENCE_NEEDS_CLARIFICATION"
              ? "clarification_required"
              : "partial",
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
        return this.withGeneratedConversationTitle(
          result,
          generatedConversationTitle,
        );
      }

      const messages = this.buildEngineMessages(
        history,
        req.message,
        req.preferredLanguage,
        evidenceGateDecision,
      );
      const fallbackSignal = this.resolveFallbackSignal(req, retrievalPack);
      const fallbackReasonCode = fallbackSignal.reasonCode;
      const composeSpanId = this.traceWriter.startSpan(traceId, "compose");
      const llmStartedAt = Date.now();
      const generated = await this.engine.generate({
        traceId,
        userId: req.userId,
        conversationId,
        messages,
        evidencePack: toEngineEvidencePack(retrievalPack),
        context: this.buildRuntimeContext(req, retrievalPack, answerMode),
        meta: this.buildRuntimeMeta(
          req,
          retrievalPack,
          answerMode,
          evidenceGateDecision,
          fallbackSignal,
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
      const fallbackMicrocopyParams = buildFallbackMicrocopyParams({
        reasonCode: fallbackReasonCode,
        query: req.message,
        retrievalPack,
        attachedDocumentIds: req.attachedDocumentIds || [],
      });
      const assistantTextBase =
        assistantTextRaw ||
        buildEmptyAssistantText({
          language: req.preferredLanguage,
          reasonCode: fallbackReasonCode,
          seed: `${conversationId}:chat:${fallbackReasonCode || "empty_model_response"}`,
          context: fallbackMicrocopyParams.context,
          routeHints: fallbackMicrocopyParams.routeHints,
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
        const sourceInvariantMicrocopy = buildFallbackMicrocopyParams({
          reasonCode: sourceInvariantFailureCode,
          query: req.message,
          retrievalPack,
          attachedDocumentIds: req.attachedDocumentIds || [],
        });
        assistantText = buildEmptyAssistantText({
          language: req.preferredLanguage,
          reasonCode: sourceInvariantFailureCode,
          seed: `${req.userId}:sources:${sourceInvariantFailureCode}`,
          context: sourceInvariantMicrocopy.context,
          routeHints: sourceInvariantMicrocopy.routeHints,
        });
      }
      const assistantTelemetry =
        (generated.telemetry as Record<string, unknown>) ?? {};
      if (finalized.provenanceTelemetry) {
        assistantTelemetry.provenance = finalized.provenanceTelemetry;
      }
      const persistedAssistantTelemetry =
        Object.keys(assistantTelemetry).length > 0 ? assistantTelemetry : null;

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
        telemetry: persistedAssistantTelemetry,
        metadata: {
          sources: filteredSources,
          answerMode,
          answerClass,
          navType,
          fallbackReasonCode,
          fallbackTelemetry: fallbackSignal.telemetryReasonCode
            ? {
                reasonCode: fallbackSignal.telemetryReasonCode,
              }
            : null,
          fallbackPolicy: fallbackSignal.policyMeta || null,
              evidenceGate: evidenceGateDecision
                ? {
                    action: evidenceGateDecision.suggestedAction,
                    strength: evidenceGateDecision.evidenceStrength,
                  }
                : null,
              enforcement: finalized.enforcement ?? null,
              provenance: finalized.provenance ?? null,
              provenanceTelemetry: finalized.provenanceTelemetry ?? null,
              qualityGates: finalized.qualityGates,
              failureCode:
                finalized.failureCode || sourceInvariantFailureCode || null,
              userWarning: finalized.userWarning || null,
              warnings: Array.isArray(finalized.warnings)
                ? finalized.warnings
                : [],
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
        finalized.failureCode ||
        sourceInvariantFailureCode ||
        !assistantTextRaw ||
        (Array.isArray(finalized.warnings) && finalized.warnings.length > 0)
          ? "partial"
          : "success";
      const failureCode =
        finalized.failureCode ||
        sourceInvariantFailureCode ||
        (assistantTextRaw ? null : "EMPTY_MODEL_RESPONSE");
      const warnings = Array.isArray(finalized.warnings) ? finalized.warnings : [];
      const userWarning = finalized.userWarning || warnings[0] || null;

      const result: ChatResult = {
        conversationId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        traceId,
        assistantText,
        attachmentsPayload,
        assistantTelemetry: persistedAssistantTelemetry ?? undefined,
        provenance: finalized.provenance,
        sources: [...filteredSources],
        followups: finalized.followups,
        answerMode,
        answerClass,
        navType,
        fallbackReasonCode,
        status,
        failureCode,
        qualityGates: finalized.qualityGates,
        userWarning,
        warnings,
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
        fallbackReasonCodeTelemetry: fallbackSignal.telemetryReasonCode,
        fallbackPolicyMeta: fallbackSignal.policyMeta || null,
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
        provenanceTelemetry: finalized.provenanceTelemetry ?? null,
        truncation,
      }).catch((error) => {
        appLogger.warn("[trace-writer] failed to persist chat trace", {
          traceId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      return this.withGeneratedConversationTitle(
        result,
        generatedConversationTitle,
      );
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
      return this.withGeneratedConversationTitle(
        result,
        generatedConversationTitle,
      );
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
    let generatedConversationTitle: string | null = null;
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
      const titleWasPlaceholder = isPlaceholderConversationTitle(conv.title);

      userMessage = await this.createMessage({
        conversationId,
        role: "user",
        content: req.message,
        userId: req.userId,
      });
      generatedConversationTitle = await this.resolveGeneratedTitleForTurn({
        conversationId,
        titleWasPlaceholder,
      });

      const governanceBlock = this.resolveGovernancePolicyBlock(req);
      if (governanceBlock) {
        if (sink.isOpen()) {
          sink.write({
            event: "worklog",
            data: {
              eventType: "POLICY_BLOCK",
              summary: governanceBlock.code,
              t: Date.now(),
            },
          } as any);
        }
        const result = await this.buildGovernanceBlockedResult({
          req,
          conversationId,
          userMessage,
          code: governanceBlock.code,
          text: governanceBlock.text,
          status: governanceBlock.status,
        });
        await this.persistTraceArtifacts({
          traceId,
          req,
          conversationId: result.conversationId,
          userMessageId: result.userMessageId,
          assistantMessageId: result.assistantMessageId,
          retrievalPack,
          evidenceGateDecision,
          answerMode: result.answerMode || answerMode,
          status: result.status || "blocked",
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
            "[trace-writer] failed to persist stream governance-policy trace",
            {
              traceId,
              error:
                persistError instanceof Error
                  ? persistError.message
                  : String(persistError),
            },
          );
        });
        return this.withGeneratedConversationTitle(
          { ...result, traceId },
          generatedConversationTitle,
        );
      }

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
      retrievalPack = await this.retrieveEvidence(req, lastDocumentId, {
        traceId,
        conversationId,
      });
      retrievalMs = Date.now() - retrievalStartedAt;

      // Persist resolved doc for conversation-history follow-up scoping
      const resolvedDocId = retrievalPack?.resolvedDocId ?? null;
      await this.persistResolvedDocScope({
        traceId,
        conversationId,
        previousDocId: lastDocumentId,
        resolvedDocId,
        stream: true,
      });

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
      const answerClass: AnswerClass = resolveAnswerClassFromMode(answerMode);
      const navType: NavType = null;

      const sourceButtonsAttachment = this.buildSourceButtonsAttachment(
        retrievalPack,
        req.preferredLanguage,
      );
      const sources: ChatSourceEntry[] = ensureFallbackSourceCoverage({
        sources: buildSourcesFromEvidence(retrievalPack?.evidence ?? []),
        answerMode,
        attachedDocumentIds: req.attachedDocumentIds || [],
        retrievalPack,
      });
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
          status:
            bypass.failureCode === "EVIDENCE_NEEDS_CLARIFICATION"
              ? "clarification_required"
              : "partial",
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
        return this.withGeneratedConversationTitle(
          result,
          generatedConversationTitle,
        );
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

      const fallbackSignal = this.resolveFallbackSignal(req, retrievalPack);
      const fallbackReasonCode = fallbackSignal.reasonCode;
      const streamSpanId = this.traceWriter.startSpan(traceId, "stream");
      const llmStartedAt = Date.now();
      const streamed = await this.engine.stream({
        traceId,
        userId: req.userId,
        conversationId,
        messages,
        evidencePack: toEngineEvidencePack(retrievalPack),
        context: this.buildRuntimeContext(req, retrievalPack, answerMode),
        meta: this.buildRuntimeMeta(
          req,
          retrievalPack,
          answerMode,
          evidenceGateDecision,
          fallbackSignal,
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
      const fallbackMicrocopyParams = buildFallbackMicrocopyParams({
        reasonCode: fallbackReasonCode,
        query: req.message,
        retrievalPack,
        attachedDocumentIds: req.attachedDocumentIds || [],
      });
      const assistantTextBase =
        assistantTextRaw ||
        buildEmptyAssistantText({
          language: req.preferredLanguage,
          reasonCode: fallbackReasonCode,
          seed: `${conversationId}:stream:${fallbackReasonCode || "empty_model_response"}`,
          context: fallbackMicrocopyParams.context,
          routeHints: fallbackMicrocopyParams.routeHints,
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
        const sourceInvariantMicrocopy = buildFallbackMicrocopyParams({
          reasonCode: sourceInvariantFailureCode,
          query: req.message,
          retrievalPack,
          attachedDocumentIds: req.attachedDocumentIds || [],
        });
        assistantText = buildEmptyAssistantText({
          language: req.preferredLanguage,
          reasonCode: sourceInvariantFailureCode,
          seed: `${req.userId}:sources:${sourceInvariantFailureCode}`,
          context: sourceInvariantMicrocopy.context,
          routeHints: sourceInvariantMicrocopy.routeHints,
        });
      }
      const assistantTelemetry =
        (streamed.telemetry as Record<string, unknown>) ?? {};
      if (finalized.provenanceTelemetry) {
        assistantTelemetry.provenance = finalized.provenanceTelemetry;
      }
      const persistedAssistantTelemetry =
        Object.keys(assistantTelemetry).length > 0 ? assistantTelemetry : null;

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
        telemetry: persistedAssistantTelemetry,
        metadata: {
          sources: filteredSources,
          answerMode,
          answerClass,
          navType,
          fallbackReasonCode,
          fallbackTelemetry: fallbackSignal.telemetryReasonCode
            ? {
                reasonCode: fallbackSignal.telemetryReasonCode,
              }
            : null,
          fallbackPolicy: fallbackSignal.policyMeta || null,
              evidenceGate: evidenceGateDecision
                ? {
                    action: evidenceGateDecision.suggestedAction,
                    strength: evidenceGateDecision.evidenceStrength,
                  }
                : null,
              enforcement: finalized.enforcement ?? null,
              provenance: finalized.provenance ?? null,
              provenanceTelemetry: finalized.provenanceTelemetry ?? null,
              qualityGates: finalized.qualityGates,
              failureCode:
                finalized.failureCode || sourceInvariantFailureCode || null,
              userWarning: finalized.userWarning || null,
              warnings: Array.isArray(finalized.warnings)
                ? finalized.warnings
                : [],
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
        finalized.failureCode ||
        sourceInvariantFailureCode ||
        !assistantTextRaw ||
        (Array.isArray(finalized.warnings) && finalized.warnings.length > 0)
          ? "partial"
          : "success";
      const failureCode =
        finalized.failureCode ||
        sourceInvariantFailureCode ||
        (assistantTextRaw ? null : "EMPTY_MODEL_RESPONSE");
      const warnings = Array.isArray(finalized.warnings) ? finalized.warnings : [];
      const userWarning = finalized.userWarning || warnings[0] || null;

      const result: ChatResult = {
        conversationId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        traceId,
        assistantText,
        attachmentsPayload,
        assistantTelemetry: persistedAssistantTelemetry ?? undefined,
        provenance: finalized.provenance,
        sources: [...filteredSources],
        followups: finalized.followups,
        answerMode,
        answerClass,
        navType,
        fallbackReasonCode,
        status,
        failureCode,
        qualityGates: finalized.qualityGates,
        userWarning,
        warnings,
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
        fallbackReasonCodeTelemetry: fallbackSignal.telemetryReasonCode,
        fallbackPolicyMeta: fallbackSignal.policyMeta || null,
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
        provenanceTelemetry: finalized.provenanceTelemetry ?? null,
        truncation,
      }).catch((error) => {
        appLogger.warn("[trace-writer] failed to persist stream trace", {
          traceId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      return this.withGeneratedConversationTitle(
        result,
        generatedConversationTitle,
      );
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
      return this.withGeneratedConversationTitle(
        result,
        generatedConversationTitle,
      );
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
        OR: [{ contextType: null }, { contextType: { notIn: ["viewer", "editor"] } }],
        NOT: [
          { title: { startsWith: "__viewer__:" } },
          { title: { startsWith: "__editor__:" } },
        ],
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
    await this.assertConversationAccessForWrite(params.userId, params.conversationId);
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
      const saved = await this.encryptedRepo.saveMessageWithMetadata({
        userId: params.userId,
        conversationId: params.conversationId,
        role: params.role,
        plaintext: params.content ?? "",
        metadataJson,
        updatedAt: now,
      });

      await this.maybeAutoTitleConversationFromFirstUserMessage({
        conversationId: params.conversationId,
        role: params.role,
        content: params.content ?? "",
        now,
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

    const created = await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
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

      await tx.conversation.update({
        where: { id: params.conversationId },
        data: { updatedAt: now },
      });

      return message;
    });

    await this.maybeAutoTitleConversationFromFirstUserMessage({
      conversationId: params.conversationId,
      role: params.role,
      content: params.content ?? "",
      now,
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

  private async assertConversationAccessForWrite(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const row = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!row) {
      throw new ConversationNotFoundError(
        "Conversation not found for this account.",
      );
    }
  }

  private async maybeAutoTitleConversationFromFirstUserMessage(input: {
    conversationId: string;
    role: ChatRole;
    content: string;
    now: Date;
  }): Promise<void> {
    if (input.role !== "user") return;

    const titleCandidate = deriveAutoConversationTitleFromMessage(input.content, {
      maxWords: 10,
      maxChars: 80,
    });
    if (!titleCandidate) return;

    const existing = await prisma.conversation.findFirst({
      where: {
        id: input.conversationId,
        isDeleted: false,
      },
      select: {
        title: true,
      },
    });
    if (!existing || !isPlaceholderConversationTitle(existing.title)) return;

    await prisma.conversation.updateMany({
      where: {
        id: input.conversationId,
        isDeleted: false,
        ...(existing.title === null ? { title: null } : { title: existing.title }),
      },
      data: {
        title: titleCandidate,
        updatedAt: input.now,
      },
    });
  }

  private async resolveGeneratedTitleForTurn(input: {
    conversationId: string;
    titleWasPlaceholder: boolean;
  }): Promise<string | null> {
    if (!input.titleWasPlaceholder) return null;
    const row = await prisma.conversation.findFirst({
      where: { id: input.conversationId, isDeleted: false },
      select: { title: true },
    });
    const title = String(row?.title || "").trim();
    if (!title || isPlaceholderConversationTitle(title)) return null;
    return title;
  }

  private withGeneratedConversationTitle(
    result: ChatResult,
    generatedTitle: string | null,
  ): ChatResult {
    if (!generatedTitle) return result;
    return {
      ...result,
      generatedTitle,
    };
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
    const value = String(text || "").trim();
    if (!value) return text;

    const isSemanticallyComplete = (candidate: string): boolean => {
      const semantic = classifyVisibleTruncation({
        finalText: candidate,
        providerTruncation: { occurred: true, reason: finishReason },
      });
      return !semantic.occurred;
    };

    const normalizeCandidate = (candidate: string): string => {
      let normalized = String(candidate || "").trim();
      if (!normalized) return "";
      normalized = normalized
        .replace(/\s+$/g, "")
        .replace(/[\s"'`([{]+$/g, "")
        .trim();
      if (!normalized) return "";
      if (/[,:;\-/\\]$/.test(normalized)) {
        normalized = normalized.slice(0, -1).trim();
      }
      if (!normalized) return "";
      if (
        !/[.!?。！？]$/.test(normalized) &&
        !/^\|.*\|$/.test(normalized) &&
        !/^[-*]\s+\S+/.test(normalized) &&
        !/^\d+\.\s+\S+/.test(normalized)
      ) {
        normalized = `${normalized}.`;
      }
      return normalized;
    };

    if (isSemanticallyComplete(value)) return value;

    const candidates: string[] = [];
    const seen = new Set<string>();
    const minLen = Math.max(24, Math.floor(value.length * 0.3));
    const addCandidate = (candidate: string) => {
      const normalized = normalizeCandidate(candidate);
      if (!normalized) return;
      if (normalized.length < minLen) return;
      if (seen.has(normalized)) return;
      seen.add(normalized);
      candidates.push(normalized);
    };

    const sentenceBoundaryIndexes: number[] = [];
    for (let i = 0; i < value.length; i += 1) {
      const char = value[i];
      if (char === "." || char === "!" || char === "?" || char === "。") {
        sentenceBoundaryIndexes.push(i);
      }
    }
    for (let i = sentenceBoundaryIndexes.length - 1; i >= 0; i -= 1) {
      const index = sentenceBoundaryIndexes[i];
      addCandidate(value.slice(0, index + 1));
    }

    const lastNewline = value.lastIndexOf("\n");
    if (lastNewline > value.length * 0.35) {
      addCandidate(value.slice(0, lastNewline));
    }

    const inlineListStart = value.search(/\s(?:[-*]|\d+\.)\s+/);
    if (inlineListStart > value.length * 0.35) {
      addCandidate(value.slice(0, inlineListStart));
    }

    const clauseIndex = Math.max(value.lastIndexOf(":"), value.lastIndexOf(";"));
    if (clauseIndex > value.length * 0.35) {
      addCandidate(value.slice(0, clauseIndex));
    }

    for (const candidate of candidates) {
      if (isSemanticallyComplete(candidate)) return candidate;
    }
    // If no better boundary is found, keep as-is rather than forcing a bad rewrite
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
    enforcementRepairs?: string[] | null,
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
      enforcementRepairs: enforcementRepairs ?? [],
      providerTruncation: { occurred: true, reason: finishReason },
    });
    if (!semantic.occurred) return text;

    const tableLines = lines.filter((line) => line.includes("|"));
    // Preserve non-table output even when provider reports length overflow.
    // A generic replacement here causes repetitive low-information answers.
    if (!tableLines.length) return text;

    const separatorOnly = (line: string): boolean =>
      /^[:\-\|\s]+$/.test(line.replace(/\|/g, ""));
    const contentRows = tableLines.filter((line) => !separatorOnly(line));
    const incompleteTable =
      contentRows.length <= 1 || /\|\s*$/.test(value) || lines.length < 3;
    if (!incompleteTable) return text;

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

    const base = narrative.length >= 60 ? narrative : narrative || fallback;
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

    const desiredCount =
      1 + (hashSeed(`${req.userId}:${req.message}:${answerMode}`) % 3);
    return followups.slice(0, Math.max(1, Math.min(3, desiredCount)));
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
    provenanceTelemetry?: ProvenanceRuntimeTelemetry | null;
    failureCode?: string | null;
    qualityGateIssues: string[];
    qualityGates: ChatQualityGateState;
    userWarning?: ChatWarningState | null;
    warnings?: ChatWarningState[];
  }> {
    let text = params.assistantText;
    let failureCode: string | null = null;
    let provenanceTelemetry: ProvenanceRuntimeTelemetry | null = null;
    const preferredLanguage = normalizeChatLanguage(params.req.preferredLanguage);
    const warningPayloadEnabled = isRuntimeFlagEnabled(
      "CHAT_RUNTIME_WARNING_PAYLOAD_ENABLED",
      true,
    );
    const failSoftWarningsEnabled = isRuntimeFlagEnabled(
      "CHAT_RUNTIME_FAIL_SOFT_WARNINGS",
      false,
    );
    const warningByCode = new Map<string, ChatWarningState>();
    const addWarning = (params: {
      code: string;
      severity?: "warning" | "error";
      source?: ChatWarningState["source"];
    }) => {
      if (!warningPayloadEnabled) return;
      const code = String(params.code || "").trim();
      if (!code) return;
      const entry = buildWarningEntry({
        code,
        language: preferredLanguage,
        severity: params.severity,
        source: params.source,
      });
      const existing = warningByCode.get(code);
      if (!existing) {
        warningByCode.set(code, entry);
        return;
      }
      if (existing.severity !== "error" && entry.severity === "error") {
        warningByCode.set(code, entry);
      }
    };
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
    let qualityGateIssues: string[] = [];
    let qualityGates: ChatQualityGateState = { allPassed: true, failed: [] };
    const enforceQualityGates = isRuntimeFlagEnabled(
      "QUALITY_GATES_ENFORCING",
      true,
    );
    const qualityGateSeverityByName = resolveQualityGateSeverityMap();
    try {
      const qualityRunner = new QualityGateRunnerService();
      const contextSignals = asObject(
        (params.req.context as Record<string, unknown> | null)?.signals ?? null,
      );
      const gateCtx: QualityGateContext = {
        answerMode: params.answerMode,
        answerClass: params.answerClass,
        operator: String((params.req.meta as any)?.operator || "")
          .trim()
          .toLowerCase(),
        intentFamily: String((params.req.meta as any)?.intentFamily || "")
          .trim()
          .toLowerCase(),
        language: normalizeChatLanguage(params.req.preferredLanguage),
        evidenceItems: params.retrievalPack?.evidence.map((e) => ({
          snippet: e.snippet,
          docId: e.docId,
        })),
        docLockEnabled:
          Boolean(params.retrievalPack?.scope?.explicitDocLock) ||
          (params.req.attachedDocumentIds || []).length > 0,
        discoveryMode:
          Boolean(contextSignals.discoveryQuery) ||
          String(params.answerMode || "")
            .trim()
            .toLowerCase() === "nav_pills",
        requiresClarification:
          Boolean(contextSignals.requiresClarification) ||
          String(params.answerMode || "")
            .trim()
            .toLowerCase() === "rank_disambiguate",
        explicitDocRef:
          Boolean(contextSignals.explicitDocRef) ||
          Boolean(contextSignals.explicitDocLock) ||
          (params.req.attachedDocumentIds || []).length === 1,
        sourceButtonsCount: sourceDocumentIdsFromSources.length,
        userRequestedShort: params.req.truncationRetry === true,
      };
      const gateResult = await qualityRunner.runGates(text, gateCtx);
      if (!gateResult.allPassed) {
        const failedGates = gateResult.results
          .filter((r) => !r.passed)
          .map((gate) => toQualityGateFailure(gate, qualityGateSeverityByName));
        qualityGateIssues = failedGates.map((gate) => gate.gateName);
        qualityGates = {
          allPassed: false,
          failed: failedGates,
        };
        appLogger.debug("[finalizeChatTurn] Quality gate issues", {
          issues: qualityGateIssues,
        });
        if (enforceQualityGates && !failureCode) {
          const blockingGate = failedGates.find(
            (gate) => gate.severity === "block",
          );
          if (blockingGate) {
            const reasonCode = "quality_gate_blocked";
            const failureMode = resolveRuntimeFailureMode(
              reasonCode,
              failSoftWarningsEnabled,
            );
            if (failureMode === "fail_closed") {
              failureCode = reasonCode;
              text = buildEmptyAssistantText({
                language: params.req.preferredLanguage,
                reasonCode: failureCode,
                seed: `${params.req.userId}:quality_gate:${blockingGate.gateName}`,
              });
            } else {
              addWarning({
                code: reasonCode,
                source: "quality_gate",
                severity: "warning",
              });
            }
          }
        }
      }
    } catch (error) {
      appLogger.warn("[finalizeChatTurn] Quality gate runner error", {
        error: error instanceof Error ? error.message : String(error),
      });
      if (enforceQualityGates && !failureCode) {
        const reasonCode = "quality_gate_runner_error";
        const failureMode = resolveRuntimeFailureMode(
          reasonCode,
          failSoftWarningsEnabled,
        );
        if (failureMode === "fail_closed") {
          failureCode = reasonCode;
          text = buildEmptyAssistantText({
            language: params.req.preferredLanguage,
            reasonCode,
            seed: `${params.req.userId}:quality_gate:${reasonCode}`,
          });
        } else {
          addWarning({
            code: reasonCode,
            source: "quality_gate",
            severity: "warning",
          });
        }
        qualityGates = {
          allPassed: false,
          failed: [
            {
              gateName: reasonCode,
              severity: "block",
              reason: error instanceof Error ? error.message : String(error),
            },
          ],
        };
        qualityGateIssues = [reasonCode];
      }
    }

    // 3. Run response contract enforcer (format repair, strip leakage, length limits)
    let enforcement: { repairs: string[]; warnings: string[] } | undefined;
    try {
      const enforcer = getResponseContractEnforcer();
      const evidenceMap = buildEvidenceMapForEnforcer(params.retrievalPack);
      const reqSignals = asObject(
        (params.req.context as Record<string, unknown> | null)?.signals ?? null,
      );
      const retrievalSummary = asObject(
        asObject(asObject(params.retrievalPack).telemetry).summary,
      );
      const classifiedDomain =
        String(retrievalSummary.classifiedDomain || "")
          .trim()
          .toLowerCase() || null;
      const styleSignals = this.buildFormattingStyleSignals(
        params.req,
        params.answerMode,
      );
      const operatorFamily =
        String(
          (params.req.meta as any)?.operatorFamily ||
            reqSignals.operatorFamily ||
            "",
        )
          .trim()
          .toLowerCase() || null;
      const queryProfile = String((params.req.meta as any)?.queryProfile || "")
        .trim()
        .toLowerCase();
      const enforceStructuredAnswerRaw = (params.req.meta as any)
        ?.enforceStructuredAnswer;
      const enforceStructuredAnswer =
        enforceStructuredAnswerRaw === true ||
        String(enforceStructuredAnswerRaw || "")
          .trim()
          .toLowerCase() === "true";
      const mergedSignals = {
        ...reqSignals,
        ...(styleSignals || {}),
        ...(operatorFamily ? { operatorFamily } : {}),
        ...(queryProfile ? { queryProfile } : {}),
        ...(enforceStructuredAnswer ? { enforceStructuredAnswer: true } : {}),
        ...(classifiedDomain ? { classifiedDomain } : {}),
      };
      const sourceButtonsAttachment = this.buildSourceButtonsAttachment(
        params.retrievalPack,
        params.req.preferredLanguage,
      );
      const reqMeta = asObject(params.req.meta);
      const reqContext = asObject(params.req.context);
      const metaEnvelope = asObject(reqMeta.uiEnvelope);
      const contextEnvelope = asObject(reqContext.uiEnvelope);
      const signalEnvelope = asObject(reqSignals.uiEnvelope);
      const uiEnvelope =
        Object.keys(metaEnvelope).length > 0
          ? metaEnvelope
          : Object.keys(contextEnvelope).length > 0
            ? contextEnvelope
            : signalEnvelope;
      const receipts = Array.isArray(uiEnvelope.receipts)
        ? uiEnvelope.receipts
        : undefined;
      const renderPlan = asObject(uiEnvelope.renderPlan);
      const editPlan = asObject(uiEnvelope.editPlan);
      const undoToken = String(uiEnvelope.undoToken || "").trim() || undefined;
      const enforcerCtx: ResponseContractContext = {
        answerMode: params.answerMode,
        language: normalizeChatLanguage(params.req.preferredLanguage),
        operator: String((params.req.meta as any)?.operator || "")
          .trim()
          .toLowerCase(),
        intentFamily: String((params.req.meta as any)?.intentFamily || "")
          .trim()
          .toLowerCase(),
        operatorFamily: operatorFamily || undefined,
        evidenceRequired: provenance.required,
        allowedDocumentIds: params.req.attachedDocumentIds || [],
        provenance,
        evidenceMapSchemaVersion: "v1",
        evidenceMap,
        provenanceFailOpenWithEvidence: this.provenanceUserFailOpenWithEvidence,
        signals: mergedSignals,
        constraints: {
          maxOutputTokens: requestedMaxOutputTokens ?? undefined,
          hardMaxOutputTokens: requestedMaxOutputTokens
            ? Math.ceil(requestedMaxOutputTokens * 1.25)
            : undefined,
          expectedOutputTokens: observedOutputTokens ?? undefined,
          userRequestedShort: params.req.truncationRetry === true || undefined,
        },
      };
      const enforced = enforcer.enforce(
        {
          content: text,
          attachments: sourceButtonsAttachment
            ? ([sourceButtonsAttachment] as any[])
            : [],
          ...(receipts ? { receipts } : {}),
          ...(Object.keys(renderPlan).length > 0 ? { renderPlan } : {}),
          ...(Object.keys(editPlan).length > 0 ? { editPlan } : {}),
          ...(undoToken ? { undoToken } : {}),
        },
        enforcerCtx,
      );
      if (enforced.enforcement.provenance) {
        provenanceTelemetry = {
          ...enforced.enforcement.provenance,
          stage: "enforcer",
        };
      }
      if (enforced.enforcement.blocked && enforced.enforcement.reasonCode) {
        appLogger.warn("[finalizeChatTurn] Response blocked by enforcer", {
          reasonCode: enforced.enforcement.reasonCode,
        });
        const reasonCode = enforced.enforcement.reasonCode;
        const failureMode = resolveRuntimeFailureMode(
          reasonCode,
          failSoftWarningsEnabled,
        );
        if (failureMode === "fail_closed") {
          failureCode = reasonCode;
          text =
            enforced.content ||
            buildEmptyAssistantText({
              language: params.req.preferredLanguage,
              reasonCode,
              seed: `${params.req.userId}:enforcer:${reasonCode}`,
            });
        } else {
          if (String(enforced.content || "").trim()) {
            text = enforced.content;
          }
          addWarning({
            code: reasonCode,
            source: "enforcer",
            severity: "warning",
          });
        }
      } else {
        text = enforced.content;
      }
      enforcement = {
        repairs: enforced.enforcement.repairs,
        warnings: enforced.enforcement.warnings,
      };
      if (
        (enforcement.warnings || []).some((warning) =>
          String(warning || "")
            .trim()
            .toLowerCase()
            .includes("table_contract_violation"),
        )
      ) {
        addWarning({
          code: "table_contract_violation",
          source: "enforcer",
          severity: "warning",
        });
      }
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
      const failureMode = resolveRuntimeFailureMode(
        reasonCode,
        failSoftWarningsEnabled,
      );
      if (failureMode === "fail_closed") {
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
      } else {
        addWarning({
          code: reasonCode,
          source: "enforcer",
          severity: "warning",
        });
        enforcement = {
          repairs: [],
          warnings: ["ENFORCER_RUNTIME_ERROR_FAIL_OPEN"],
        };
      }
    }

    if (!failureCode) {
      text = this.repairProviderOverflowStructuredOutput(
        text,
        (params.telemetry as Record<string, unknown>) ?? null,
        params.req.preferredLanguage,
        enforcement?.repairs ?? null,
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
        ...revalidatedProvenance,
        validated: revalidated.ok,
        failureCode: revalidated.failureCode,
        sourceDocumentIds:
          revalidatedProvenance.sourceDocumentIds.length > 0
            ? revalidatedProvenance.sourceDocumentIds
            : sourceDocumentIdsFromSources,
      };
      if (!revalidated.ok) {
        failureCode = revalidated.failureCode;
        text = buildEmptyAssistantText({
          language: params.req.preferredLanguage,
          reasonCode: revalidated.failureCode,
          seed: `${params.req.userId}:provenance:${revalidated.failureCode}:${params.req.conversationId || Date.now()}`,
        });
      }
    }

    const queryProfileHint = String((params.req.meta as any)?.queryProfile || "")
      .trim()
      .toLowerCase();
    const enforceStructuredAnswerHint =
      (params.req.meta as any)?.enforceStructuredAnswer === true ||
      String((params.req.meta as any)?.enforceStructuredAnswer || "")
        .trim()
        .toLowerCase() === "true";
    const isAnalyticalResponse =
      queryProfileHint === "analytical" || enforceStructuredAnswerHint;
    const isDocGroundedMode = String(params.answerMode || "").startsWith(
      "doc_grounded",
    );
    const languageContract = enforceLanguageContract({
      text,
      preferredLanguage: params.req.preferredLanguage,
      allowFailClosed: !(isAnalyticalResponse || isDocGroundedMode),
    });
    if (languageContract.adjusted) {
      appLogger.warn("[finalizeChatTurn] language_contract_adjusted", {
        requestId: this.resolveTraceId(params.req),
        preferredLanguage: normalizeChatLanguage(params.req.preferredLanguage),
        failClosed: languageContract.failClosed,
      });
      text = languageContract.text;
      if (languageContract.failClosed && !failureCode) {
        failureCode = "language_contract_mismatch";
      }
    }

    if (failureCode) {
      addWarning({
        code: failureCode,
        source: "runtime",
        severity: isHardFailClosedReason(failureCode) ? "error" : "warning",
      });
    }
    const warnings = warningPayloadEnabled
      ? Array.from(warningByCode.values())
      : [];
    const userWarning = warningPayloadEnabled
      ? warnings.find((entry) => entry.severity === "error") || warnings[0] || null
      : null;

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
      provenanceTelemetry,
      failureCode,
      qualityGateIssues,
      qualityGates,
      userWarning,
      warnings,
    };
  }

  private async ensureConversation(
    userId: string,
    conversationId?: string,
  ): Promise<{ id: string; title: string | null; lastDocumentId: string | null }> {
    if (conversationId) {
      const existing = await prisma.conversation.findFirst({
        where: { id: conversationId, userId, isDeleted: false },
        select: { id: true, title: true, lastDocumentId: true },
      });
      if (existing)
        return {
          id: existing.id,
          title: existing.title ?? null,
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
    return { id: created.id, title: created.title ?? null, lastDocumentId: null };
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
    const answerClass: AnswerClass = resolveAnswerClassFromMode(answerMode);
    const warning = buildWarningEntry({
      code: input.code,
      language: normalizeChatLanguage(req.preferredLanguage),
      severity: "error",
      source: "runtime",
    });

    const assistantMessage = await this.createMessage({
      conversationId,
      role: "assistant",
      content: assistantText,
      userId: req.userId,
      metadata: {
        failureCode: input.code,
        answerMode,
        answerClass,
        userWarning: warning,
        warnings: [warning],
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
      userWarning: warning,
      warnings: [warning],
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

  private resolveGovernancePolicyBlock(req: ChatRequest): {
    code: string;
    text: string;
    status: "blocked" | "clarification_required";
  } | null {
    const compliance = this.compliancePolicy.decide({
      meta: asObject(req.meta),
      context: asObject(req.context),
    });
    if (compliance.blocked) {
      return {
        code: String(compliance.reasonCode || "compliance_blocked"),
        text:
          String(compliance.message || "").trim() ||
          buildEmptyAssistantText({
            language: req.preferredLanguage,
            reasonCode: "compliance_blocked",
            seed: `${req.userId}:compliance_blocked`,
          }),
        status: "blocked",
      };
    }

    const refusal = this.refusalPolicy.decide({
      meta: asObject(req.meta),
      context: asObject(req.context),
    });
    if (refusal.blocked) {
      return {
        code: "policy_refusal_required",
        text: this.refusalPolicy.buildUserFacingText({
          decision: refusal,
          preferredLanguage: req.preferredLanguage,
        }),
        status: "blocked",
      };
    }

    return null;
  }

  private async buildGovernanceBlockedResult(input: {
    req: ChatRequest;
    conversationId: string;
    userMessage: ChatMessageDTO | null;
    code: string;
    text: string;
    status: "blocked" | "clarification_required";
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

    const answerMode: AnswerMode =
      (req.attachedDocumentIds || []).length > 0
        ? "help_steps"
        : "general_answer";
    const answerClass: AnswerClass = resolveAnswerClassFromMode(answerMode);
    const warning = buildWarningEntry({
      code: input.code,
      language: normalizeChatLanguage(req.preferredLanguage),
      severity: "error",
      source: "runtime",
    });

    const assistantMessage = await this.createMessage({
      conversationId,
      role: "assistant",
      content: input.text,
      userId: req.userId,
      metadata: {
        failureCode: input.code,
        answerMode,
        answerClass,
        userWarning: warning,
        warnings: [warning],
      },
    });

    return {
      conversationId,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      assistantText: input.text,
      attachmentsPayload: [],
      assistantTelemetry: undefined,
      sources: [],
      followups: [],
      answerMode,
      answerClass,
      navType: null,
      fallbackReasonCode: input.code,
      status: input.status,
      failureCode: input.code,
      userWarning: warning,
      warnings: [warning],
      completion: {
        answered: false,
        missingSlots: [input.code],
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
    const useRecentHistoryWindow = isRuntimeFlagEnabled(
      "RECENT_HISTORY_ORDER_V2",
      true,
    );

    let recent: Array<{ role: ChatRole; content: string }>;
    if (this.encryptedContext) {
      recent = await this.encryptedContext.buildLLMContext(
        userId,
        conversationId,
        safeLimit,
        useRecentHistoryWindow,
      );
    } else {
      const rows = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: useRecentHistoryWindow ? "desc" : "asc" },
        take: safeLimit,
        select: {
          role: true,
          content: true,
        },
      });
      const orderedRows = useRecentHistoryWindow ? [...rows].reverse() : rows;
      recent = orderedRows.map((row) => ({
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
        const nextMemorySummary = cfg.defaultStateSummary;

        const nextMemory = {
          ...priorMemory,
          summary: nextMemorySummary,
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
        if (policyConfig.privacy.debugTracesNotPersisted) {
          delete (nextMemory as any).debugTraces;
        }
        const structuralHints = new Set(
          (policyConfig.privacy.persistOnlyStructuralHints || []).map((item) =>
            String(item || "").trim(),
          ),
        );
        if (structuralHints.size > 0) {
          const sensitiveKeys = [
            "rawUserTextHistory",
            "fullRetrievedChunks",
            "debugTraces",
            "numericSnapshots",
            "rawNumbers",
          ];
          for (const key of sensitiveKeys) {
            if (!structuralHints.has(key)) {
              delete (nextMemory as any)[key];
            }
          }
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
            summary: nextMemorySummary,
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

  private async generateRetrievalPlanForEvidence(params: {
    req: ChatRequest;
    runtimeCtx?: { traceId?: string | null; conversationId?: string | null };
    intentFamily: string;
    operator: string | null;
    answerMode: RetrievalRequest["signals"]["answerMode"];
    docScopeSignals: Pick<
      RetrievalRequest["signals"],
      | "docScopeLock"
      | "explicitDocLock"
      | "activeDocId"
      | "explicitDocRef"
      | "resolvedDocId"
      | "hardScopeActive"
      | "singleDocIntent"
    >;
    semanticSignals: ReturnType<CentralizedChatRuntimeDelegate["collectSemanticSignals"]>;
    allowGlobalScope: boolean;
    attachedDocumentIds: string[];
    docStore: {
      getDocMeta(docId: string): Promise<{
        title?: string | null;
        filename?: string | null;
      } | null>;
    };
  }): Promise<RetrievalPlan | null> {
    if (typeof this.engine.generateRetrievalPlan !== "function") return null;

    const traceId =
      sanitizeTraceId(params.runtimeCtx?.traceId) ||
      sanitizeTraceId((params.req.meta as any)?.requestId) ||
      sanitizeTraceId((params.req.meta as any)?.httpRequestId) ||
      mkTraceId();
    const conversationId = String(
      params.runtimeCtx?.conversationId || params.req.conversationId || "",
    ).trim();

    const knownDocTitles: string[] = [];
    const seenDocTitle = new Set<string>();
    for (const docId of params.attachedDocumentIds.slice(0, 8)) {
      const meta = await params.docStore.getDocMeta(docId);
      const candidates = [meta?.title, meta?.filename];
      for (const candidate of candidates) {
        const text = String(candidate || "").trim();
        if (!text) continue;
        const key = text.toLowerCase();
        if (seenDocTitle.has(key)) continue;
        seenDocTitle.add(key);
        knownDocTitles.push(text);
        if (knownDocTitles.length >= 8) break;
      }
      if (knownDocTitles.length >= 8) break;
    }

    try {
      const plannerTimeoutMs = Math.max(
        2000,
        Number(process.env.RETRIEVAL_PLAN_TIMEOUT_MS || 12000),
      );
      const generated = await Promise.race([
        this.engine.generateRetrievalPlan({
          traceId,
          userId: params.req.userId,
          conversationId: conversationId || "retrieval_planning",
          messages: [
            { role: "user", content: String(params.req.message || "") },
          ],
          context: {
            planner: {
              scope: {
                hard: params.docScopeSignals.hardScopeActive === true,
                explicitDocLock:
                  params.docScopeSignals.explicitDocLock === true,
                activeDocId: params.docScopeSignals.activeDocId ?? null,
                resolvedDocId: params.docScopeSignals.resolvedDocId ?? null,
                allowGlobalScope: params.allowGlobalScope,
              },
              docContext: {
                attachedDocumentIds: params.attachedDocumentIds.slice(0, 16),
                knownDocTitles,
              },
              runtimeSignals: params.semanticSignals,
            },
          },
          meta: {
            intentFamily: params.intentFamily,
            operator: params.operator,
            answerMode: params.answerMode,
            purpose: "retrieval_planning",
            promptMode: "retrieval_plan",
          },
        }),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error("retrieval_plan_timeout")),
            plannerTimeoutMs,
          );
        }),
      ]);

      const parsed = this.retrievalPlanParser.tryParse(String(generated.text || ""));
      if (!parsed) {
        appLogger.warn("[retrieval-plan] planner returned invalid JSON plan", {
          traceId,
          userId: params.req.userId,
          conversationId: conversationId || null,
        });
        return null;
      }
      return parsed;
    } catch (error) {
      appLogger.warn("[retrieval-plan] planner invocation failed", {
        traceId,
        userId: params.req.userId,
        conversationId: conversationId || null,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async retrieveEvidence(
    req: ChatRequest,
    lastDocumentId?: string | null,
    runtimeCtx?: { traceId?: string | null; conversationId?: string | null },
  ): Promise<(EvidencePack & { resolvedDocId: string | null }) | null> {
    const cfg = this.getMemoryRuntimeTuning();
    const attachedBase = Array.isArray(req.attachedDocumentIds)
      ? req.attachedDocumentIds.filter(
          (id) => typeof id === "string" && id.trim(),
        )
      : [];
    const contextSignals = asObject((req.context as any)?.signals || {});
    // Auto-detect follow-up from conversation history: if a prior document was
    // resolved in this conversation, the current turn is a follow-up.
    if (contextSignals.isFollowup == null && lastDocumentId) {
      contextSignals.isFollowup = true;
      contextSignals.activeDocId =
        contextSignals.activeDocId || lastDocumentId;
    }
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

    const intentFamily =
      typeof (req.meta as any)?.intentFamily === "string"
        ? String((req.meta as any).intentFamily)
        : "documents";
    const operator =
      typeof (req.meta as any)?.operator === "string"
        ? String((req.meta as any).operator)
        : null;
    const answerMode = coerceRetrievalAnswerMode((req.meta as any)?.answerMode);
    const retrievalPlan = await this.generateRetrievalPlanForEvidence({
      req,
      runtimeCtx,
      intentFamily,
      operator,
      answerMode,
      docScopeSignals,
      semanticSignals,
      allowGlobalScope,
      attachedDocumentIds: attached,
      docStore: dependencies.docStore,
    });
    const queryFamily =
      typeof (req.meta as any)?.queryFamily === "string"
        ? String((req.meta as any).queryFamily)
        : intentFamily;
    const explicitDomainHint =
      typeof contextSignals.domainHint === "string"
        ? String(contextSignals.domainHint)
        : typeof (req.meta as any)?.domainId === "string"
          ? String((req.meta as any).domainId)
          : typeof (req.meta as any)?.domain === "string"
            ? String((req.meta as any).domain)
            : null;
    const explicitDocTypeId =
      typeof contextSignals.docTypeId === "string"
        ? String(contextSignals.docTypeId)
        : typeof (req.meta as any)?.docTypeId === "string"
          ? String((req.meta as any).docTypeId)
          : null;

    let selectedBankIds: string[] | null = null;
    let selectedBankVersionMap: Record<string, string> | null = null;
    let selectedDomainHint: string | null = explicitDomainHint;
    let bankSelectionReasons: string[] = [];
    let dependencyExpandedBankIds: string[] = [];

    if (process.env.BANK_SELECTION_PLANNER_ENABLED !== "false") {
      try {
        const [selectionModule, domainPackModule] = await Promise.all([
          import("../../../services/core/banks/bankSelectionPlanner.service"),
          import("../../../services/core/banks/domainPackLoader.service"),
        ]);

        const selectionPlanner =
          selectionModule.getBankSelectionPlannerInstance();
        const selection = selectionPlanner.plan({
          query: req.message,
          domainId: explicitDomainHint,
          docTypeId: explicitDocTypeId,
          queryFamily,
          intentId: intentFamily,
          locale: detectedLanguage,
          operator,
          userId: req.userId,
          workspaceId:
            typeof contextSignals.workspaceId === "string"
              ? String(contextSignals.workspaceId)
              : typeof (req.meta as any)?.workspaceId === "string"
                ? String((req.meta as any).workspaceId)
                : null,
        });

        selectedDomainHint = selection.domainId || explicitDomainHint;
        bankSelectionReasons = selection.reasons;
        dependencyExpandedBankIds = selection.dependencyExpandedBankIds;
        selectedBankVersionMap = selection.selectedBankVersionMap;

        const domainPackLoader = domainPackModule.getDomainPackLoaderInstance();
        const domainPackLoad = await domainPackLoader.ensureLoaded({
          domainId: selectedDomainHint,
          rootBankIds: selection.rootBankIds,
          selectedBankVersionMap: selection.selectedBankVersionMap,
          locale: detectedLanguage,
          traceId: runtimeCtx?.traceId ?? null,
        });
        selectedBankIds = domainPackLoad.selectedBankIds;
        dependencyExpandedBankIds = domainPackLoad.dependencyExpandedBankIds;
      } catch (error) {
        appLogger.warn("[bank-selection] planner failed; using legacy loading", {
          traceId: runtimeCtx?.traceId ?? null,
          userId: req.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const retrievalReq: RetrievalRequest = {
      query: req.message,
      env: normalizeEnv(),
      retrievalPlan,
      signals: {
        intentFamily,
        queryFamily,
        operator,
        answerMode,
        domainHint: selectedDomainHint,
        languageHint: detectedLanguage,
        explicitDocTypes: explicitDocTypeId ? [explicitDocTypeId] : null,
        requiredBankIds: selectedBankIds,
        selectedBankVersionMap,
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
    if (selectedBankIds && selectedBankIds.length > 0) {
      const bankUsageStats = getBankLoaderInstance().getBankUsageStats();
      const selectedUsageCounts: Record<string, number> = {};
      const selectedLoadDurationsMs: Record<string, number> = {};
      const selectedLoadP95Ms: Record<string, number> = {};
      for (const bankId of selectedBankIds) {
        selectedUsageCounts[bankId] = bankUsageStats.usageCounts[bankId] || 0;
        selectedLoadDurationsMs[bankId] =
          bankUsageStats.loadDurationsMs[bankId] || 0;
        selectedLoadP95Ms[bankId] = bankUsageStats.loadP95Ms[bankId] || 0;
      }
      (pack as any).bankSelection = {
        domainHint: selectedDomainHint,
        selectedBankIds,
        selectedBankVersionMap,
        reasons: bankSelectionReasons,
        dependencyExpandedBankIds,
        selectedUsageCounts,
        selectedLoadDurationsMs,
        selectedLoadP95Ms,
      };
    }
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
    fallbackSignal?: {
      reasonCode?: string;
      telemetryReasonCode?: string;
      policyMeta?: Record<string, unknown> | null;
    } | null,
  ): Record<string, unknown> {
    const sourceCount = retrievalPack?.evidence.length ?? 0;
    const resolvedFallbackSignal =
      fallbackSignal ?? this.resolveFallbackSignal(req, retrievalPack);
    return {
      ...(req.meta || {}),
      preferredLanguage: req.preferredLanguage || "en",
      answerMode,
      intentFamily: sourceCount > 0 ? "documents" : "general",
      operator: sourceCount > 0 ? "answer_with_sources" : "answer",
      fallbackReasonCode: resolvedFallbackSignal.reasonCode,
      fallbackTelemetry: resolvedFallbackSignal.telemetryReasonCode
        ? {
            reasonCode: resolvedFallbackSignal.telemetryReasonCode,
            policy: resolvedFallbackSignal.policyMeta || null,
          }
        : null,
      fallbackPolicy: resolvedFallbackSignal.policyMeta || null,
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
      if (hasAttachedDocs) {
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
      const normalizedQuestion =
        this.clarificationPolicy.enforceClarificationQuestion({
          question,
          preferredLanguage: lang,
        });
      const prompt =
        lang === "pt"
          ? `Preciso de uma confirmação para responder com precisão: ${normalizedQuestion}`
          : lang === "es"
            ? `Necesito una confirmación para responder con precisión: ${normalizedQuestion}`
            : `I need one clarification to answer precisely: ${normalizedQuestion}`;
      return {
        text: prompt,
        failureCode: "EVIDENCE_NEEDS_CLARIFICATION",
      };
    }
    if (decision.suggestedAction === "apologize") {
      // RC8 fix: When documents ARE attached and retrieval returned evidence,
      // do not block entirely — let the LLM hedge instead of refusing.
      // The user already provided documents; a full refusal is a false negative.
      if (hasAttachedDocs) {
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
    const normalizeForCompare = (input: string): string =>
      String(input || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    const normalizedText = normalizeForCompare(normalized);
    const normalizedPrefix = normalizeForCompare(prefix);
    const startsWithPrefix =
      normalizedText.startsWith(normalizedPrefix) ||
      normalizedText.startsWith(`${normalizedPrefix},`);
    if (startsWithPrefix) return normalized;
    return `${prefix} ${normalized}`.trim();
  }

  private renderEvidenceGatePromptBlock(
    decision: EvidenceCheckResult | null,
    language?: string,
  ): string | null {
    if (!decision) return null;
    if (decision.suggestedAction === "hedge") return null;
    const prompt = this.evidenceGate.getPromptModification(
      decision,
      normalizeChatLanguage(language || "en"),
    );
    const trimmed = String(prompt || "").trim();
    return trimmed || null;
  }

  private resolvePlaybookDomain(
    value: unknown,
  ): "finance" | "legal" | "medical" | "ops" | null {
    const domain = String(value || "")
      .trim()
      .toLowerCase();
    if (!domain) return null;
    if (
      domain === "finance" ||
      domain === "legal" ||
      domain === "medical" ||
      domain === "ops"
    ) {
      return domain;
    }
    if (
      domain === "accounting" ||
      domain === "banking" ||
      domain === "billing" ||
      domain === "tax"
    ) {
      return "finance";
    }
    if (
      domain === "hr_payroll" ||
      domain === "travel" ||
      domain === "education"
    ) {
      return "ops";
    }
    return null;
  }

  private resolvePlaybookOperator(value: unknown): string | null {
    const operator = String(value || "")
      .trim()
      .toLowerCase();
    if (!operator) return null;

    const map: Record<string, string> = {
      navigate: "navigate",
      open: "open",
      where: "locate",
      locate_docs: "navigate",
      locate_file: "locate",
      locate_content: "locate",
      summarize: "summarize",
      extract: "extract",
      compare: "compare",
      compute: "calculate",
      validate: "validate",
      advise: "advise",
      monitor: "monitor",
      evaluate: "evaluate",
      calculate: "calculate",
    };
    return map[operator] || null;
  }

  private buildOperatorPlaybookContext(
    req: ChatRequest,
  ): Record<string, unknown> | null {
    const domain = this.resolvePlaybookDomain(
      (req.meta as any)?.domain || (req.meta as any)?.domainId,
    );
    const operator = this.resolvePlaybookOperator((req.meta as any)?.operator);
    if (!domain || !operator) return null;

    const bankId = `operator_playbook_${operator}_${domain}`;
    const bank = getOptionalBank<any>(bankId);
    if (!bank || bank?.config?.enabled === false) return null;

    const lookFor = Array.isArray(bank.lookFor)
      ? bank.lookFor.slice(0, 16)
      : [];
    const requiredBlocks = Array.isArray(bank?.outputStructure?.requiredBlocks)
      ? bank.outputStructure.requiredBlocks.slice(0, 8)
      : [];
    const askQuestionWhen = Array.isArray(bank.askQuestionWhen)
      ? bank.askQuestionWhen
          .slice(0, 3)
          .map((item: any) => String(item?.questionTemplate || "").trim())
          .filter(Boolean)
      : [];
    const validationChecks = Array.isArray(bank.validationChecks)
      ? bank.validationChecks
          .slice(0, 8)
          .map((item: any) => String(item?.check || "").trim())
          .filter(Boolean)
      : [];

    return {
      bankId: String(bank?._meta?.id || bankId),
      operator,
      domain,
      deterministic: bank?.config?.deterministic !== false,
      outputPolicy: bank?.config?.outputPolicy || null,
      lookFor,
      requiredBlocks,
      askQuestionWhen,
      validationChecks,
    };
  }

  private resolveRuntimeOperatorFamily(req: ChatRequest): string | null {
    const metaOperatorFamily = String((req.meta as any)?.operatorFamily || "")
      .trim()
      .toLowerCase();
    if (metaOperatorFamily) return metaOperatorFamily;
    const contextSignals = asObject((req.context as any)?.signals || null);
    const signalFamily = String(contextSignals.operatorFamily || "")
      .trim()
      .toLowerCase();
    if (signalFamily) return signalFamily;
    const operator = String((req.meta as any)?.operator || "")
      .trim()
      .toLowerCase();
    if (operator === "open" || operator === "navigate" || operator === "where")
      return "file_actions";
    if (
      operator === "thank_you" ||
      operator === "greeting" ||
      operator === "smalltalk"
    ) {
      return "conversation";
    }
    return null;
  }

  private resolveAnswerStyleProfileHint(
    req: ChatRequest,
    answerModeHint: AnswerMode | string | null | undefined,
    answerStyleBank: any,
  ): string | null {
    const profiles =
      answerStyleBank?.profiles && typeof answerStyleBank.profiles === "object"
        ? answerStyleBank.profiles
        : {};
    const profileKeys = Object.keys(profiles).map((k) => k.toLowerCase());
    const contextSignals = asObject((req.context as any)?.signals || null);
    const explicitProfile = String(
      contextSignals.styleProfile || contextSignals.profile || "",
    )
      .trim()
      .toLowerCase();
    if (explicitProfile && profileKeys.includes(explicitProfile)) {
      return explicitProfile;
    }

    const answerMode = String(answerModeHint || "")
      .trim()
      .toLowerCase();
    if (answerMode === "nav_pills" || answerMode === "rank_disambiguate") {
      return profileKeys.includes("micro")
        ? "micro"
        : profileKeys[0] || "micro";
    }
    if (req.truncationRetry === true || contextSignals.userRequestedShort) {
      if (profileKeys.includes("brief")) return "brief";
      if (profileKeys.includes("micro")) return "micro";
    }
    if (
      contextSignals.userRequestedDetailed ||
      contextSignals.goDeep ||
      contextSignals.fullBreakdown
    ) {
      if (profileKeys.includes("deep")) return "deep";
      if (profileKeys.includes("detailed")) return "detailed";
    }
    if (profileKeys.includes("standard")) return "standard";
    return profileKeys[0] || null;
  }

  private buildFormattingStyleSignals(
    req: ChatRequest,
    answerModeHint?: AnswerMode | string | null,
  ): Record<string, unknown> | null {
    const answerStyleBank = getOptionalBank<any>("answer_style_policy");
    const boldingBank = getOptionalBank<any>("bolding_rules");
    if (
      (!answerStyleBank || answerStyleBank?.config?.enabled === false) &&
      (!boldingBank || boldingBank?.config?.enabled === false)
    ) {
      return null;
    }

    const answerMode = String(answerModeHint || "")
      .trim()
      .toLowerCase();
    const globalRules = answerStyleBank?.config?.globalRules || {};
    const modeOverrides =
      globalRules.answerModeOverrides &&
      typeof globalRules.answerModeOverrides === "object"
        ? globalRules.answerModeOverrides
        : {};
    const modeOverride =
      answerMode && modeOverrides[answerMode] ? modeOverrides[answerMode] : null;
    const styleProfile = this.resolveAnswerStyleProfileHint(
      req,
      answerModeHint,
      answerStyleBank,
    );
    const profileEntry =
      styleProfile && answerStyleBank?.profiles
        ? answerStyleBank.profiles[styleProfile] || null
        : null;
    const profileMaxChars = toPositiveInt(profileEntry?.budget?.maxChars);
    const profileMaxQuestions = toPositiveInt(profileEntry?.budget?.maxQuestions);
    const contextSignals = asObject((req.context as any)?.signals || null);
    const userRequestedShort =
      req.truncationRetry === true || Boolean(contextSignals.userRequestedShort);
    const overrideMaxQuestions = Number.isFinite(
      Number(modeOverride?.maxQuestions),
    )
      ? Math.max(0, Math.floor(Number(modeOverride?.maxQuestions)))
      : null;
    const globalMaxQuestions = toPositiveInt(globalRules.maxQuestionsPerAnswer);
    const styleMaxQuestions =
      overrideMaxQuestions ??
      (typeof profileMaxQuestions === "number" ? profileMaxQuestions : null) ??
      (typeof globalMaxQuestions === "number" ? globalMaxQuestions : null);

    const operatorFamily = this.resolveRuntimeOperatorFamily(req);
    const modeSuppression =
      boldingBank?.modeSuppressions && answerMode
        ? boldingBank.modeSuppressions[answerMode]
        : null;
    const familySuppression =
      boldingBank?.modeSuppressions && operatorFamily
        ? boldingBank.modeSuppressions[operatorFamily]
        : null;
    const boldingEnabled =
      boldingBank?.config?.defaultBoldingEnabled !== false &&
      modeSuppression?.boldingEnabled !== false &&
      familySuppression?.boldingEnabled !== false;

    return {
      styleProfile: styleProfile || null,
      maxQuestions:
        typeof styleMaxQuestions === "number" ? styleMaxQuestions : undefined,
      profileMaxChars:
        typeof profileMaxChars === "number" ? profileMaxChars : undefined,
      userRequestedShort: userRequestedShort || undefined,
      allowBullets:
        modeOverride?.allowBullets === false ? false : undefined,
      allowTables: modeOverride?.allowTables === false ? false : undefined,
      allowQuotes: modeOverride?.allowQuotes === false ? false : undefined,
      suppressBodyFormatting:
        modeOverride?.suppressBodyFormatting === true ? true : undefined,
      boldingEnabled,
      maxBoldSpansTotal: toPositiveInt(
        boldingBank?.densityControl?.maxBoldSpansTotal,
      ),
      operatorFamily: operatorFamily || undefined,
    };
  }

  private buildRuntimeContext(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
    answerModeHint?: AnswerMode,
  ): Record<string, unknown> {
    const baseContext = asObject(req.context || {});
    const baseSignals = asObject(baseContext.signals || {});
    const formattingStyle = this.buildFormattingStyleSignals(
      req,
      answerModeHint,
    );
    const operatorFamily = this.resolveRuntimeOperatorFamily(req);
    const mergedSignals = {
      ...baseSignals,
      ...(formattingStyle || {}),
      ...(operatorFamily ? { operatorFamily } : {}),
    };

    return {
      ...baseContext,
      preferredLanguage: req.preferredLanguage || "en",
      attachedDocumentIds: req.attachedDocumentIds || [],
      signals: mergedSignals,
      retrieval: retrievalPack
        ? {
            query: retrievalPack.query,
            scope: retrievalPack.scope,
            stats: retrievalPack.stats,
          }
        : null,
      operatorPlaybook: this.buildOperatorPlaybookContext(req),
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
    const disableNavPillsForAnalyticalQueries = Boolean(
      contextSignals.disableNavPillsForAnalyticalQueries,
    );
    const analyticalDocRequest =
      docsAttached &&
      this.looksAnalyticalDocumentQuestion(req.message, semanticSignals);
    if ((operator === "open" || operator === "navigate") && evidenceCount === 0) {
      if (analyticalDocRequest || disableNavPillsForAnalyticalQueries) {
        return "help_steps";
      }
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

  private looksAnalyticalDocumentQuestion(
    message: string,
    semanticSignals: Record<string, boolean>,
  ): boolean {
    const text = String(message || "")
      .trim()
      .toLowerCase();
    if (!text) return false;
    if (semanticSignals.userAskedForTable || semanticSignals.userAskedForQuote) {
      return true;
    }
    const analysisRegex =
      /\b(compute|calculate|break down|compare|versus|margin|ebitda|revenue|expense|sensitivity|break[- ]even|scenario|risk|assumption|timeline|milestones?|dependencies?|blockers?|summari[sz]e|evaluate|validate)\b/;
    return analysisRegex.test(text);
  }

  private resolveFallbackSignal(
    req: ChatRequest,
    retrievalPack: EvidencePack | null,
  ): {
    reasonCode?: string;
    telemetryReasonCode?: string;
    policyMeta: Record<string, unknown> | null;
  } {
    const decision = this.fallbackDecisionPolicy.resolve(req, retrievalPack);
    const reasonCodeRaw = String(decision?.reasonCode || "").trim();
    const shouldSurface = this.shouldSurfaceFallback(
      reasonCodeRaw,
      retrievalPack,
    );
    const userFacingReasonCode =
      shouldSurface && reasonCodeRaw ? reasonCodeRaw : undefined;
    const suppressPromptFallback =
      Boolean(reasonCodeRaw) && !shouldSurface;

    if (!decision || !reasonCodeRaw) {
      return {
        reasonCode: userFacingReasonCode,
        telemetryReasonCode: undefined,
        policyMeta: null,
      };
    }

    return {
      reasonCode: userFacingReasonCode,
      telemetryReasonCode: reasonCodeRaw,
      policyMeta: {
        reasonCode: reasonCodeRaw,
        selectedBankId: decision.selectedBankId,
        selectedRuleId: decision.selectedRuleId,
        severity: decision.severity,
        fallbackType: decision.fallbackType,
        routerAction: decision.routerAction,
        routerTelemetryReason: decision.routerTelemetryReason,
        userFacingReasonCode: userFacingReasonCode || null,
        suppressedForPrompt: suppressPromptFallback,
        suppressionReason:
          suppressPromptFallback && reasonCodeRaw === "low_confidence"
            ? "low_confidence_with_evidence"
            : suppressPromptFallback
              ? "non_user_facing_reason"
              : null,
      },
    };
  }

  private shouldSurfaceFallback(
    reasonCode: string,
    retrievalPack: EvidencePack | null,
  ): boolean {
    const normalized = String(reasonCode || "")
      .trim()
      .toLowerCase();
    if (!normalized) return false;
    if (normalized === "low_confidence") {
      const hasEvidence = (retrievalPack?.evidence.length ?? 0) > 0;
      if (hasEvidence && !this.lowConfidenceSurfaceFallback) return false;
      return true;
    }
    return USER_FACING_FALLBACK_REASON_CODES.has(normalized);
  }

  private async persistResolvedDocScope(params: {
    traceId: string;
    conversationId: string;
    previousDocId: string | null;
    resolvedDocId: string | null;
    stream: boolean;
  }): Promise<void> {
    if (!params.resolvedDocId || params.resolvedDocId === params.previousDocId) {
      return;
    }
    try {
      await prisma.conversation.update({
        where: { id: params.conversationId },
        data: { lastDocumentId: params.resolvedDocId },
      });
    } catch (error) {
      appLogger.warn(
        params.stream
          ? "[chat-runtime] failed to persist stream lastDocumentId"
          : "[chat-runtime] failed to persist lastDocumentId",
        {
          traceId: params.traceId,
          conversationId: params.conversationId,
          lastDocumentId: params.resolvedDocId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  private buildSourceButtonsAttachment(
    retrievalPack: EvidencePack | null,
    preferredLanguage?: string,
  ): unknown | null {
    if (!retrievalPack || retrievalPack.evidence.length === 0) return null;
    const sourceButtonsService = getSourceButtonsService();
    const toCellReference = (raw: unknown): string | undefined => {
      const text = String(raw || "").trim();
      if (!text) return undefined;
      return /^[A-Za-z]{1,4}[0-9]{1,7}(?::[A-Za-z]{1,4}[0-9]{1,7})?$/.test(text)
        ? text.toUpperCase()
        : undefined;
    };
    const toLocationLabel = (item: EvidenceItem): string | undefined => {
      if (item.location.page) return `Page ${item.location.page}`;
      if (item.location.slide) return `Slide ${item.location.slide}`;
      const sectionKey = String(item.location.sectionKey || "").trim();
      const isCellRef = /^[A-Za-z]{1,4}[0-9]{1,7}(?::[A-Za-z]{1,4}[0-9]{1,7})?$/.test(sectionKey);
      if (item.location.sheet && sectionKey && isCellRef) {
        return `${String(item.location.sheet)}!${sectionKey.toUpperCase()}`;
      }
      if (item.location.sheet) return String(item.location.sheet);
      return sectionKey || undefined;
    };
    const rawSources = retrievalPack.evidence.map((item) => ({
      documentId: item.docId,
      filename: String(
        item.filename || item.title || fallbackSourceLabel(item.docId),
      ),
      locationKey: item.locationKey,
      pageNumber: item.location.page ?? undefined,
      sheetName: item.location.sheet ?? undefined,
      cellReference: toCellReference(item.location.sectionKey),
      slideNumber: item.location.slide ?? undefined,
      sectionTitle: String(item.location.sectionKey || "").trim() || undefined,
      locationLabel: toLocationLabel(item),
      snippet: String(item.snippet || "").trim() || undefined,
      score: item.score.finalScore,
    }));
    return sourceButtonsService.buildSourceButtons(rawSources, {
      context: "qa",
      language: normalizeChatLanguage(preferredLanguage),
    });
  }
}
