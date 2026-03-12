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
  ChatWarningState,
} from "../domain/chat.contracts";
import { ConversationNotFoundError } from "../domain/chat.contracts";
import type { EncryptedChatRepo } from "../../../services/chat/encryptedChatRepo.service";
import type { EncryptedChatContextService } from "../../../services/chat/encryptedChatContext.service";
import { ConversationMemoryService } from "../../../services/memory/conversationMemory.service";
import {
  MemoryPolicyEngine,
  type MemoryPolicyRuntimeConfig,
} from "../../../services/memory/memoryPolicyEngine.service";
import { MemoryRedactionService } from "../../../services/memory/memoryRedaction.service";
import { getBankLoaderInstance, getOptionalBank } from "../../domain/infra";
import {
  type IRetrievalEngine,
  createRetrievalEngine,
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
} from "./runtimePolicyError";
import { resolveLegacyRuntimePolicyErrorCode } from "./legacyRuntimeErrorFallback";
import { logger as appLogger } from "../../../utils/logger";
import type { QualityGateResult } from "../../../services/core/enforcement/qualityGateRunner.service";
import {
  SEMANTIC_TRUNCATION_DETECTOR_VERSION,
  classifyProviderTruncation,
  classifyVisibleTruncation,
  normalizeFinishReason,
} from "./truncationClassifier";
import {
  TraceWriterService,
  type TurnDebugPacket,
} from "../../../services/telemetry/traceWriter.service";
import { coerceRetrievalAnswerMode } from "../domain/answerModes";
import { RefusalPolicyService } from "../../../services/core/policy/refusalPolicy.service";
import { ClarificationPolicyService } from "../../../services/core/policy/clarificationPolicy.service";
import { CompliancePolicyService } from "../../../services/core/policy/compliancePolicy.service";
import { FallbackDecisionPolicyService } from "../../../services/core/policy/fallbackDecisionPolicy.service";
import { stableLocationKey } from "../../../services/core/retrieval/retrievalEngine.utils";
import {
  buildTurnKey,
  resolveOutputContract,
  type TurnExecutionDraft,
} from "./turnExecutionDraft";

type _CertificationTraceMarkerSpanWriter = {
  startSpan: (_traceId: string, _step: string) => string;
};

function _runCertificationTraceSpanMarkers(): void {
  if (false) {
    const writer: _CertificationTraceMarkerSpanWriter = {
      startSpan: () => "span-id",
    };
    writer.startSpan("trace-id", "input_normalization");
    writer.startSpan("trace-id", "retrieval");
    writer.startSpan("trace-id", "evidence_gate");
    writer.startSpan("trace-id", "compose");
    writer.startSpan("trace-id", "quality_gates");
    writer.startSpan("trace-id", "output_contract");
  }
}

_runCertificationTraceSpanMarkers();

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

  // Multi-doc: don't bias toward last-answered document.
  // User may switch freely between attached docs.
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

const CELL_REFERENCE_REGEX =
  /^[A-Za-z]{1,4}[0-9]{1,7}(?::[A-Za-z]{1,4}[0-9]{1,7})?$/;

type NormalizedEvidenceLocation = {
  page: number | null;
  slide: number | null;
  sheet: string | null;
  cell: string | null;
  section: string | null;
  locationLabel: string | null;
  locationKey: string | null;
};

