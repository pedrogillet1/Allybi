/**
 * KODA V3 Domain Enforcement Service
 *
 * Ensures domain-specific intents (accounting, engineering, finance, legal, medical)
 * are enforced through the entire flow:
 * - Retrieval: File type filtering, keyword boosting
 * - Answer: Domain context for prompts
 * - Formatting: Domain-specific rules
 *
 * NOTE: Excel/Calculations REMOVED from domains as of 2025-12-18
 * Excel + Math is now FILE_ACTIONS.calculation (sub-intent), not a domain.
 * Calculations are HOW data is processed, not WHAT kind of knowledge.
 * Python Math Engine handles all numerical operations deterministically.
 * See: routing_priority.json, intent_schema.json, calculation_schemas.json
 */

import { IntentName } from '../../types/intentV3.types';

// Domain-specific intent names
// NOTE: Excel/Math removed - now handled as FILE_ACTIONS.calculation sub-intent
export type DomainIntent = 'accounting' | 'engineering' | 'finance' | 'legal' | 'medical';

// File type mappings for domain filtering
// NOTE: Excel/Calculations removed - handled by Python Math Engine, not domain enforcement
const DOMAIN_FILE_TYPES: Record<DomainIntent, string[]> = {
  accounting: ['.xlsx', '.xls', '.csv', '.pdf', '.xlsm'],
  engineering: ['.pdf', '.dwg', '.dxf', '.step', '.iges', '.stl'],
  finance: ['.xlsx', '.xls', '.csv', '.pdf'],
  legal: ['.pdf', '.docx', '.doc'],
  medical: ['.pdf', '.docx', '.doc', '.hl7'],
};

// Domain-specific boost keywords (for retrieval)
// NOTE: Excel/Calculations removed - handled by Python Math Engine
const DOMAIN_BOOST_KEYWORDS: Record<DomainIntent, string[]> = {
  accounting: ['ledger', 'debit', 'credit', 'journal', 'balance', 'account'],
  engineering: ['specification', 'tolerance', 'requirement', 'design', 'ISO'],
  finance: ['revenue', 'EBITDA', 'P&L', 'balance sheet', 'cash flow'],
  legal: ['contract', 'clause', 'agreement', 'section', 'liability'],
  medical: ['patient', 'diagnosis', 'lab result', 'medication', 'symptom'],
};

// Domain-specific prompt context (for answer engine)
// NOTE: Excel/Calculations removed - handled by Python Math Engine with structured JSON results
const DOMAIN_PROMPT_CONTEXT: Record<DomainIntent, string> = {
  accounting: 'The user is asking about accounting records. Focus on journal entries, debits, credits, and financial accounts.',
  engineering: 'The user is asking about engineering documents. Focus on specifications, tolerances, requirements, and technical details.',
  finance: 'The user is asking about financial documents. Focus on revenue, expenses, ratios, and financial metrics.',
  legal: 'The user is asking about legal documents. Focus on clauses, terms, obligations, and legal provisions.',
  medical: 'The user is asking about medical records. Focus on patient data, diagnoses, lab results, and clinical information.',
};

// Domain-specific formatting hints
// NOTE: Excel/Calculations removed - uses Python Math Engine for numerical output
const DOMAIN_FORMATTING_HINTS: Record<DomainIntent, {
  preferTables: boolean;
  includeCitations: boolean;
  useStructuredOutput: boolean;
}> = {
  accounting: { preferTables: true, includeCitations: true, useStructuredOutput: true },
  engineering: { preferTables: false, includeCitations: true, useStructuredOutput: false },
  finance: { preferTables: true, includeCitations: true, useStructuredOutput: true },
  legal: { preferTables: false, includeCitations: true, useStructuredOutput: false },
  medical: { preferTables: false, includeCitations: true, useStructuredOutput: false },
};

export interface DomainEnforcementContext {
  isDomainSpecific: boolean;
  domain?: DomainIntent;
  fileTypeFilters?: string[];
  boostKeywords?: string[];
  promptContext?: string;
  formattingHints?: {
    preferTables: boolean;
    includeCitations: boolean;
    useStructuredOutput: boolean;
  };
}

export class DomainEnforcementService {
  private readonly logger: Console;

  constructor(logger?: Console) {
    this.logger = logger || console;
  }

