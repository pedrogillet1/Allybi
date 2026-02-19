// backend/src/services/telemetry/telemetry.constants.ts
//
// Stable constants for telemetry.
// - Keep these values stable to avoid breaking dashboards and aggregations.
// - No user-facing microcopy.
// - Domain taxonomy includes your 25+ list (normalized keys).

import type { KodaDomain, KodaIntent, KodaOperator, LLMProviderKey, PipelineStage, RetrievalStrategy } from "./telemetry.types";

/* ----------------------------- Ranges ----------------------------- */

export const TELEMETRY_RANGES = ["24h", "7d", "30d", "90d"] as const;

/* ----------------------------- Providers / stages ----------------------------- */

export const LLM_PROVIDERS: LLMProviderKey[] = ["openai", "google", "local", "unknown"];

export const PIPELINE_STAGES: PipelineStage[] = [
  "input_normalization",
  "intent_operator",
  "scope_resolution",
  "retrieval",
  "evidence_gate",
  "trust_gate",
  "compose",
  "quality_gates",
  "output_contract",
  "stream",
];

export const RETRIEVAL_STRATEGIES: RetrievalStrategy[] = ["semantic", "lexical", "hybrid", "unknown"];

/* ----------------------------- Intents / operators ----------------------------- */

export const INTENTS: KodaIntent[] = [
  "answer",
  "compare",
  "find",
  "open",
  "discover",
  "summarize",
  "extract",
  "translate",
  "timeline",
  "checklist",
  "other",
];

export const OPERATORS: KodaOperator[] = [
  "answer",
  "nav_pills",
  "discover",
  "compare",
  "locate",
  "open",
  "other",
];

/* ----------------------------- Usage event types ----------------------------- */

export const USAGE_EVENT_TYPES = [
  "SESSION_START",
  "SESSION_END",
  "CHAT_MESSAGE_SENT",
  "CONVERSATION_CREATED",
  "ALLYBI_VISIT_STARTED",
  "ALLYBI_PUBLIC_VISIT_STARTED",
  "ALLYBI_OPEN_CLICKED",
  "ALLYBI_SUGGESTION_CLICKED",
  "ALLYBI_MESSAGE_SENT",
  "ALLYBI_APPLY_CLICKED",
  "DOCUMENT_UPLOADED",
  "DOCUMENT_DELETED",
  "DOCUMENT_PREVIEW_OPENED",
  "DOCUMENT_DOWNLOADED",
  "SEARCH_PERFORMED",
  "REGENERATE_USED",
  "COPY_USED",
  "SOURCE_PILL_CLICKED",
  "FILE_PILL_CLICKED",
] as const;

/* ----------------------------- Domains (25+ taxonomy) ----------------------------- */
/**
 * These keys are normalized, stable identifiers.
 * Map display labels in frontend (i18n), not here.
 */
export const DOMAINS: KodaDomain[] = [
  "legal_contracts",
  "corporate_ma",
  "litigation_disputes",
  "compliance_regulatory",
  "finance_accounting",
  "investment_banking",
  "portfolio_management",
  "tax",
  "insurance",
  "real_estate",
  "hr_employment",
  "sales_crm",
  "procurement_supply_chain",
  "operations_sops",
  "engineering_projects",
  "architecture_plans",
  "manufacturing_quality",
  "healthcare_records",
  "education_academic",
  "research_scientific",
  "government_public",
  "cybersecurity_it",
  "product_specs_manuals",
  "customer_support",
  "marketing_ads",
  "personal_household",
  "travel_immigration",
  "media_audio_video",
  "unknown",
];

/* Optional: display labels (backend-safe, not user-facing copy) */
export const DOMAIN_LABEL_MAP: Record<KodaDomain, string> = {
  legal_contracts: "Legal / Contracts",
  corporate_ma: "Corporate / M&A",
  litigation_disputes: "Litigation / Disputes",
  compliance_regulatory: "Compliance / Regulatory",
  finance_accounting: "Finance / Accounting",
  investment_banking: "Investment Banking (IBD)",
  portfolio_management: "Portfolio / Asset Management",
  tax: "Tax",
  insurance: "Insurance",
  real_estate: "Real Estate / Leases",
  hr_employment: "HR / Employment",
  sales_crm: "Sales / CRM / Commercial",
  procurement_supply_chain: "Procurement / Vendor / Supply Chain",
  operations_sops: "Operations / SOPs",
  engineering_projects: "Engineering / Construction / Projects",
  architecture_plans: "Architecture / Drawings / Plans",
  manufacturing_quality: "Manufacturing / Quality Control",
  healthcare_records: "Healthcare / Medical Records",
  education_academic: "Education / Academic",
  research_scientific: "Research / Scientific",
  government_public: "Government / Public Sector",
  cybersecurity_it: "Cybersecurity / IT",
  product_specs_manuals: "Product / Specs / Manuals",
  customer_support: "Customer Support / Tickets",
  marketing_ads: "Marketing / Brand / Ads",
  personal_household: "Personal / Household Docs",
  travel_immigration: "Travel / Immigration Docs",
  media_audio_video: "Media / Audio / Video Notes",
  unknown: "Unknown",
};

/* ----------------------------- Thresholds (tune later) ----------------------------- */

export const QUALITY_THRESHOLDS = {
  weakEvidence: 0.35,
  strongEvidence: 0.7,
} as const;

/* ----------------------------- Metrics (timeseries) ----------------------------- */

export const TIMESERIES_METRICS = [
  "dau",
  "messages",
  "uploads",
  "allybi_visits",
  "allybi_clicks",
  "tokens",
  "weak_evidence_rate",
  "llm_errors",
  "ingestion_failures",
] as const;