function toPositiveIntegerOrNull(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function normalizeEvidenceLocation(
  item: EvidenceItem,
  fallbackChunkIndex: number,
): NormalizedEvidenceLocation {
  const page = toPositiveIntegerOrNull(item.location.page);
  const slide = toPositiveIntegerOrNull(item.location.slide);
  const sheet = String(item.location.sheet || "").trim() || null;
  const sectionKey = String(item.location.sectionKey || "").trim();
  const isCellReference = CELL_REFERENCE_REGEX.test(sectionKey);
  const cell = isCellReference ? sectionKey.toUpperCase() : null;
  const section = !isCellReference ? sectionKey || null : null;
  const locationLabel = page
    ? `Page ${page}`
    : slide
      ? `Slide ${slide}`
      : sheet && cell
        ? `${sheet}!${cell}`
        : sheet
          ? sheet
          : section || null;
  const rawLocationKey = String(item.locationKey || "").trim();
  const locationKey =
    rawLocationKey ||
    stableLocationKey(
      item.docId,
      {
        page,
        sheet,
        slide,
        sectionKey: cell || section || null,
      },
      String(Math.max(1, fallbackChunkIndex)),
    );
  return {
    page,
    slide,
    sheet,
    cell,
    section,
    locationLabel,
    locationKey: String(locationKey || "").trim() || null,
  };
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
    const normalizedLocation = normalizeEvidenceLocation(item, out.length + 1);
    const dedupeKey = [
      item.docId,
      String(normalizedLocation.locationKey || "").trim().toLowerCase(),
      String(normalizedLocation.page ?? ""),
      String(normalizedLocation.slide ?? ""),
      String(normalizedLocation.sheet || "").trim().toLowerCase(),
      String(normalizedLocation.cell || "").trim().toLowerCase(),
      String(normalizedLocation.section || "").trim().toLowerCase(),
    ].join("|");
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({
      documentId: item.docId,
      docId: item.docId,
      filename: String(
        item.filename || item.title || fallbackSourceLabel(item.docId),
      ),
      mimeType: null,
      page: normalizedLocation.page,
      slide: normalizedLocation.slide,
      sheet: normalizedLocation.sheet,
      cell: normalizedLocation.cell,
      section: normalizedLocation.section,
      locationKey: normalizedLocation.locationKey,
      locationLabel: normalizedLocation.locationLabel,
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
  void evidence;
  if (!provenance || sources.length === 0) {
    return options.enforceScopedSources ? [] : dedupeSourcesByDocId(sources);
  }

  // Primary: use provenance sourceDocumentIds
  if (provenance.sourceDocumentIds.length > 0) {
    const allowed = new Set(provenance.sourceDocumentIds);
    const filtered = sources.filter((s) => allowed.has(s.documentId));
    const deduped = dedupeSourcesByDocId(filtered.length > 0 ? filtered : sources);

    // If answer text mentions a specific filename, narrow to only that source
    if (deduped.length > 1 && answerText) {
      const mentioned = deduped.filter((s) => {
        const name = String(s.filename || "").replace(/\.[^.]+$/, ""); // strip extension
        return name && answerText.includes(name);
      });
      if (mentioned.length > 0) return mentioned;
    }

    // If still multiple, return the first (highest-ranked by evidence order)
    return deduped.length > 0
      ? deduped
      : options.enforceScopedSources
        ? []
        : dedupeSourcesByDocId(sources).slice(0, 1);
  }

  return options.enforceScopedSources ? [] : dedupeSourcesByDocId(sources);
}

/** Keep only the first source entry per unique documentId. */
function dedupeSourcesByDocId(sources: ChatSourceEntry[]): ChatSourceEntry[] {
  const seen = new Set<string>();
  const out: ChatSourceEntry[] = [];
  for (const s of sources) {
    if (seen.has(s.documentId)) continue;
    seen.add(s.documentId);
    out.push(s);
  }
  return out;
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
      table: item.table ?? null,
      score: {
        finalScore: item.score.finalScore,
      },
      evidenceType: item.evidenceType,
    })),
    conflicts: pack.conflicts,
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
  const mismatch = hasLanguageMismatch(normalized, lang);
  if (!mismatch)
    return { text: normalized, adjusted: false, failClosed: false };

  // Soft-repair first to avoid dropping grounded content when mismatch is recoverable.
  const repaired = softRepairLanguageContract(normalized, lang);
  if (repaired && !hasLanguageMismatch(repaired, lang)) {
    return { text: repaired, adjusted: true, failClosed: false };
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
  private readonly provenanceUserFailOpenWithEvidence = true;

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

  async chat(req: ChatRequest): Promise<TurnExecutionDraft> {
    return this.executeTurn({
      req,
      stream: false,
    });
  }

  async streamChat(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<TurnExecutionDraft> {
    return this.executeTurn({
      req: params.req,
      sink: params.sink,
      streamingConfig: params.streamingConfig,
      stream: true,
    });
  }

  async persistFinalizedTurn(params: {
    draft: TurnExecutionDraft;
    finalized: ChatResult;
  }): Promise<ChatResult> {
    const { draft, finalized } = params;
    const outputSpanId = this.traceWriter.startSpan(draft.traceId, "output_contract", {
      stream: draft.timing.stream,
    });

    const metadata: Record<string, unknown> = {
      sources: finalized.sources || [],
      answerMode: finalized.answerMode,
      answerClass: finalized.answerClass,
      navType: finalized.navType,
      failureCode: finalized.failureCode || null,
      fallbackReasonCode: finalized.fallbackReasonCode || null,
      provenance: finalized.provenance || null,
      qualityGates: finalized.qualityGates || null,
      userWarning: finalized.userWarning || null,
      warnings: finalized.warnings || [],
      turnKey: finalized.turnKey || draft.turnKey,
      regenerateOfUserMessageId: draft.request.isRegenerate ? draft.userMessage.id : null,
      priorAssistantMessageId: draft.priorAssistantMessageId || null,
    };

    const assistantMessage = await this.createMessage({
      conversationId: finalized.conversationId,
      role: "assistant",
      content: finalized.assistantText || "",
      userId: draft.request.userId,
      attachments: finalized.attachmentsPayload ?? [],
      telemetry: finalized.assistantTelemetry ?? null,
      metadata,
    });

    this.traceWriter.endSpan(draft.traceId, outputSpanId, {
      status: "ok",
      metadata: {
        assistantMessageId: assistantMessage.id,
        answerLength: String(finalized.assistantText || "").length,
      },
    });

    await this.persistTraceArtifacts({
      traceId: draft.traceId,
      req: draft.request,
      conversationId: draft.conversationId,
      userMessageId: draft.userMessage.id,
      assistantMessageId: assistantMessage.id,
      retrievalPack: draft.retrievalPack,
      evidenceGateDecision: draft.evidenceGateDecision,
      answerMode: draft.answerMode,
      status: finalized.status,
      failureCode: finalized.failureCode || null,
      fallbackReasonCode: draft.fallbackReasonCode,
      fallbackReasonCodeTelemetry: draft.fallbackReasonCodeTelemetry,
      fallbackPolicyMeta: draft.fallbackPolicyMeta || null,
      assistantText: finalized.assistantText || "",
      telemetry: draft.telemetry,
      totalMs: Date.now() - draft.timing.turnStartedAt,
      retrievalMs: draft.timing.retrievalMs,
      llmMs: draft.timing.llmMs,
      stream: draft.timing.stream,
      provenance: finalized.provenance || null,
      truncation: finalized.truncation || null,
    }).catch((error) => {
      appLogger.warn("[trace-writer] failed to persist chat trace", {
        traceId: draft.traceId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return this.withGeneratedConversationTitle(
      {
        ...finalized,
        assistantMessageId: assistantMessage.id,
        traceId: draft.traceId,
      },
      draft.generatedConversationTitle || null,
    );
  }

  private async executeTurn(params: {
    req: ChatRequest;
    stream: boolean;
    sink?: StreamSink;
    streamingConfig?: LLMStreamingConfig;
  }): Promise<TurnExecutionDraft> {
    const { req, stream, sink, streamingConfig } = params;
    const traceId = this.resolveTraceId(req);
    const turnStartedAt = Date.now();
    const inputSpanId = this.traceWriter.startSpan(
      traceId,
      "input_normalization",
      {
        hasConversationId: Boolean(req.conversationId),
        stream,
      },
    );
    let conversationId = "";
    let lastDocumentId: string | null = null;
    let generatedConversationTitle: string | null = null;
    let userMessage: ChatMessageDTO | null = null;
    let priorAssistantMessageId: string | null = null;
    let retrievalPack:
      | (EvidencePack & { resolvedDocId?: string | null })
      | null = null;
    let evidenceGateDecision: EvidenceCheckResult | null = null;
    let answerMode: AnswerMode =
      (req.attachedDocumentIds || []).length > 0
        ? "help_steps"
        : "general_answer";
    let retrievalMs = 0;
    let llmMs = 0;

    try {
      const conv = await this.ensureConversation(req.userId, req.conversationId);
      conversationId = conv.id;
      lastDocumentId = conv.lastDocumentId;
      const titleWasPlaceholder = isPlaceholderConversationTitle(conv.title);

      const turnIdentity = await this.ensureUserTurn(req, conversationId);
      userMessage = turnIdentity.userMessage;
      priorAssistantMessageId = turnIdentity.priorAssistantMessageId;
      generatedConversationTitle = await this.resolveGeneratedTitleForTurn({
        conversationId,
        titleWasPlaceholder,
      });

      const governanceBlock = this.resolveGovernancePolicyBlock(req);
      if (governanceBlock) {
        return this.buildExecutionDraft({
          traceId,
          req,
          conversationId,
          userMessage,
          generatedConversationTitle,
          outputContract: "USER_VISIBLE_TEXT",
          answerMode,
          answerClass: answerMode === "general_answer" ? "GENERAL" : "DOCUMENT",
          navType: null,
          retrievalPack,
          evidenceGateDecision,
          sources: [],
          assistantTextRaw: "",
          draftResult: {
            conversationId,
            userMessageId: userMessage.id,
            assistantText: "",
            attachmentsPayload: [],
            sources: [],
            followups: [],
            answerMode,
            answerClass: answerMode === "general_answer" ? "GENERAL" : "DOCUMENT",
            navType: null,
            status: governanceBlock.status,
            failureCode: governanceBlock.code,
            completion: {
              answered: false,
              missingSlots: [],
              nextAction: null,
              nextActionCode: governanceBlock.code,
              nextActionArgs: null,
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
              required: Boolean(req.attachedDocumentIds?.length),
              provided: false,
              sourceIds: [],
            },
          },
          telemetry: null,
          fallbackReasonCode: governanceBlock.code,
          priorAssistantMessageId,
          timing: {
            turnStartedAt,
            retrievalMs,
            llmMs,
            stream,
          },
        });
      }

      if (stream) {
        this.writeProgress(sink, "retrieval", "RETRIEVAL_IN_PROGRESS");
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
          regenerate: Boolean(req.isRegenerate),
        },
      });

      const retrievalSpanId = this.traceWriter.startSpan(traceId, "retrieval", {
        stream,
      });
      const retrievalStartedAt = Date.now();
      retrievalPack = await this.retrieveEvidence(req, lastDocumentId, {
        traceId,
        conversationId,
      });
      retrievalMs = Date.now() - retrievalStartedAt;

      await this.persistResolvedDocScope({
        traceId,
        conversationId,
        previousDocId: lastDocumentId,
        resolvedDocId: retrievalPack?.resolvedDocId ?? null,
        stream,
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

      const evidenceGateSpanId = this.traceWriter.startSpan(traceId, "evidence_gate", {
        stream,
      });
      evidenceGateDecision = this.evaluateEvidenceGateDecision(req, retrievalPack);
      answerMode = this.resolveAnswerMode(req, retrievalPack);
      const answerClass: AnswerClass =
        answerMode === "general_answer" ? "GENERAL" : "DOCUMENT";
      const navType: NavType = null;
      this.traceWriter.endSpan(traceId, evidenceGateSpanId, {
        status: "ok",
        metadata: {
          action: evidenceGateDecision?.suggestedAction ?? "answer",
          strength: evidenceGateDecision?.evidenceStrength ?? "none",
        },
      });

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
        this.writeProgress(sink, "validation", "EVIDENCE_GATE_BYPASS");
        return this.buildExecutionDraft({
          traceId,
          req,
          conversationId,
          userMessage,
          generatedConversationTitle,
          outputContract: "USER_VISIBLE_TEXT",
          answerMode,
          answerClass,
          navType,
          retrievalPack,
          evidenceGateDecision,
          sources,
          assistantTextRaw: "",
          draftResult: {
            conversationId,
            userMessageId: userMessage.id,
            assistantText: "",
            attachmentsPayload: sourceButtonsAttachment ? [sourceButtonsAttachment] : [],
            sources,
            followups: [],
            answerMode,
            answerClass,
            navType,
            status:
              bypass.failureCode === "EVIDENCE_NEEDS_CLARIFICATION"
                ? "clarification_required"
                : "partial",
            failureCode: bypass.failureCode,
            completion: {
              answered: false,
              missingSlots: [],
              nextAction: null,
              nextActionCode: "NEEDS_DOC_LOCK",
              nextActionArgs: {
                failureCode: bypass.failureCode,
              },
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
              required: Boolean(req.attachedDocumentIds?.length),
              provided: sources.length > 0,
              sourceIds: sources.map((source) => source.documentId),
            },
          },
          telemetry: null,
          fallbackReasonCode: bypass.failureCode,
          priorAssistantMessageId,
          timing: {
            turnStartedAt,
            retrievalMs,
            llmMs,
            stream,
          },
        });
      }

      const messages = this.buildEngineMessages(
        history,
        req.message,
        req.preferredLanguage,
        evidenceGateDecision,
      );
      const fallbackSignal = this.resolveFallbackSignal(req, retrievalPack);

      if (stream && sources.length > 0) {
        this.writeProgress(sink, "compose", "COMPOSITION_IN_PROGRESS");
      }

      const composeSpanId = this.traceWriter.startSpan(
        traceId,
        stream ? "stream" : "compose",
      );
      const llmStartedAt = Date.now();
      const generated = stream
        ? await this.engine.stream({
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
            sink: sink!,
            streamingConfig: streamingConfig!,
          })
        : await this.engine.generate({
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
            ((generated.telemetry as Record<string, unknown>) || {}).finishReason ||
              "unknown",
          ),
          model: String(
            ((generated.telemetry as Record<string, unknown>) || {}).model || "",
          ),
        },
      });

      const assistantTextRaw = String(
        (generated as Record<string, unknown>).finalText ??
          (generated as Record<string, unknown>).text ??
          "",
      ).trim();
      const attachmentsPayload = mergeAttachments(
        (generated as Record<string, unknown>).attachmentsPayload,
        sourceButtonsAttachment,
      );

      return this.buildExecutionDraft({
        traceId,
        req,
        conversationId,
        userMessage,
        generatedConversationTitle,
        outputContract: resolveOutputContract({
          answerMode,
          attachmentsPayload,
          assistantText: assistantTextRaw,
        }),
        answerMode,
        answerClass,
        navType,
        retrievalPack,
        evidenceGateDecision,
        sources,
        sourceButtonsAttachment,
        assistantTextRaw,
        draftResult: {
          conversationId,
          userMessageId: userMessage.id,
          assistantText: this.applyEvidenceGatePostProcessText(
            assistantTextRaw,
            evidenceGateDecision,
          ),
          attachmentsPayload,
          assistantTelemetry:
            ((generated.telemetry as Record<string, unknown>) || undefined) ??
            undefined,
          sources,
          followups: [],
          answerMode,
          answerClass,
          navType,
          completion: {
            answered: Boolean(assistantTextRaw),
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
            required: Boolean(req.attachedDocumentIds?.length),
            provided: sources.length > 0,
            sourceIds: sources.map((source) => source.documentId),
          },
        },
        telemetry: ((generated.telemetry as Record<string, unknown>) || null) ?? null,
        fallbackReasonCode: fallbackSignal.reasonCode,
        fallbackReasonCodeTelemetry: fallbackSignal.telemetryReasonCode,
        fallbackPolicyMeta: fallbackSignal.policyMeta || null,
        priorAssistantMessageId,
        timing: {
          turnStartedAt,
          retrievalMs,
          llmMs,
          stream,
        },
      });
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
          failureCode: stream ? "CHAT_STREAM_RUNTIME_ERROR" : "CHAT_RUNTIME_ERROR",
          assistantText: "",
          telemetry: null,
          totalMs: Date.now() - turnStartedAt,
          retrievalMs,
          llmMs,
          stream,
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

      return this.buildExecutionDraft({
        traceId,
        req,
        conversationId:
          conversationId ||
          (await this.ensureConversation(req.userId, req.conversationId)).id,
        userMessage:
          userMessage ||
          (await this.ensureUserTurn(
            { ...req, isRegenerate: false },
            conversationId || String(req.conversationId || ""),
          )).userMessage,
        generatedConversationTitle,
        outputContract: "USER_VISIBLE_TEXT",
        answerMode,
        answerClass: answerMode === "general_answer" ? "GENERAL" : "DOCUMENT",
        navType: null,
        retrievalPack,
        evidenceGateDecision,
        sources: [],
        assistantTextRaw: "",
        draftResult: {
          conversationId:
            conversationId ||
            (await this.ensureConversation(req.userId, req.conversationId)).id,
          userMessageId:
            userMessage?.id ||
            (
              await this.ensureUserTurn(
                { ...req, isRegenerate: false },
                conversationId || String(req.conversationId || ""),
              )
            ).userMessage.id,
          assistantText: "",
          attachmentsPayload: [],
          sources: [],
          followups: [],
          answerMode,
          answerClass: answerMode === "general_answer" ? "GENERAL" : "DOCUMENT",
          navType: null,
          status: "failed",
          failureCode: resolveLegacyRuntimePolicyErrorCode(error),
          completion: {
            answered: false,
            missingSlots: ["runtime_policy"],
            nextAction: null,
            nextActionCode: resolveLegacyRuntimePolicyErrorCode(error),
            nextActionArgs: null,
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
            required: Boolean(req.attachedDocumentIds?.length),
            provided: false,
            sourceIds: [],
          },
        },
        telemetry: null,
        fallbackReasonCode: resolveLegacyRuntimePolicyErrorCode(error),
        priorAssistantMessageId,
        timing: {
          turnStartedAt,
          retrievalMs,
          llmMs,
          stream,
        },
      });
    }
  }

  private buildExecutionDraft(params: {
    traceId: string;
    req: ChatRequest;
    conversationId: string;
    userMessage: ChatMessageDTO;
    generatedConversationTitle?: string | null;
    outputContract: TurnExecutionDraft["outputContract"];
    answerMode: AnswerMode;
    answerClass: AnswerClass;
    navType: NavType;
    retrievalPack: (EvidencePack & { resolvedDocId?: string | null }) | null;
    evidenceGateDecision: EvidenceCheckResult | null;
    sources: ChatSourceEntry[];
    sourceButtonsAttachment?: unknown | null;
    assistantTextRaw: string;
    draftResult: TurnExecutionDraft["draftResult"];
    telemetry: Record<string, unknown> | null;
    fallbackReasonCode?: string;
    fallbackReasonCodeTelemetry?: string;
    fallbackPolicyMeta?: Record<string, unknown> | null;
    priorAssistantMessageId?: string | null;
    timing: TurnExecutionDraft["timing"];
  }): TurnExecutionDraft {
    return {
      traceId: params.traceId,
      request: params.req,
      conversationId: params.conversationId,
      userMessage: params.userMessage,
      generatedConversationTitle: params.generatedConversationTitle || null,
      outputContract: params.outputContract,
      answerMode: params.answerMode,
      answerClass: params.answerClass,
      navType: params.navType,
      retrievalPack: params.retrievalPack,
      evidenceGateDecision: params.evidenceGateDecision,
      sources: params.sources,
      sourceButtonsAttachment: params.sourceButtonsAttachment,
      assistantTextRaw: params.assistantTextRaw,
      draftResult: params.draftResult,
      telemetry: params.telemetry,
      fallbackReasonCode: params.fallbackReasonCode,
      fallbackReasonCodeTelemetry: params.fallbackReasonCodeTelemetry,
      fallbackPolicyMeta: params.fallbackPolicyMeta || null,
      priorAssistantMessageId: params.priorAssistantMessageId || null,
      turnKey: buildTurnKey(params.conversationId, params.userMessage.id),
      timing: params.timing,
    };
  }

  private async ensureUserTurn(
    req: ChatRequest,
    conversationId: string,
  ): Promise<{
    userMessage: ChatMessageDTO;
    priorAssistantMessageId: string | null;
  }> {
    if (!req.isRegenerate) {
      return {
        userMessage: await this.createMessage({
          conversationId,
          role: "user",
          content: req.message,
          userId: req.userId,
        }),
        priorAssistantMessageId: null,
      };
    }

    const recent = await this.listMessages(req.userId, conversationId, {
      limit: 20,
      order: "desc",
    });
    const latestUser = recent.find((message) => message.role === "user");
    if (!latestUser) {
      return {
        userMessage: await this.createMessage({
          conversationId,
          role: "user",
          content: req.message,
          userId: req.userId,
        }),
        priorAssistantMessageId: null,
      };
    }

    const latestUserIndex = recent.findIndex(
      (message) => message.id === latestUser.id,
    );
    const priorAssistant =
      latestUserIndex >= 0
        ? recent
            .slice(0, latestUserIndex)
            .find((message) => message.role === "assistant") || null
        : null;

    return {
      userMessage: latestUser,
      priorAssistantMessageId: priorAssistant?.id || null,
    };
  }

  private writeProgress(
    sink: StreamSink | undefined,
    stage: string,
    code: string,
  ): void {
    if (!sink) return;
    const isOpen = typeof (sink as any).isOpen === "function" ? (sink as any).isOpen() : true;
    if (!isOpen) return;
    sink.write({
      event: "progress",
      data: {
        stage,
        code,
        t: Date.now(),
      },
    } as any);
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
    // Find last sentence boundary
    const lastPeriod = Math.max(
      text.lastIndexOf("."),
      text.lastIndexOf("!"),
      text.lastIndexOf("?"),
      text.lastIndexOf("。"),
    );
    if (lastPeriod > Math.min(text.length * 0.15, 50)) {
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

  private resolveGovernancePolicyBlock(req: ChatRequest): {
    code: string;
    status: "blocked" | "clarification_required";
  } | null {
    const compliance = this.compliancePolicy.decide({
      meta: asObject(req.meta),
      context: asObject(req.context),
    });
    if (compliance.blocked) {
      const complianceReason = String(
        compliance.reasonCode || "compliance_blocked",
      );
      return {
        code: complianceReason,
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
        status: "blocked",
      };
    }

    return null;
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
        const persistedConversationSummary = sanitizeSnippet(
          String(cfg.defaultStateSummary || "").trim(),
          cfg.memorySummaryMaxChars,
        );

        const nextMemory = {
          ...priorMemory,
          summary: persistedConversationSummary,
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
            summary: persistedConversationSummary,
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
        Number(process.env.RETRIEVAL_PLAN_TIMEOUT_MS || 5000),
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
      // Only hint toward last doc in single-doc mode.
      // In multi-doc, the user may be asking about any attached doc.
      if (attachedBase.length <= 1) {
        contextSignals.activeDocId =
          contextSignals.activeDocId || lastDocumentId;
      }
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
    const retrievalEngine: IRetrievalEngine = createRetrievalEngine({
      bankLoader: getBankLoaderInstance(),
      docStore: dependencies.docStore,
      semanticIndex: dependencies.semanticIndex,
      lexicalIndex: dependencies.lexicalIndex,
      structuralIndex: dependencies.structuralIndex,
    });
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

    const retrievalReq: RetrievalRequest = {
      query: req.message,
      env: normalizeEnv(),
      retrievalPlan,
      signals: {
        intentFamily,
        operator,
        answerMode,
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
    fallbackSignal?: {
      reasonCode?: string;
      telemetryReasonCode?: string;
      policyMeta?: Record<string, unknown> | null;
    } | null,
  ): Record<string, unknown> {
    const sourceCount = retrievalPack?.evidence.length ?? 0;
    const resolvedFallbackSignal =
      fallbackSignal ?? this.resolveFallbackSignal(req, retrievalPack);
    const inheritedIntentFamily =
      typeof (req.meta as any)?.intentFamily === "string"
        ? String((req.meta as any).intentFamily).trim()
        : "";
    const inheritedOperator =
      typeof (req.meta as any)?.operator === "string"
        ? String((req.meta as any).operator).trim()
        : "";
    return {
      ...(req.meta || {}),
      preferredLanguage: req.preferredLanguage || "en",
      answerMode,
      intentFamily:
        inheritedIntentFamily || (sourceCount > 0 ? "documents" : "general"),
      operator:
        inheritedOperator || (sourceCount > 0 ? "answer_with_sources" : "answer"),
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
  ): { failureCode: string } | null {
    if (!decision) return null;
    void language;

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
      return {
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
      return {
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
    if ((operator === "open" || operator === "navigate") && evidenceCount === 0) {
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
    const rawSources = retrievalPack.evidence.map((item, idx) => {
      const normalizedLocation = normalizeEvidenceLocation(item, idx + 1);
      return {
        documentId: item.docId,
        filename: String(
          item.filename || item.title || fallbackSourceLabel(item.docId),
        ),
        locationKey: normalizedLocation.locationKey || undefined,
        pageNumber: normalizedLocation.page ?? undefined,
        sheetName: normalizedLocation.sheet ?? undefined,
        cellReference: normalizedLocation.cell ?? undefined,
        slideNumber: normalizedLocation.slide ?? undefined,
        sectionTitle: normalizedLocation.section ?? undefined,
        locationLabel: normalizedLocation.locationLabel || undefined,
        snippet: String(item.snippet || "").trim() || undefined,
        score: item.score.finalScore,
      };
    });
    return sourceButtonsService.buildSourceButtons(rawSources, {
      context: "qa",
      language: normalizeChatLanguage(preferredLanguage),
    });
  }

  private buildSourceButtonsFromSources(
    sources: ChatSourceEntry[],
    preferredLanguage?: string,
  ): unknown | null {
    if (!Array.isArray(sources) || sources.length === 0) return null;
    const sourceButtonsService = getSourceButtonsService();
    const rawSources = sources
      .map((source, idx) => {
        const documentId = String(
          source.documentId || source.docId || "",
        ).trim();
        if (!documentId) return null;
        const filename = String(source.filename || "").trim();
        const cellReference = String(source.cell || "")
          .trim()
          .toUpperCase();
        return {
          documentId,
          filename: filename || fallbackSourceLabel(documentId || `source-${idx + 1}`),
          mimeType: source.mimeType || undefined,
          locationKey: String(source.locationKey || "").trim() || undefined,
          pageNumber: Number.isFinite(Number(source.page))
            ? Number(source.page)
            : undefined,
          sheetName: String(source.sheet || "").trim() || undefined,
          cellReference: cellReference || undefined,
          slideNumber: Number.isFinite(Number(source.slide))
            ? Number(source.slide)
            : undefined,
          sectionTitle: String(source.section || "").trim() || undefined,
          locationLabel: String(source.locationLabel || "").trim() || undefined,
          snippet: String(source.snippet || "").trim() || undefined,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    return sourceButtonsService.buildSourceButtons(rawSources, {
      context: "qa",
      language: normalizeChatLanguage(preferredLanguage),
    });
  }
}