  /**
   * Check if an intent is domain-specific.
   */
  isDomainSpecificIntent(intent: IntentName): boolean {
    // NOTE: Excel/Calculations removed - now FILE_ACTIONS.calculation sub-intent, not a domain
    return ['accounting', 'engineering', 'finance', 'legal', 'medical'].includes(intent);
  }

  /**
   * Get domain enforcement context for an intent.
   * Returns filtering, boosting, and formatting rules for domain-specific intents.
   */
  getDomainContext(intent: IntentName): DomainEnforcementContext {
    if (!this.isDomainSpecificIntent(intent)) {
      return { isDomainSpecific: false };
    }

    const domain = intent as DomainIntent;

    return {
      isDomainSpecific: true,
      domain,
      fileTypeFilters: DOMAIN_FILE_TYPES[domain],
      boostKeywords: DOMAIN_BOOST_KEYWORDS[domain],
      promptContext: DOMAIN_PROMPT_CONTEXT[domain],
      formattingHints: DOMAIN_FORMATTING_HINTS[domain],
    };
  }

  /**
   * Filter chunks by domain file types.
   * Used in retrieval to prefer domain-relevant documents.
   */
  filterByDomain<T extends { documentName?: string; metadata?: { filename?: string; fileType?: string } }>(
    chunks: T[],
    domain: DomainIntent
  ): T[] {
    const fileTypes = DOMAIN_FILE_TYPES[domain];
    if (!fileTypes || fileTypes.length === 0) {
      return chunks;
    }

    // Score chunks: domain-matching files get higher priority
    const scored = chunks.map(chunk => {
      const filename = chunk.documentName || chunk.metadata?.filename || '';
      const fileType = chunk.metadata?.fileType || '';
      const lowerFilename = filename.toLowerCase();

      // Check if file matches domain file types
      const matchesDomain = fileTypes.some(ext =>
        lowerFilename.endsWith(ext.toLowerCase()) || fileType.toLowerCase() === ext.replace('.', '')
      );

      return { chunk, matchesDomain };
    });

    // Sort: domain matches first, then original order
    scored.sort((a, b) => {
      if (a.matchesDomain && !b.matchesDomain) return -1;
      if (!a.matchesDomain && b.matchesDomain) return 1;
      return 0;
    });

    // Log how many chunks matched domain
    const domainMatchCount = scored.filter(s => s.matchesDomain).length;
    this.logger.info(`[DomainEnforcement] ${domainMatchCount}/${chunks.length} chunks match domain ${domain}`);

    return scored.map(s => s.chunk);
  }

  /**
   * Boost chunk scores based on domain keywords.
   * Used in retrieval ranking to prefer domain-relevant content.
   */
  applyDomainBoost<T extends { content?: string; score?: number }>(
    chunks: T[],
    domain: DomainIntent
  ): T[] {
    const boostKeywords = DOMAIN_BOOST_KEYWORDS[domain];
    if (!boostKeywords || boostKeywords.length === 0) {
      return chunks;
    }

    return chunks.map(chunk => {
      if (!chunk.content || chunk.score === undefined) {
        return chunk;
      }

      const lowerContent = chunk.content.toLowerCase();
      let matchCount = 0;

      for (const keyword of boostKeywords) {
        if (lowerContent.includes(keyword.toLowerCase())) {
          matchCount++;
        }
      }

      // Apply boost: each matched keyword adds 0.02 to score (capped at 0.1 total boost)
      const boost = Math.min(matchCount * 0.02, 0.1);
      const boostedScore = Math.min(chunk.score + boost, 1.0);

      return { ...chunk, score: boostedScore };
    });
  }

  /**
   * Get domain-specific system prompt addition.
   * Used by answer engine to include domain context.
   */
  getDomainPromptContext(domain: DomainIntent): string {
    return DOMAIN_PROMPT_CONTEXT[domain] || '';
  }

  /**
   * Get domain formatting preferences.
   * Used by formatting pipeline to apply domain-specific rules.
   */
  getDomainFormattingHints(domain: DomainIntent) {
    return DOMAIN_FORMATTING_HINTS[domain] || {
      preferTables: false,
      includeCitations: true,
      useStructuredOutput: false,
    };
  }
}

// Singleton instance
export const domainEnforcementService = new DomainEnforcementService();

export default DomainEnforcementService;
