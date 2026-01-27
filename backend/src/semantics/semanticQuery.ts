/**
 * SemanticQuery Module - ChatGPT Parity Phase 1
 *
 * Consolidates routing output with domain understanding, entity extraction,
 * and format constraints into a unified semantic representation.
 *
 * This is the "understanding" layer that bridges:
 * - Router output (intentFamily, operator, docScope)
 * - Domain detection (finance, legal, medical, general)
 * - Entity extraction (metrics, docNames, timeWindows, amounts)
 * - Format constraints (from formatConstraintParser)
 * - Language and follow-up context
 *
 * Used by AnswerPlanService to create intelligent answer plans.
 */

import type { IntentFamily, Operator } from '../types/handlerResult.types';
import type { FormatConstraints } from '../services/core/inputs/formatConstraintParser.service';
import type { RoutingDecision as RoutingResult } from '../services/core/routing/router.service';

// Local type aliases for types no longer exported from old router
type DocScope = string;
type DocScopeMode = 'single' | 'multi' | 'all' | 'none';
type RoutingRequest = Record<string, any>;
type SupportedLanguage = 'en' | 'pt' | 'es';

function parseFormatConstraints(_text: string, _lang?: string): FormatConstraints {
  return {};
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type Domain = 'finance' | 'legal' | 'medical' | 'engineering' | 'accounting' | 'general';
export type DepthPreference = 'quick' | 'normal' | 'deep';
export type Language = 'en' | 'pt' | 'es';

/**
 * Extracted entities from the query
 */
export interface ExtractedEntities {
  /** Financial/business metrics: "revenue", "EBITDA", "margin" */
  metrics: string[];
  /** Document names referenced: "P&L 2024.xlsx", "Q3 Report" */
  docNames: string[];
  /** Time windows: "Q3", "July", "2024", "last month" */
  timeWindows: string[];
  /** Amounts and percentages: "$1.2M", "45%", "€500K" */
  amounts: string[];
  /** Named entities: company names, people, locations */
  namedEntities: string[];
}

/**
 * Follow-up context from previous turn
 */
export interface FollowUpContext {
  previousOperator: Operator;
  previousDocIds: string[];
  previousDocNames?: string[];
  previousEntities?: ExtractedEntities;
}

/**
 * SemanticQuery - The unified understanding of a user query
 *
 * Combines routing decisions with semantic understanding for
 * intelligent answer planning.
 */
export interface SemanticQuery {
  // ════════════════════════════════════════════════════
  // FROM ROUTING
  // ════════════════════════════════════════════════════

  /** Primary intent family from router */
  intentFamily: IntentFamily;
  /** Specific operator within the intent family */
  operator: Operator;
  /** Routing confidence score (0-1) */
  confidence: number;
  /** Sub-intent for more granular handling */
  subIntent?: string;

  // ════════════════════════════════════════════════════
  // SCOPE UNDERSTANDING
  // ════════════════════════════════════════════════════

  /** Document scope mode */
  scopeMode: DocScopeMode;
  /** Target document IDs (if single_doc or multi_doc) */
  targetDocIds: string[];
  /** Target document names (if detected) */
  targetDocNames: string[];
  /** Scope determination confidence */
  scopeConfidence: number;

  // ════════════════════════════════════════════════════
  // DOMAIN UNDERSTANDING
  // ════════════════════════════════════════════════════

  /** Detected domain (finance, legal, medical, etc.) */
  domain: Domain;
  /** Domain-specific keywords found in query */
  domainKeywords: string[];
  /** Domain detection confidence */
  domainConfidence: number;

  // ════════════════════════════════════════════════════
  // EXTRACTED ENTITIES
  // ════════════════════════════════════════════════════

  /** Entities extracted from the query */
  entities: ExtractedEntities;

  // ════════════════════════════════════════════════════
  // USER PREFERENCES
  // ════════════════════════════════════════════════════

  /** Response depth preference */
  depthPreference: DepthPreference;
  /** Format constraints from query */
  formatConstraints: FormatConstraints;

  // ════════════════════════════════════════════════════
  // LANGUAGE
  // ════════════════════════════════════════════════════

  /** Detected/locked language */
  language: Language;

  // ════════════════════════════════════════════════════
  // FOLLOW-UP CONTEXT
  // ════════════════════════════════════════════════════

  /** Whether this is a follow-up query */
  isFollowUp: boolean;
  /** Context inherited from previous turn */
  inheritedContext?: FollowUpContext;

  // ════════════════════════════════════════════════════
  // RAW DATA
  // ════════════════════════════════════════════════════

  /** Original user query (before normalization) */
  originalQuery: string;
  /** Normalized query (after typo corrections) */
  normalizedQuery: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN DETECTION
// ═══════════════════════════════════════════════════════════════════════════

interface DomainPattern {
  domain: Domain;
  keywords: RegExp[];
  confidence: number;
}

const DOMAIN_PATTERNS: DomainPattern[] = [
  {
    domain: 'finance',
    keywords: [
      /\b(revenue|profit|loss|margin|ebitda|cash\s*flow|roi|expense|budget|forecast|p\&l|income|balance\s*sheet|financial|fiscal|quarter|q[1-4]|fy\d{2,4})\b/i,
      /\b(receita|lucro|prejuízo|margem|despesa|orçamento|previsão|balanço|financeiro|trimestre)\b/i,
    ],
    confidence: 0.85,
  },
  {
    domain: 'legal',
    keywords: [
      /\b(contract|agreement|clause|liability|compliance|regulation|legal|law|lawsuit|litigation|terms|conditions|warranty|indemnity)\b/i,
      /\b(contrato|acordo|cláusula|responsabilidade|conformidade|regulamento|legal|lei|processo|litígio|termos|condições|garantia)\b/i,
    ],
    confidence: 0.85,
  },
  {
    domain: 'medical',
    keywords: [
      /\b(patient|diagnosis|treatment|symptom|medication|prescription|clinical|medical|healthcare|disease|therapy|dosage)\b/i,
      /\b(paciente|diagnóstico|tratamento|sintoma|medicamento|prescrição|clínico|médico|saúde|doença|terapia|dosagem)\b/i,
    ],
    confidence: 0.85,
  },
  {
    domain: 'engineering',
    keywords: [
      /\b(specification|requirement|design|architecture|component|system|technical|engineering|module|interface|protocol)\b/i,
      /\b(especificação|requisito|design|arquitetura|componente|sistema|técnico|engenharia|módulo|interface|protocolo)\b/i,
    ],
    confidence: 0.80,
  },
  {
    domain: 'accounting',
    keywords: [
      /\b(debit|credit|ledger|journal|account|audit|tax|depreciation|amortization|accrual|reconciliation|invoice)\b/i,
      /\b(débito|crédito|razão|diário|conta|auditoria|imposto|depreciação|amortização|provisão|reconciliação|fatura)\b/i,
    ],
    confidence: 0.85,
  },
];

function detectDomain(query: string): { domain: Domain; keywords: string[]; confidence: number } {
  const matchedKeywords: string[] = [];
  let bestMatch: { domain: Domain; confidence: number } = { domain: 'general', confidence: 0.5 };

  for (const pattern of DOMAIN_PATTERNS) {
    for (const regex of pattern.keywords) {
      const matches = query.match(regex);
      if (matches) {
        matchedKeywords.push(...matches);
        if (pattern.confidence > bestMatch.confidence) {
          bestMatch = { domain: pattern.domain, confidence: pattern.confidence };
        }
      }
    }
  }

  return {
    domain: bestMatch.domain,
    keywords: Array.from(new Set(matchedKeywords)),
    confidence: bestMatch.confidence,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTITY EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

const METRIC_PATTERNS = [
  /\b(revenue|profit|loss|margin|ebitda|cash\s*flow|roi|expense|cost|budget|forecast|growth|rate|ratio|turnover|yield)\b/gi,
  /\b(receita|lucro|prejuízo|margem|despesa|custo|orçamento|previsão|crescimento|taxa|proporção)\b/gi,
];

const TIME_PATTERNS = [
  // Quarters
  /\bq[1-4]\s*(?:20\d{2})?\b/gi,
  /\b(?:first|second|third|fourth)\s+quarter\b/gi,
  /\b(?:primeiro|segundo|terceiro|quarto)\s+trimestre\b/gi,
  // Years
  /\b(?:fy|year|ano)?\s*20\d{2}\b/gi,
  // Months
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,
  /\b(?:janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/gi,
  // Relative
  /\b(?:last|this|next|previous)\s+(?:month|year|quarter|week)\b/gi,
  /\b(?:último|este|próximo|anterior)\s+(?:mês|ano|trimestre|semana)\b/gi,
  // Specific dates
  /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g,
];

const AMOUNT_PATTERNS = [
  // Currency with amounts: $1,234.56, €500K, £1.2M, R$1000
  /[$€£¥R\$]?\s*[\d,]+\.?\d*\s*[KMB]?(?:illion)?/gi,
  // Percentages
  /\d+(?:\.\d+)?%/g,
  // Large numbers with suffixes
  /\b\d+(?:\.\d+)?\s*(?:thousand|million|billion|mil|milhão|bilhão)\b/gi,
];

const DOC_NAME_PATTERNS = [
  // Files with extensions
  /[\w\s\-\.]+\.(?:pdf|xlsx?|docx?|pptx?|csv|txt)/gi,
  // Quoted names
  /"([^"]+)"/g,
  /'([^']+)'/g,
  // Common document prefixes
  /\b(?:the|o|a)\s+([\w\s\-]+(?:report|relatório|documento|document|presentation|apresentação|spreadsheet|planilha))\b/gi,
];

function extractEntities(query: string): ExtractedEntities {
  const entities: ExtractedEntities = {
    metrics: [],
    docNames: [],
    timeWindows: [],
    amounts: [],
    namedEntities: [],
  };

  // Extract metrics
  for (const pattern of METRIC_PATTERNS) {
    const matches = query.match(pattern);
    if (matches) {
      entities.metrics.push(...matches.map(m => m.toLowerCase()));
    }
  }

  // Extract time windows
  for (const pattern of TIME_PATTERNS) {
    const matches = query.match(pattern);
    if (matches) {
      entities.timeWindows.push(...matches);
    }
  }

  // Extract amounts
  for (const pattern of AMOUNT_PATTERNS) {
    const matches = query.match(pattern);
    if (matches) {
      entities.amounts.push(...matches);
    }
  }

  // Extract document names
  for (const pattern of DOC_NAME_PATTERNS) {
    const matches = query.match(pattern);
    if (matches) {
      entities.docNames.push(...matches.map(m => m.trim()));
    }
  }

  // Deduplicate
  entities.metrics = Array.from(new Set(entities.metrics));
  entities.docNames = Array.from(new Set(entities.docNames));
  entities.timeWindows = Array.from(new Set(entities.timeWindows));
  entities.amounts = Array.from(new Set(entities.amounts));

  return entities;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEPTH PREFERENCE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

const QUICK_PATTERNS = [
  /\b(?:quick|brief|short|fast|rapid|summary|tldr|tl;dr|in\s+a\s+nutshell|one\s+sentence|one\-liner)\b/i,
  /\b(?:rápido|breve|curto|resumo|em\s+uma\s+frase|resumidamente)\b/i,
];

const DEEP_PATTERNS = [
  /\b(?:detailed|comprehensive|thorough|in[\s-]?depth|complete|full|extensive|elaborate|explain\s+in\s+detail)\b/i,
  /\b(?:detalhado|completo|abrangente|profundo|extenso|elaborado|explique\s+em\s+detalhe)\b/i,
];

function detectDepthPreference(query: string): DepthPreference {
  for (const pattern of QUICK_PATTERNS) {
    if (pattern.test(query)) {
      return 'quick';
    }
  }

  for (const pattern of DEEP_PATTERNS) {
    if (pattern.test(query)) {
      return 'deep';
    }
  }

  return 'normal';
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export interface BuildSemanticQueryInput {
  /** The routing result from router.route() */
  routingResult: RoutingResult;
  /** The original routing request */
  routingRequest: RoutingRequest;
  /** The original user query (before normalization) */
  originalQuery: string;
  /** The normalized query (after typo corrections) */
  normalizedQuery: string;
}

/**
 * Build a SemanticQuery from routing result and query text.
 *
 * This is the main entry point for creating a semantic representation
 * of the user's query. It combines:
 * - Routing decisions (intent, operator, scope)
 * - Domain detection (finance, legal, etc.)
 * - Entity extraction (metrics, dates, amounts)
 * - Format constraints (bullets, tables, etc.)
 * - Depth preference (quick, normal, deep)
 *
 * @param input - The routing result and query information
 * @returns A complete SemanticQuery object
 */
export function buildSemanticQuery(input: BuildSemanticQueryInput): SemanticQuery {
  const { routingResult, routingRequest, originalQuery, normalizedQuery } = input;

  // 1. Domain detection
  const domainResult = detectDomain(normalizedQuery);

  // 2. Entity extraction
  const entities = extractEntities(normalizedQuery);

  // 3. Format constraints
  const rd = routingResult as any;
  const formatConstraints = parseFormatConstraints(
    normalizedQuery,
    (rd.languageLocked ?? rd.language ?? 'en') as SupportedLanguage
  );

  // 4. Depth preference
  const depthPreference = detectDepthPreference(normalizedQuery);

  // 5. Build follow-up context if applicable
  let inheritedContext: FollowUpContext | undefined;
  if ((rd.flags ?? rd.signals)?.isFollowup && routingRequest.previousOperator) {
    inheritedContext = {
      previousOperator: routingRequest.previousOperator as Operator,
      previousDocIds: routingRequest.recentDocIds || [],
      previousDocNames: routingRequest.recentDocNames,
    };
  }

  // 6. Scope confidence (from routing debug info if available)
  const scopeConfidence = (rd._debug ?? rd.trace)?.scopeDecision?.confidence || 0.7;

  // 7. Build the semantic query
  const semanticQuery: SemanticQuery = {
    // From routing
    intentFamily: rd.intentFamily as IntentFamily,
    operator: rd.operator as Operator,
    confidence: rd.confidence ?? 0.5,
    subIntent: rd.subIntent ?? null,

    // Scope understanding
    scopeMode: (rd.docScope?.mode ?? 'all') as DocScopeMode,
    targetDocIds: rd.docScope?.docIds || [],
    targetDocNames: rd.docScope?.docNames || [],
    scopeConfidence,

    // Domain understanding
    domain: domainResult.domain,
    domainKeywords: domainResult.keywords,
    domainConfidence: domainResult.confidence,

    // Extracted entities
    entities,

    // User preferences
    depthPreference,
    formatConstraints,

    // Language
    language: rd.languageLocked ?? rd.language ?? 'en',

    // Follow-up context
    isFollowUp: (rd.flags ?? rd.signals)?.isFollowup ?? false,
    inheritedContext,

    // Raw data
    originalQuery,
    normalizedQuery,
  };

  return semanticQuery;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if the semantic query requires RAG retrieval
 */
export function requiresRetrieval(sq: SemanticQuery): boolean {
  // file_actions, help, conversation don't need RAG
  if (['file_actions', 'help', 'conversation', 'error'].includes(sq.intentFamily)) {
    return false;
  }

  // documents, doc_stats, reasoning need RAG
  return true;
}

/**
 * Get the primary document reference (if single_doc scope)
 */
export function getPrimaryDocRef(sq: SemanticQuery): { id?: string; name?: string } | null {
  if ((sq.scopeMode as string) !== 'single_doc') {
    return null;
  }

  return {
    id: sq.targetDocIds[0],
    name: sq.targetDocNames[0],
  };
}

/**
 * Check if the query has explicit format requirements
 */
export function hasExplicitFormatRequirements(sq: SemanticQuery): boolean {
  const fc = sq.formatConstraints;
  const fca = fc as any;
  return fca.wantsBullets || fca.wantsNumbered || fca.wantsTable || fca.bulletCount !== undefined;
}

/**
 * Get a summary string for logging/debugging
 */
export function semanticQuerySummary(sq: SemanticQuery): string {
  const parts: string[] = [
    `${sq.intentFamily}/${sq.operator}`,
    `scope=${sq.scopeMode}`,
    `domain=${sq.domain}`,
    `depth=${sq.depthPreference}`,
    `lang=${sq.language}`,
  ];

  if (sq.isFollowUp) {
    parts.push('followup');
  }

  if ((sq.formatConstraints as any).wantsTable) {
    parts.push('table');
  }

  if ((sq.formatConstraints as any).bulletCount) {
    parts.push(`bullets=${(sq.formatConstraints as any).bulletCount}`);
  }

  if (sq.entities.metrics.length > 0) {
    parts.push(`metrics=${sq.entities.metrics.slice(0, 3).join(',')}`);
  }

  return parts.join(' | ');
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const semanticQueryModule = {
  buildSemanticQuery,
  detectDomain,
  extractEntities,
  detectDepthPreference,
  requiresRetrieval,
  getPrimaryDocRef,
  hasExplicitFormatRequirements,
  semanticQuerySummary,
};

export default semanticQueryModule;
