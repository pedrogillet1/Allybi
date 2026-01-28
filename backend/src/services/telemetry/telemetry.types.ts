// backend/src/services/telemetry/telemetry.types.ts
//
// Clean telemetry types for Koda (50% coverage set).
// - Stable enums for event types, stages, providers
// - DB-write payload types (Create inputs)
// - No user-facing microcopy

export type TelemetryRange = "24h" | "7d" | "30d" | "90d";

/**
 * Domain taxonomy (keep stable; you can extend later).
 * For now: store as string union for type safety.
 */
export type KodaDomain =
  | "legal_contracts"
  | "corporate_ma"
  | "litigation_disputes"
  | "compliance_regulatory"
  | "finance_accounting"
  | "investment_banking"
  | "portfolio_management"
  | "tax"
  | "insurance"
  | "real_estate"
  | "hr_employment"
  | "sales_crm"
  | "procurement_supply_chain"
  | "operations_sops"
  | "engineering_projects"
  | "architecture_plans"
  | "manufacturing_quality"
  | "healthcare_records"
  | "education_academic"
  | "research_scientific"
  | "government_public"
  | "cybersecurity_it"
  | "product_specs_manuals"
  | "customer_support"
  | "marketing_ads"
  | "personal_household"
  | "travel_immigration"
  | "media_audio_video"
  | "unknown";

/**
 * Intent taxonomy (minimal, expandable).
 */
export type KodaIntent =
  | "answer"
  | "compare"
  | "find"
  | "open"
  | "discover"
  | "summarize"
  | "extract"
  | "translate"
  | "timeline"
  | "checklist"
  | "other";

/**
 * Operator / answer mode (mirrors your routing layer).
 */
export type KodaOperator =
  | "answer"
  | "nav_pills"
  | "discover"
  | "compare"
  | "locate"
  | "open"
  | "other";

/**
 * Retrieval strategy
 */
export type RetrievalStrategy = "semantic" | "lexical" | "hybrid" | "unknown";

/**
 * Provider and stage taxonomies for LLM calls
 */
export type LLMProviderKey = "openai" | "google" | "local" | "unknown";

export type PipelineStage =
  | "input_normalization"
  | "intent_operator"
  | "scope_resolution"
  | "retrieval"
  | "evidence_gate"
  | "trust_gate"
  | "compose"
  | "quality_gates"
  | "output_contract"
  | "stream";

/**
 * Result status for events
 */
export type TelemetryStatus = "ok" | "fail";

/* ---------------------------------------------
 * Write payloads (DB create inputs)
 * -------------------------------------------- */

/**
 * UsageEvent: product-level actions
 */
export interface UsageEventCreate {
  userId: string;
  tenantId?: string | null;

  eventType:
    | "SESSION_START"
    | "SESSION_END"
    | "CHAT_MESSAGE_SENT"
    | "CONVERSATION_CREATED"
    | "DOCUMENT_UPLOADED"
    | "DOCUMENT_DELETED"
    | "DOCUMENT_PREVIEW_OPENED"
    | "DOCUMENT_DOWNLOADED"
    | "SEARCH_PERFORMED"
    | "REGENERATE_USED"
    | "COPY_USED"
    | "SOURCE_PILL_CLICKED"
    | "FILE_PILL_CLICKED";

  at: Date;

  // Context (optional)
  conversationId?: string | null;
  documentId?: string | null;
  folderId?: string | null;

  // Lightweight metadata (safe for logs)
  locale?: string | null;
  deviceType?: "mobile" | "desktop" | "unknown" | null;

  meta?: Record<string, unknown> | null;
}

/**
 * ModelCall: LLM usage + cost monitoring
 */
export interface ModelCallCreate {
  userId: string;
  tenantId?: string | null;

  traceId: string;
  turnId?: string | null;

  provider: LLMProviderKey;
  model: string;

  stage: PipelineStage;

  status: TelemetryStatus;
  errorCode?: string | null;

  // Tokens + latency
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;

  firstTokenMs?: number | null;
  durationMs?: number | null;

  retries?: number | null;

  at: Date;

  meta?: Record<string, unknown> | null;
}

/**
 * RetrievalEvent: RAG grounding signals per answer
 */
export interface RetrievalEventCreate {
  userId: string;
  tenantId?: string | null;

  traceId: string;
  turnId?: string | null;

  conversationId?: string | null;

  operator: KodaOperator;
  intent: KodaIntent;
  domain: KodaDomain;

  docLockEnabled: boolean;

  strategy: RetrievalStrategy;

  candidates?: number | null;
  selected?: number | null;

  evidenceStrength?: number | null; // 0..1
  refined?: boolean | null;

  wrongDocPrevented?: boolean | null;

  sourcesCount?: number | null;
  navPillsUsed?: boolean | null;

  fallbackReasonCode?: string | null; // NO_EVIDENCE, WEAK_EVIDENCE, etc.

  at: Date;

  meta?: Record<string, unknown> | null;
}

/**
 * IngestionEvent: upload/extraction/indexing health
 */
export interface IngestionEventCreate {
  userId: string;
  tenantId?: string | null;

  documentId?: string | null;

  filename?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;

  status: TelemetryStatus;
  errorCode?: string | null;

  extractionMethod?: "pdf_parse" | "ocr" | "docx" | "xlsx" | "pptx" | "text" | "image" | "unknown" | null;

  pages?: number | null;
  ocrUsed?: boolean | null;
  ocrConfidence?: number | null;

  extractedTextLength?: number | null;
  tablesExtracted?: number | null;

  chunkCount?: number | null;

  embeddingProvider?: LLMProviderKey | null;
  embeddingModel?: string | null;

  durationMs?: number | null;

  at: Date;

  meta?: Record<string, unknown> | null;
}

/**
 * Generic write result contract for TelemetryService
 */
export interface TelemetryWriteResult {
  ok: boolean;
  mode: "disabled" | "buffered" | "immediate";
}
