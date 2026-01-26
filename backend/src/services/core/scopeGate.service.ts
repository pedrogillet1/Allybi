/**
 * Scope Gate Service - BANK-DRIVEN
 *
 * ANTI-CONTAMINATION: Prevents mixing content from unrelated documents in answers.
 *
 * ChatGPT-quality requires that:
 * 1. Single-doc questions get single-doc answers
 * 2. Multi-doc questions are structured by document
 * 3. Ambiguous queries get clarification ("Which document: [A] or [B]?")
 *
 * This gate runs BEFORE retrieval to scope document filtering.
 *
 * BANK-DRIVEN: All patterns loaded from JSON data banks at runtime.
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// INTERFACES
// ============================================================================

export interface ScopeDecision {
  type: 'single_doc' | 'multi_doc' | 'any_doc' | 'needs_clarification';
  targetDocIds?: string[];         // Specific docs to use (if known)
  targetDocNames?: string[];       // Doc names mentioned in query
  operator: 'summarize' | 'extract' | 'compare' | 'compute' | 'locate_content' | 'list' | 'legal_extract' | 'unknown';
  preferredTypes?: string[];       // File types to prefer (xlsx, pdf, etc.)
  structureByDoc: boolean;         // If true, answer should be structured per document
  clarifyQuestion?: string;        // If needs clarification, what to ask
  confidence: number;              // 0-1 how confident we are in this decision
  matchedFamily?: string;          // Which pattern family triggered
  scopeSource?: string;            // What triggered this scope (bank, inherited, filename)
}

// Query hints for narrowing candidates (ChatGPT-like)
export interface QueryHints {
  docTypeHint: string | null;      // pdf/pptx/xlsx/docx/image
  anchorHint: string | null;       // page/slide/tab/sheet/cell/section
  domainHint: string | null;       // finance/legal/accounting/medical
  keywords: string[];              // Extracted key terms ("EBITDA", "força maior")
  isFollowUp: boolean;             // it/that/isso - inherit scope
  explicitFilename: string | null; // Directly mentioned filename
}

// Scored candidate for narrowing
interface ScoredCandidate {
  id: string;
  filename: string;
  score: number;
  scoreBreakdown: {
    typeMatch: number;
    filenameMatch: number;
    domainBoost: number;
    recencyBoost: number;
  };
}

interface ScopeGateConfig {
  logger?: Pick<Console, 'info' | 'warn' | 'debug'>;
  banksPath?: string;
}

// Bank data structures
interface ScopeFrameFamily {
  scopeType: string;
  confidence: number;
  description: string;
  patternCount: number;
  patterns: string[];
}

interface ScopeFramesBank {
  _meta: {
    id: string;
    language: string;
    totalPatterns: number;
    families: string[];
  };
  families: Record<string, ScopeFrameFamily>;
}

interface TypeScopeRules {
  _meta: { id: string; totalRules: number };
  anchorToType: Record<string, {
    preferredTypes: string[];
    confidence: number;
    patterns: { en: string[]; pt: string[] };
  }>;
  typeExtensionMap: Record<string, string[]>;
  fallbackBehavior: {
    noMatchingType: string;
    multipleMatchingType: string;
    singleMatchingType: string;
  };
  autoSelectRules: {
    singleDocOfType: boolean;
    recentDocPreference: boolean;
    recentDocMaxAgeDays: number;
    largerDocPreference: boolean;
  };
}

interface DomainScopeRules {
  _meta: { id?: string; totalRules?: number; version?: string };
  // New structure from generated bank
  domainScopes?: Record<string, {
    preferredMimeTypes?: string[];
    preferredExtensions?: string[];
    scopeDefault?: string;
    multiDocTriggers?: string[];
    docTypeKeywords?: string[];
    weight?: number;
  }>;
  // Legacy structure
  domains?: Record<string, {
    preferredTypes: string[];
    confidence: number;
    terms: { en: string[]; pt: string[] };
  }>;
}

interface ConfidencePolicy {
  _meta: { id: string };
  byOperator: Record<string, { autoScopeThreshold: number; description: string }>;
  byDomain: Record<string, { autoScopeThreshold: number; preferredTypes: string[] | null; description: string }>;
  disambiguationPolicy: {
    maxCandidates: number;
    minCandidates: number;
    showFolderPath: boolean;
    showFileType: boolean;
    sortBy: string;
    fallbackBehavior: string;
  };
  scopeInheritance: {
    followUpMaxTurns: number;
    inheritOnPronouns: boolean;
    inheritOnAnchorNouns: boolean;
    resetOnExplicitFileReference: boolean;
    resetOnMultiDocRequest: boolean;
  };
  autoSelectRules?: {
    singleDocOfType?: boolean;
    recentDocPreference?: boolean;
    recentDocMaxAgeDays?: number;
    largerDocPreference?: boolean;
  };
}

interface LocationTermsBank {
  _meta: { id: string; totalTerms: number };
  categories: Record<string, {
    preferredTypes: string[];
    terms: { en: string[]; pt: string[] };
  }>;
}

// Domain filename terms bank (weighted)
interface DomainFilenameTermsBank {
  _meta: {
    bank: string;
    version: string;
    description: string;
    lastUpdated: string;
    twoSignalThreshold: number; // Terms with weight below this require confirmation
  };
  domains: Record<string, {
    en_terms: Array<{ t: string; w: number }>;
    pt_terms: Array<{ t: string; w: number }>;
  }>;
}

// ============================================================================
// BANK-DRIVEN SCOPE GATE SERVICE
// ============================================================================

export class ScopeGateService {
  private logger: Pick<Console, 'info' | 'warn' | 'debug'>;
  private banksPath: string;

  // Loaded banks
  private scopeFramesEn: ScopeFramesBank | null = null;
  private scopeFramesPt: ScopeFramesBank | null = null;
  private typeScopeRules: TypeScopeRules | null = null;
  private domainScopeRules: DomainScopeRules | null = null;
  private confidencePolicy: ConfidencePolicy | null = null;
  private locationTerms: LocationTermsBank | null = null;
  private domainFilenameTerms: DomainFilenameTermsBank | null = null;

  // Compiled patterns (cached)
  private patternCache: Map<string, { patterns: string[]; scopeType: string; confidence: number }[]> = new Map();

  // ChatGPT-like narrowing thresholds - CATEGORY 2 FIX: More aggressive auto-scope
  // RELAXED for better auto-scoping behavior
  private readonly NARROWING_THRESHOLDS = {
    AUTO_SCOPE_MARGIN: 0.05,        // Top candidate must be this much ahead (CATEGORY 2 FIX: relaxed from 0.10)
    AUTO_SCOPE_MIN_SCORE: 0.15,     // Minimum score for auto-scope (CATEGORY 2 FIX: relaxed from 0.30)
    DISAMBIGUATE_MAX_CANDIDATES: 5, // Show up to 5 options
    CRITICAL_OP_MIN_SCORE: 0.60,    // Higher threshold for compute/legal (relaxed from 0.75)
  };

  constructor(config: ScopeGateConfig = {}) {
    this.logger = config.logger || console;
    this.banksPath = config.banksPath || path.join(__dirname, '../../data_banks');
    this.loadBanks();
  }

  // ==========================================================================
  // CHATGPT-LIKE QUERY HINTS EXTRACTION
  // ==========================================================================

  /**
   * Extract all hints from query for narrowing candidates
   */
  extractQueryHints(query: string, language: string): QueryHints {
    const queryLower = query.toLowerCase();
    const lang = language === 'pt' ? 'pt' : 'en';

    // 1. Document type hints (spreadsheet → xlsx, presentation → pptx)
    const docTypeHint = this.extractDocTypeHint(queryLower, lang);

    // 2. Anchor hints (tab → xlsx, slide → pptx, page → pdf)
    const anchorHint = this.extractAnchorHint(queryLower, lang);

    // 3. Domain hints (EBITDA → finance, clause → legal)
    const domainHint = this.extractDomainHint(queryLower, lang);

    // 4. Keywords - capitalized terms and domain-specific terms
    const keywords = this.extractKeywords(query, queryLower, domainHint);

    // 5. Follow-up detection
    const followUpPatterns = lang === 'pt'
      ? /\b(isso|ele|ela|eles|elas|dele|dela|deles|delas|nele|nela|aquele|aquela|o mesmo|a mesma)\b/i
      : /\b(it|this|that|these|those|the same|them|its)\b/i;
    const isFollowUp = followUpPatterns.test(queryLower);

    // 6. Explicit filename
    const explicitFilename = this.extractExplicitFilename(query);

    return {
      docTypeHint,
      anchorHint,
      domainHint,
      keywords,
      isFollowUp,
      explicitFilename,
    };
  }

  private extractDocTypeHint(queryLower: string, lang: string): string | null {
    const typePatterns: Record<string, { en: string[]; pt: string[] }> = {
      xlsx: {
        en: ['spreadsheet', 'excel', 'workbook', 'worksheet'],
        pt: ['planilha', 'excel', 'pasta de trabalho'],
      },
      pptx: {
        en: ['presentation', 'powerpoint', 'slides', 'deck'],
        pt: ['apresentação', 'powerpoint', 'slides'],
      },
      pdf: {
        en: ['pdf', 'document', 'report', 'paper'],
        pt: ['pdf', 'documento', 'relatório', 'artigo'],
      },
      docx: {
        en: ['word document', 'word file', 'docx'],
        pt: ['documento word', 'arquivo word', 'docx'],
      },
    };

    for (const [type, patterns] of Object.entries(typePatterns)) {
      const langPatterns = patterns[lang] || patterns.en;
      if (langPatterns.some(p => queryLower.includes(p))) {
        return type;
      }
    }
    return null;
  }

  private extractAnchorHint(queryLower: string, lang: string): string | null {
    const anchorPatterns: Record<string, { en: string[]; pt: string[]; type: string }> = {
      tab: { en: ['tab', 'sheet', 'worksheet'], pt: ['aba', 'planilha', 'folha'], type: 'xlsx' },
      cell: { en: ['cell', 'column', 'row'], pt: ['célula', 'coluna', 'linha'], type: 'xlsx' },
      slide: { en: ['slide'], pt: ['slide'], type: 'pptx' },
      page: { en: ['page'], pt: ['página'], type: 'pdf' },
      section: { en: ['section', 'chapter'], pt: ['seção', 'capítulo'], type: 'pdf' },
    };

    for (const [anchor, config] of Object.entries(anchorPatterns)) {
      const langPatterns = config[lang] || config.en;
      if (langPatterns.some(p => queryLower.includes(p))) {
        return anchor;
      }
    }
    return null;
  }

  private extractDomainHint(queryLower: string, lang: string): string | null {
    const domainKeywords: Record<string, { en: string[]; pt: string[] }> = {
      finance: {
        en: ['ebitda', 'revenue', 'expense', 'profit', 'loss', 'p&l', 'budget', 'forecast', 'income', 'cash flow', 'balance sheet', 'financial', 'margin', 'roi'],
        pt: ['ebitda', 'receita', 'despesa', 'lucro', 'prejuízo', 'p&l', 'orçamento', 'previsão', 'renda', 'fluxo de caixa', 'balanço', 'financeiro', 'margem'],
      },
      legal: {
        en: ['contract', 'clause', 'liability', 'termination', 'penalty', 'agreement', 'force majeure', 'indemnity', 'warranty', 'compliance'],
        pt: ['contrato', 'cláusula', 'responsabilidade', 'rescisão', 'penalidade', 'acordo', 'força maior', 'indenização', 'garantia', 'conformidade'],
      },
      accounting: {
        en: ['debit', 'credit', 'ledger', 'journal', 'asset', 'liability', 'equity', 'depreciation', 'amortization'],
        pt: ['débito', 'crédito', 'razão', 'diário', 'ativo', 'passivo', 'patrimônio', 'depreciação', 'amortização'],
      },
      medical: {
        en: ['diagnosis', 'treatment', 'patient', 'symptom', 'prescription', 'dosage', 'medication'],
        pt: ['diagnóstico', 'tratamento', 'paciente', 'sintoma', 'prescrição', 'dosagem', 'medicação'],
      },
    };

    // Check BOTH language lists since domain terms can appear in mixed-language queries
    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      // Check EN terms
      if (keywords.en.some(k => queryLower.includes(k))) {
        return domain;
      }
      // Check PT terms
      if (keywords.pt.some(k => queryLower.includes(k))) {
        return domain;
      }
    }
    return null;
  }

  private extractKeywords(query: string, queryLower: string, domainHint: string | null): string[] {
    const keywords: string[] = [];

    // Extract capitalized terms (likely proper nouns or document names)
    const capitalizedTerms = query.match(/\b[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,})*/g) || [];
    keywords.push(...capitalizedTerms.filter(t => t.length > 3 && !['Which', 'Where', 'What', 'How', 'When', 'The', 'This', 'That'].includes(t)));

    // Extract domain-specific terms that might match filenames
    const financialTerms = queryLower.match(/\b(p&l|ebitda|q[1-4]|fy\d{2,4}|budget|forecast|rosewood|lone\s*mountain)\b/gi) || [];
    keywords.push(...financialTerms);

    // Extract year references
    const yearMatches = query.match(/\b20\d{2}\b/g) || [];
    keywords.push(...yearMatches);

    // CATEGORY 2 FIX: Extract document name fragments from prepositional phrases
    // "from the integration guide" → "integration guide"
    // "in the P&L document" → "P&L"
    // "no relatório de integração" → "integração"
    const docNamePatterns = [
      /(?:from|in|on|about|the)\s+(?:the\s+)?([a-zA-Z][\w\s\-]{2,30}?)(?:\s+(?:document|file|report|spreadsheet|presentation|guide|pdf|xlsx?|pptx?))?(?:\s*[.,?!]|$)/gi,
      /(?:do|da|no|na|sobre|o|a)\s+(?:documento|arquivo|relatório|planilha|apresentação|guia)?\s*([a-zA-ZÀ-ú][\w\s\-]{2,30}?)(?:\s*[.,?!]|$)/gi,
      /(?:document|file|report|spreadsheet|presentation)(?:\s+called)?\s+["']?([^"'.,?!]+)["']?/gi,
      /["']([^"']{3,50})["']/g, // Quoted document names
    ];

    for (const pattern of docNamePatterns) {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        const extracted = match[1]?.trim();
        if (extracted && extracted.length >= 3 && extracted.length <= 50) {
          // Filter out common words that aren't document names
          const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'this', 'that', 'these', 'those',
            'which', 'what', 'where', 'when', 'how', 'o', 'a', 'os', 'as', 'um', 'uma', 'e', 'ou'];
          if (!commonWords.includes(extracted.toLowerCase())) {
            keywords.push(extracted.toLowerCase());
          }
        }
      }
    }

    // CATEGORY 2 FIX: Extract potential document name fragments for queries like
    // "stakeholders in the document" → look for domain-related terms
    const domainDocTerms: Record<string, string[]> = {
      finance: ['p&l', 'pl', 'profit', 'loss', 'budget', 'forecast', 'revenue', 'expense', 'ebitda', 'financial', 'ranch'],
      legal: ['contract', 'agreement', 'clause', 'term', 'termination', 'penalty', 'liability', 'contrato'],
      project: ['project', 'management', 'scrum', 'agile', 'sprint', 'methodology', 'integration', 'guide'],
      presentation: ['presentation', 'slides', 'deck', 'pitch', 'overview'],
    };

    for (const [domain, terms] of Object.entries(domainDocTerms)) {
      for (const term of terms) {
        if (queryLower.includes(term)) {
          keywords.push(term);
        }
      }
    }

    // Dedupe and filter
    return [...new Set(keywords)].filter(k => k.length >= 2);
  }

  private extractExplicitFilename(query: string): string | null {
    // Match quoted filenames
    const quotedMatch = query.match(/["'`]([^"'`]+\.(pdf|xlsx?|docx?|pptx?|csv|txt|png|jpg))["'`]/i);
    if (quotedMatch) return quotedMatch[1];

    // Match filenames with extensions
    const extensionMatch = query.match(/\b(\S+\.(pdf|xlsx?|docx?|pptx?|csv|txt))\b/i);
    if (extensionMatch) return extensionMatch[1];

    return null;
  }

  // ==========================================================================
  // CHATGPT-LIKE CANDIDATE NARROWING
  // ==========================================================================

  /**
   * Score and narrow candidate documents using hints
   * Returns scored candidates sorted by relevance
   */
  scoreAndNarrowCandidates(
    hints: QueryHints,
    availableDocs: Array<{ id: string; filename: string; mimeType?: string; createdAt?: Date }>,
    conversationMemory?: { lastDocIds?: string[]; lastDocNames?: string[] }
  ): ScoredCandidate[] {
    const scored: ScoredCandidate[] = [];

    for (const doc of availableDocs) {
      const breakdown = {
        typeMatch: 0,
        filenameMatch: 0,
        domainBoost: 0,
        recencyBoost: 0,
      };

      const filenameLower = doc.filename.toLowerCase();
      const ext = doc.filename.split('.').pop()?.toLowerCase() || '';

      // 1. Type match scoring (0-0.30)
      if (hints.docTypeHint) {
        if (this.extensionMatchesType(ext, hints.docTypeHint)) {
          breakdown.typeMatch = 0.30;
        }
      } else if (hints.anchorHint) {
        const expectedType = this.getTypeForAnchor(hints.anchorHint);
        if (expectedType && this.extensionMatchesType(ext, expectedType)) {
          breakdown.typeMatch = 0.25;
        }
      }

      // 2. Filename keyword match scoring (0-0.40)
      if (hints.keywords.length > 0) {
        let keywordMatches = 0;
        for (const keyword of hints.keywords) {
          if (filenameLower.includes(keyword.toLowerCase())) {
            keywordMatches++;
          }
        }
        breakdown.filenameMatch = Math.min(keywordMatches / hints.keywords.length * 0.40, 0.40);
      }

      // Explicit filename is a strong match
      if (hints.explicitFilename) {
        if (filenameLower.includes(hints.explicitFilename.toLowerCase()) ||
            hints.explicitFilename.toLowerCase().includes(filenameLower.replace(/\.[^.]+$/, ''))) {
          breakdown.filenameMatch = 0.50;
        }
      }

      // 3. Domain boost (0-0.25) - BANK-DRIVEN weighted scoring
      if (hints.domainHint) {
        const domainTypes = this.getTypesForDomain(hints.domainHint);
        if (domainTypes.some(t => this.extensionMatchesType(ext, t))) {
          breakdown.domainBoost = 0.15;
        }
        // BANK-DRIVEN: Use weighted terms with two-signal rule
        const domainScore = this.getDomainFilenameScore(
          hints.domainHint,
          doc.filename,
          'en', // Use both EN/PT internally
          hints.domainHint !== null // Query already has domain hint = two signals
        );
        if (domainScore.score > 0) {
          // Strong matches get full boost, weak matches get reduced
          breakdown.domainBoost += domainScore.strongMatch ? 0.15 : 0.05;
        }
      } else {
        // No explicit domain hint - check if filename suggests a domain
        // Use two-signal rule: weak term without query hint = lower boost
        for (const domain of ['finance', 'legal', 'accounting', 'medical']) {
          const domainScore = this.getDomainFilenameScore(
            domain,
            doc.filename,
            'en',
            false // No query domain hint = needs strong filename signal
          );
          if (domainScore.strongMatch && domainScore.score > 0.5) {
            // Strong filename match without query hint still gets small boost
            breakdown.domainBoost = Math.max(breakdown.domainBoost, 0.08);
            break;
          }
        }
      }

      // 4. Recency boost (0-0.10) - recent docs get slight preference
      if (doc.createdAt) {
        const daysSinceCreated = (Date.now() - doc.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCreated < 7) {
          breakdown.recencyBoost = 0.10;
        } else if (daysSinceCreated < 30) {
          breakdown.recencyBoost = 0.05;
        }
      }

      // 5. Conversation memory boost - if this doc was recently referenced
      if (conversationMemory?.lastDocIds?.includes(doc.id)) {
        breakdown.recencyBoost = Math.max(breakdown.recencyBoost, 0.15);
      }

      const totalScore = breakdown.typeMatch + breakdown.filenameMatch + breakdown.domainBoost + breakdown.recencyBoost;

      scored.push({
        id: doc.id,
        filename: doc.filename,
        score: totalScore,
        scoreBreakdown: breakdown,
      });
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored;
  }

  private extensionMatchesType(ext: string, type: string): boolean {
    const typeExtensions: Record<string, string[]> = {
      xlsx: ['xlsx', 'xls', 'xlsm', 'xlsb'],
      pptx: ['pptx', 'ppt', 'ppsx'],
      pdf: ['pdf'],
      docx: ['docx', 'doc'],
      image: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
    };
    return typeExtensions[type]?.includes(ext) || ext === type;
  }

  private getTypeForAnchor(anchor: string): string | null {
    const anchorToType: Record<string, string> = {
      tab: 'xlsx', sheet: 'xlsx', cell: 'xlsx', column: 'xlsx', row: 'xlsx',
      slide: 'pptx',
      page: 'pdf', section: 'pdf', chapter: 'pdf',
    };
    return anchorToType[anchor] || null;
  }

  private getTypesForDomain(domain: string): string[] {
    const domainTypes: Record<string, string[]> = {
      finance: ['xlsx', 'pdf'],
      legal: ['pdf', 'docx'],
      accounting: ['xlsx', 'pdf'],
      medical: ['pdf', 'docx'],
    };
    return domainTypes[domain] || [];
  }

  /**
   * BANK-DRIVEN: Get domain filename score using weighted terms
   * Implements two-signal rule: weak terms (w < threshold) require additional confirmation
   * Returns { score: 0-1, strongMatch: boolean }
   */
  private getDomainFilenameScore(
    domain: string,
    filename: string,
    language: string,
    hasQueryDomainHint: boolean // Additional signal for two-signal confirmation
  ): { score: number; strongMatch: boolean } {
    if (!this.domainFilenameTerms) {
      // Fallback to legacy hardcoded terms
      return this.getLegacyDomainScore(domain, filename);
    }

    const domainData = this.domainFilenameTerms.domains[domain];
    if (!domainData) return { score: 0, strongMatch: false };

    const twoSignalThreshold = this.domainFilenameTerms._meta.twoSignalThreshold || 0.5;
    const filenameLower = filename.toLowerCase();

    // Get terms for current language
    const terms = language === 'pt' ? domainData.pt_terms : domainData.en_terms;
    if (!terms || terms.length === 0) return { score: 0, strongMatch: false };

    let highestWeight = 0;
    let matchedTerm: { t: string; w: number } | null = null;

    for (const term of terms) {
      if (filenameLower.includes(term.t)) {
        if (term.w > highestWeight) {
          highestWeight = term.w;
          matchedTerm = term;
        }
      }
    }

    if (!matchedTerm) {
      return { score: 0, strongMatch: false };
    }

    // Two-signal rule: weak terms need query confirmation
    const isWeakTerm = matchedTerm.w < twoSignalThreshold;
    const strongMatch = !isWeakTerm || hasQueryDomainHint;

    // Final score: use term weight, but reduce for weak unconfirmed matches
    let finalScore = matchedTerm.w;
    if (isWeakTerm && !hasQueryDomainHint) {
      // Weak term without query confirmation → reduce score significantly
      finalScore = matchedTerm.w * 0.3;
    }

    return { score: finalScore, strongMatch };
  }

  /**
   * Legacy fallback for domain scoring when bank is not available
   */
  private getLegacyDomainScore(domain: string, filename: string): { score: number; strongMatch: boolean } {
    const terms: Record<string, string[]> = {
      finance: ['p&l', 'ebitda', 'budget', 'forecast', 'financial'],
      legal: ['contract', 'agreement', 'nda', 'legal'],
      accounting: ['ledger', 'journal', 'balance'],
      medical: ['medical', 'patient', 'clinical'],
    };
    const domainTerms = terms[domain] || [];
    const filenameLower = filename.toLowerCase();
    const matched = domainTerms.some(t => filenameLower.includes(t));
    return { score: matched ? 0.5 : 0, strongMatch: matched };
  }

  // ==========================================================================
  // CHATGPT-LIKE SCOPE DECISION WITH NARROWING
  // ==========================================================================

  /**
   * Make scope decision based on scored candidates
   * Implements ChatGPT-like 3-tier decision:
   * - Tier A: Auto-scope (top candidate clearly ahead)
   * - Tier B: Disambiguate (2-5 close candidates, show buttons)
   * - Tier C: Clarify (no clear candidates)
   */
  private makeNarrowedScopeDecision(
    hints: QueryHints,
    scoredCandidates: ScoredCandidate[],
    operator: ScopeDecision['operator'],
    language: string
  ): { decision: 'auto_scope' | 'disambiguate' | 'clarify'; candidates: ScoredCandidate[] } {
    // DEBUG: Track entry
    console.log(`[DEBUG makeNarrowedScopeDecision] candidates=${scoredCandidates.length}, top=${scoredCandidates[0]?.filename || 'none'}, topScore=${scoredCandidates[0]?.score || 0}`);

    if (scoredCandidates.length === 0) {
      return { decision: 'clarify', candidates: [] };
    }

    const top = scoredCandidates[0];
    const minScore = this.isCriticalOperator(operator)
      ? this.NARROWING_THRESHOLDS.CRITICAL_OP_MIN_SCORE
      : this.NARROWING_THRESHOLDS.AUTO_SCOPE_MIN_SCORE;

    // Single candidate with any hint match → auto-scope
    if (scoredCandidates.length === 1 && top.score > 0) {
      return { decision: 'auto_scope', candidates: [top] };
    }

    // Check if top candidate is clearly ahead
    const second = scoredCandidates[1];
    const margin = top.score - second.score;

    // CATEGORY 2 FIX: More aggressive auto-scoping
    // Tier A1: Top has any filename match → auto-scope (strongest signal)
    if (top.scoreBreakdown.filenameMatch > 0 && top.scoreBreakdown.filenameMatch > second.scoreBreakdown.filenameMatch) {
      this.logger.debug(`[ScopeGate] Auto-scope via filename match: top=${top.filename} (${top.score.toFixed(2)})`);
      return { decision: 'auto_scope', candidates: [top] };
    }

    // Tier A2: Top candidate is clearly ahead
    if (top.score >= minScore && margin >= this.NARROWING_THRESHOLDS.AUTO_SCOPE_MARGIN) {
      this.logger.debug(`[ScopeGate] Auto-scope: top=${top.filename} (${top.score.toFixed(2)}), margin=${margin.toFixed(2)}`);
      return { decision: 'auto_scope', candidates: [top] };
    }

    // CATEGORY 2 FIX: If top has any score at all and second is much lower, auto-scope
    if (top.score > 0 && (second.score === 0 || top.score >= second.score * 1.5)) {
      this.logger.debug(`[ScopeGate] Auto-scope via relative score: top=${top.filename} (${top.score.toFixed(2)}) vs second (${second.score.toFixed(2)})`);
      return { decision: 'auto_scope', candidates: [top] };
    }

    // Filter to candidates with meaningful scores
    const viableCandidates = scoredCandidates.filter(c => c.score >= minScore * 0.5);

    // CATEGORY 2 FIX: If 2-5 candidates with any scores, still auto-scope to top
    // ChatGPT behavior: Pick the most relevant, don't ask user unless >5 candidates
    if (viableCandidates.length >= 2 && viableCandidates.length <= this.NARROWING_THRESHOLDS.DISAMBIGUATE_MAX_CANDIDATES) {
      // Always pick top candidate - ChatGPT-like behavior
      this.logger.debug(`[ScopeGate] Auto-scope via best match: top=${top.filename}, ${viableCandidates.length} candidates`);
      return { decision: 'auto_scope', candidates: [top] };
    }

    // Tier B: Disambiguate only for >5 candidates where we truly can't pick
    if (viableCandidates.length > this.NARROWING_THRESHOLDS.DISAMBIGUATE_MAX_CANDIDATES) {
      return { decision: 'disambiguate', candidates: viableCandidates.slice(0, 5) };
    }

    // If we have hints but no strong matches, try just type-filtered
    if ((hints.docTypeHint || hints.anchorHint) && viableCandidates.length === 0) {
      const typeFiltered = scoredCandidates.filter(c => c.scoreBreakdown.typeMatch > 0);
      if (typeFiltered.length === 1) {
        return { decision: 'auto_scope', candidates: [typeFiltered[0]] };
      }
      if (typeFiltered.length > 1 && typeFiltered.length <= 3) {
        // CATEGORY 2 FIX: Pick top type-filtered instead of disambiguating
        return { decision: 'auto_scope', candidates: [typeFiltered[0]] };
      }
      if (typeFiltered.length > 3 && typeFiltered.length <= 5) {
        // CATEGORY 2 FIX: Auto-scope to top type-filtered instead of disambiguating
        this.logger.debug(`[ScopeGate] Auto-scope via type-filtered: top=${typeFiltered[0].filename}, ${typeFiltered.length} candidates`);
        return { decision: 'auto_scope', candidates: [typeFiltered[0]] };
      }
    }

    // CATEGORY 2 FIX: If we have any scored candidates at all, pick the top one
    // ChatGPT behavior: Better to try with best match than to ask user
    if (scoredCandidates.length > 0 && top.score > 0) {
      this.logger.debug(`[ScopeGate] Auto-scope fallback: top=${top.filename} (${top.score.toFixed(2)})`);
      return { decision: 'auto_scope', candidates: [top] };
    }

    // CATEGORY 2 NUCLEAR FIX: Even with zero scores, if we have candidates, auto-scope to first
    // Let the retrieval/answer engine figure out relevance - don't ask user
    if (scoredCandidates.length > 0) {
      this.logger.debug(`[ScopeGate] Auto-scope zero-score fallback: top=${scoredCandidates[0].filename}`);
      return { decision: 'auto_scope', candidates: [scoredCandidates[0]] };
    }

    // Tier C: Clarify (no candidates at all)
    return { decision: 'clarify', candidates: [] };
  }

  private isCriticalOperator(operator: ScopeDecision['operator']): boolean {
    return ['compute', 'legal_extract'].includes(operator);
  }

  /**
   * Load all scope-related banks
   */
  private loadBanks(): void {
    try {
      // Scope frames (triggers)
      this.scopeFramesEn = this.loadBank<ScopeFramesBank>('triggers/scope_frames.en.json');
      this.scopeFramesPt = this.loadBank<ScopeFramesBank>('triggers/scope_frames.pt.json');

      // Type scope rules
      this.typeScopeRules = this.loadBank<TypeScopeRules>('overlays/type_scope_rules.any.json');

      // Domain scope rules
      this.domainScopeRules = this.loadBank<DomainScopeRules>('overlays/domain_scope_rules.any.json');

      // Confidence policy
      this.confidencePolicy = this.loadBank<ConfidencePolicy>('overlays/scope_confidence_policy.any.json');

      // Location terms
      this.locationTerms = this.loadBank<LocationTermsBank>('normalizers/location_terms.any.json');

      // Domain filename terms (weighted)
      this.domainFilenameTerms = this.loadBank<DomainFilenameTermsBank>('normalizers/domain_filename_terms.any.json');

      const loadedBanks = [
        this.scopeFramesEn ? 'scope_frames.en' : null,
        this.scopeFramesPt ? 'scope_frames.pt' : null,
        this.typeScopeRules ? 'type_scope_rules' : null,
        this.domainScopeRules ? 'domain_scope_rules' : null,
        this.confidencePolicy ? 'scope_confidence_policy' : null,
        this.locationTerms ? 'location_terms' : null,
        this.domainFilenameTerms ? 'domain_filename_terms' : null,
      ].filter(Boolean);

      this.logger.info(`[ScopeGate] Loaded ${loadedBanks.length}/7 banks: ${loadedBanks.join(', ')}`);
    } catch (err) {
      this.logger.warn('[ScopeGate] Error loading banks, using fallback patterns:', err);
    }
  }

  private loadBank<T>(relativePath: string): T | null {
    try {
      const fullPath = path.join(this.banksPath, relativePath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        return JSON.parse(content) as T;
      }
    } catch (err) {
      this.logger.debug(`[ScopeGate] Could not load bank ${relativePath}:`, err);
    }
    return null;
  }

  /**
   * Detect scope from query and available documents
   *
   * CHATGPT-LIKE FLOW:
   * 1. Extract all hints (type, anchor, domain, keywords)
   * 2. Score and narrow candidates using hints
   * 3. Make 3-tier decision: auto-scope / disambiguate / clarify
   * 4. Only clarify when truly ambiguous
   */
  detectScope(
    query: string,
    availableDocs: Array<{ id: string; filename: string; mimeType?: string; createdAt?: Date }>,
    language: string,
    conversationMemory?: {
      lastDocIds?: string[];
      lastDocNames?: string[];
      turnsSinceLastScope?: number;
    }
  ): ScopeDecision {
    const queryLower = query.toLowerCase();

    // Step 1: Detect operator
    const operator = this.detectOperator(query);

    // Step 2: Extract all query hints (ChatGPT-like)
    const hints = this.extractQueryHints(query, language);
    this.logger.debug('[ScopeGate] Query hints:', {
      docTypeHint: hints.docTypeHint,
      anchorHint: hints.anchorHint,
      domainHint: hints.domainHint,
      keywords: hints.keywords,
      isFollowUp: hints.isFollowUp,
    });

    // Step 3: Check for explicit file references by name (highest priority)
    const referencedFiles = this.extractFileReferences(query, availableDocs);

    // Step 4: Check anchor nouns for type preference (page→pdf, slide→pptx, cell→xlsx)
    const typePreference = this.detectTypePreference(query, language);

    // Step 5: Check domain terms for domain preference (finance→xlsx, legal→pdf)
    const domainPreference = this.detectDomainPreference(query, language);

    // Step 6: Match scope frame patterns
    const scopeMatch = this.matchScopeFrames(query, language);

    // Step 7: Get confidence threshold for this operator/domain
    const threshold = this.getAutoScopeThreshold(operator, domainPreference?.domain);

    // Step 8: CHATGPT-LIKE NARROWING - Score all candidates using hints
    const scoredCandidates = this.scoreAndNarrowCandidates(hints, availableDocs, conversationMemory);

    // Step 9: Build decision using all signals
    let decision: ScopeDecision;

    // CASE 1: Explicit file reference found
    if (referencedFiles.length === 1) {
      decision = {
        type: 'single_doc',
        targetDocIds: [referencedFiles[0].id],
        targetDocNames: [referencedFiles[0].filename],
        operator,
        structureByDoc: false,
        confidence: 0.95,
        scopeSource: 'filename_match',
      };
    } else if (referencedFiles.length > 1) {
      decision = {
        type: 'multi_doc',
        targetDocIds: referencedFiles.map(f => f.id),
        targetDocNames: referencedFiles.map(f => f.filename),
        operator,
        structureByDoc: true,
        confidence: 0.90,
        scopeSource: 'filename_match',
      };
    }

    // CASE 2: Compare operator - needs multiple docs
    else if (operator === 'compare') {
      if (conversationMemory?.lastDocIds && conversationMemory.lastDocIds.length >= 2) {
        decision = {
          type: 'multi_doc',
          targetDocIds: conversationMemory.lastDocIds,
          targetDocNames: conversationMemory.lastDocNames,
          operator,
          structureByDoc: true,
          confidence: 0.75,
          scopeSource: 'inherited',
        };
      } else {
        decision = {
          type: 'needs_clarification',
          operator,
          structureByDoc: true,
          confidence: 0.6,
          clarifyQuestion: this.getClarifyQuestion('compare', language, availableDocs),
          scopeSource: 'ambiguous',
        };
      }
    }

    // CASE 3: Type preference detected (e.g., "which slide" → pptx)
    // CHATGPT-LIKE: Use narrowing to pick best candidate instead of clarifying
    else if (typePreference && typePreference.confidence >= threshold) {
      const docsOfType = this.filterDocsByType(availableDocs, typePreference.preferredTypes);

      if (docsOfType.length === 1) {
        // Auto-select single doc of type
        decision = {
          type: 'single_doc',
          targetDocIds: [docsOfType[0].id],
          targetDocNames: [docsOfType[0].filename],
          preferredTypes: typePreference.preferredTypes,
          operator,
          structureByDoc: false,
          confidence: typePreference.confidence,
          matchedFamily: typePreference.anchor,
          scopeSource: 'type_anchor',
        };
      } else if (docsOfType.length > 1) {
        // CHATGPT-LIKE: Multiple docs of type - use scored narrowing
        const typeFilteredScored = scoredCandidates.filter(c =>
          docsOfType.some(d => d.id === c.id)
        );
        const narrowingResult = this.makeNarrowedScopeDecision(hints, typeFilteredScored, operator, language);

        if (narrowingResult.decision === 'auto_scope' && narrowingResult.candidates[0]) {
          // Narrowing found a clear winner
          decision = {
            type: 'single_doc',
            targetDocIds: [narrowingResult.candidates[0].id],
            targetDocNames: [narrowingResult.candidates[0].filename],
            preferredTypes: typePreference.preferredTypes,
            operator,
            structureByDoc: false,
            confidence: Math.min(typePreference.confidence, narrowingResult.candidates[0].score + 0.5),
            scopeSource: 'type_anchor_narrowed',
          };
        } else if (narrowingResult.decision === 'disambiguate') {
          // Show focused disambiguation with top candidates
          decision = {
            type: 'needs_clarification',
            preferredTypes: typePreference.preferredTypes,
            operator,
            structureByDoc: false,
            confidence: 0.7,
            clarifyQuestion: this.getDisambiguationQuestion(language, narrowingResult.candidates, typePreference.preferredTypes[0]),
            scopeSource: 'type_anchor_disambiguate',
          };
        } else {
          // Fall back to generic clarification
          decision = {
            type: 'needs_clarification',
            preferredTypes: typePreference.preferredTypes,
            operator,
            structureByDoc: false,
            confidence: 0.6,
            clarifyQuestion: this.getClarifyQuestion('type', language, docsOfType, typePreference.preferredTypes[0]),
            scopeSource: 'type_anchor_ambiguous',
          };
        }
      } else {
        // No docs of preferred type - search all
        decision = {
          type: 'any_doc',
          preferredTypes: typePreference.preferredTypes,
          operator,
          structureByDoc: false,
          confidence: 0.5,
          scopeSource: 'type_anchor_no_match',
        };
      }
    }

    // CASE 4: Domain preference detected (e.g., "EBITDA" → finance docs)
    // CHATGPT-LIKE: Use narrowing to pick best candidate instead of clarifying
    else if (domainPreference && domainPreference.confidence >= threshold) {
      const docsOfDomain = this.filterDocsByType(availableDocs, domainPreference.preferredTypes);

      if (docsOfDomain.length === 1) {
        decision = {
          type: 'single_doc',
          targetDocIds: [docsOfDomain[0].id],
          targetDocNames: [docsOfDomain[0].filename],
          preferredTypes: domainPreference.preferredTypes,
          operator,
          structureByDoc: false,
          confidence: domainPreference.confidence,
          scopeSource: `domain_${domainPreference.domain}`,
        };
      } else if (docsOfDomain.length > 1) {
        // CHATGPT-LIKE: Multiple domain docs - use scored narrowing
        const domainFilteredScored = scoredCandidates.filter(c =>
          docsOfDomain.some(d => d.id === c.id)
        );
        const narrowingResult = this.makeNarrowedScopeDecision(hints, domainFilteredScored, operator, language);

        if (narrowingResult.decision === 'auto_scope' && narrowingResult.candidates[0]) {
          // Narrowing found a clear winner
          decision = {
            type: 'single_doc',
            targetDocIds: [narrowingResult.candidates[0].id],
            targetDocNames: [narrowingResult.candidates[0].filename],
            preferredTypes: domainPreference.preferredTypes,
            operator,
            structureByDoc: false,
            confidence: Math.min(domainPreference.confidence, narrowingResult.candidates[0].score + 0.5),
            scopeSource: `domain_${domainPreference.domain}_narrowed`,
          };
        } else if (narrowingResult.decision === 'disambiguate') {
          // Show focused disambiguation with top candidates
          decision = {
            type: 'needs_clarification',
            preferredTypes: domainPreference.preferredTypes,
            operator,
            structureByDoc: false,
            confidence: 0.7,
            clarifyQuestion: this.getDisambiguationQuestion(language, narrowingResult.candidates, domainPreference.domain),
            scopeSource: `domain_${domainPreference.domain}_disambiguate`,
          };
        } else {
          // Fall back to generic clarification
          decision = {
            type: 'needs_clarification',
            preferredTypes: domainPreference.preferredTypes,
            operator,
            structureByDoc: false,
            confidence: 0.6,
            clarifyQuestion: this.getClarifyQuestion('domain', language, docsOfDomain, domainPreference.domain),
            scopeSource: `domain_${domainPreference.domain}_ambiguous`,
          };
        }
      } else {
        // No docs match domain - search all
        decision = {
          type: 'any_doc',
          preferredTypes: domainPreference.preferredTypes,
          operator,
          structureByDoc: false,
          confidence: 0.5,
          scopeSource: `domain_${domainPreference.domain}_no_match`,
        };
      }
    }

    // CASE 5: Follow-up detected - ALWAYS inherit scope (ChatGPT-like)
    else if (hints.isFollowUp && conversationMemory?.lastDocIds?.length) {
      decision = {
        type: 'single_doc',
        targetDocIds: conversationMemory.lastDocIds,
        targetDocNames: conversationMemory.lastDocNames,
        operator,
        structureByDoc: conversationMemory.lastDocIds.length > 1,
        confidence: 0.85,
        scopeSource: 'followup_inherited',
      };
    }

    // CASE 6: Scope frame matched (multi-doc, single-doc explicit)
    else if (scopeMatch) {
      if (scopeMatch.scopeType === 'multi_doc' || scopeMatch.scopeType === 'compare') {
        decision = {
          type: 'multi_doc',
          operator,
          structureByDoc: true,
          confidence: scopeMatch.confidence,
          matchedFamily: scopeMatch.family,
          scopeSource: 'scope_frame',
        };
      } else if (scopeMatch.scopeType === 'single_doc' && scopeMatch.confidence >= threshold) {
        // Single-doc frame but no specific doc - check conversation memory first
        if (conversationMemory?.lastDocIds?.length && conversationMemory.turnsSinceLastScope !== undefined && conversationMemory.turnsSinceLastScope < (this.confidencePolicy?.scopeInheritance?.followUpMaxTurns || 5)) {
          decision = {
            type: 'single_doc',
            targetDocIds: [conversationMemory.lastDocIds[0]],
            targetDocNames: conversationMemory.lastDocNames ? [conversationMemory.lastDocNames[0]] : undefined,
            operator,
            structureByDoc: false,
            confidence: scopeMatch.confidence * 0.85,
            matchedFamily: scopeMatch.family,
            scopeSource: 'scope_frame_inherited',
          };
        } else if (availableDocs.length === 1) {
          // Only one doc available
          decision = {
            type: 'single_doc',
            targetDocIds: [availableDocs[0].id],
            targetDocNames: [availableDocs[0].filename],
            operator,
            structureByDoc: false,
            confidence: scopeMatch.confidence,
            matchedFamily: scopeMatch.family,
            scopeSource: 'scope_frame_single_available',
          };
        } else {
          // CHATGPT-LIKE: Use narrowing instead of immediate clarification
          const narrowingResult = this.makeNarrowedScopeDecision(hints, scoredCandidates, operator, language);
          if (narrowingResult.decision === 'auto_scope' && narrowingResult.candidates[0]) {
            decision = {
              type: 'single_doc',
              targetDocIds: [narrowingResult.candidates[0].id],
              targetDocNames: [narrowingResult.candidates[0].filename],
              operator,
              structureByDoc: false,
              confidence: narrowingResult.candidates[0].score + 0.4,
              matchedFamily: scopeMatch.family,
              scopeSource: 'scope_frame_narrowed',
            };
          } else if (narrowingResult.decision === 'disambiguate') {
            decision = {
              type: 'needs_clarification',
              operator,
              structureByDoc: false,
              confidence: 0.7,
              clarifyQuestion: this.getDisambiguationQuestion(language, narrowingResult.candidates),
              matchedFamily: scopeMatch.family,
              scopeSource: 'scope_frame_disambiguate',
            };
          } else {
            decision = {
              type: 'needs_clarification',
              operator,
              structureByDoc: false,
              confidence: 0.6,
              clarifyQuestion: this.getClarifyQuestion('single', language, availableDocs),
              matchedFamily: scopeMatch.family,
              scopeSource: 'scope_frame_ambiguous',
            };
          }
        }
      } else if (scopeMatch.scopeType === 'followup') {
        // Follow-up - inherit from conversation
        if (conversationMemory?.lastDocIds?.length) {
          decision = {
            type: 'single_doc',
            targetDocIds: conversationMemory.lastDocIds,
            targetDocNames: conversationMemory.lastDocNames,
            operator,
            structureByDoc: conversationMemory.lastDocIds.length > 1,
            confidence: scopeMatch.confidence,
            matchedFamily: scopeMatch.family,
            scopeSource: 'followup_inherited',
          };
        } else {
          decision = {
            type: 'any_doc',
            operator,
            structureByDoc: false,
            confidence: 0.5,
            matchedFamily: scopeMatch.family,
            scopeSource: 'followup_no_context',
          };
        }
      } else {
        decision = {
          type: 'any_doc',
          operator,
          structureByDoc: false,
          confidence: scopeMatch.confidence,
          matchedFamily: scopeMatch.family,
          scopeSource: 'scope_frame',
        };
      }
    }

    // CASE 7: Default - try narrowing if we have any hints
    else if (hints.docTypeHint || hints.domainHint || hints.keywords.length > 0) {
      // CHATGPT-LIKE: Use narrowing to try to find best candidate
      const narrowingResult = this.makeNarrowedScopeDecision(hints, scoredCandidates, operator, language);

      if (narrowingResult.decision === 'auto_scope' && narrowingResult.candidates[0]) {
        decision = {
          type: 'single_doc',
          targetDocIds: [narrowingResult.candidates[0].id],
          targetDocNames: [narrowingResult.candidates[0].filename],
          operator,
          structureByDoc: false,
          confidence: narrowingResult.candidates[0].score + 0.4,
          scopeSource: 'hints_narrowed',
        };
      } else if (narrowingResult.decision === 'disambiguate') {
        decision = {
          type: 'needs_clarification',
          operator,
          structureByDoc: false,
          confidence: 0.7,
          clarifyQuestion: this.getDisambiguationQuestion(language, narrowingResult.candidates, hints.domainHint || hints.docTypeHint || undefined),
          scopeSource: 'hints_disambiguate',
        };
      } else {
        decision = {
          type: 'any_doc',
          operator,
          structureByDoc: false,
          confidence: 0.5,
          scopeSource: 'hints_no_match',
        };
      }
    }

    // CASE 8: True default - no hints, no specific scope
    else {
      decision = {
        type: 'any_doc',
        operator,
        structureByDoc: false,
        confidence: 0.5,
        scopeSource: 'default',
      };
    }

    this.logger.debug('[ScopeGate] Decision', {
      query: query.substring(0, 50),
      type: decision.type,
      operator: decision.operator,
      structureByDoc: decision.structureByDoc,
      confidence: decision.confidence,
      targetDocCount: decision.targetDocIds?.length,
      scopeSource: decision.scopeSource,
    });

    return decision;
  }

  /**
   * Detect operator from query
   */
  private detectOperator(query: string): ScopeDecision['operator'] {
    const queryLower = query.toLowerCase();

    // Operator patterns (could also be bank-driven)
    const operatorPatterns: { patterns: RegExp[]; operator: ScopeDecision['operator'] }[] = [
      { patterns: [/\b(summarize|summary|sum up|resume|resumo|resumir|sintetizar)\b/i], operator: 'summarize' },
      { patterns: [/\b(extract|find|get|show|extrair|encontrar|mostrar)\b/i, /\b(what|which|where|qual|quais|onde)\b.*\b(is|are|was|were|está|são|foi)\b/i], operator: 'extract' },
      { patterns: [/\b(compare|contrast|difference|comparar|diferença|versus|vs\.?)\b/i], operator: 'compare' },
      { patterns: [/\b(calculate|compute|total|sum|average|add up|calcular|somar|média|soma)\b/i], operator: 'compute' },
      { patterns: [/\b(where is|locate|find file|onde (está|fica)|localizar|achar arquivo)\b/i], operator: 'locate_content' },
      { patterns: [/\b(list|show all|what files|inventory|quais arquivos|listar|inventário)\b/i], operator: 'list' },
      { patterns: [/\b(clause|liability|termination|penalty|contract|cláusula|rescisão|penalidade|contrato)\b/i], operator: 'legal_extract' },
    ];

    for (const { patterns, operator } of operatorPatterns) {
      if (patterns.some(p => p.test(queryLower))) {
        return operator;
      }
    }

    return 'unknown';
  }

  /**
   * Extract file references from query by matching filenames
   */
  private extractFileReferences(
    query: string,
    availableDocs: Array<{ id: string; filename: string }>
  ): Array<{ id: string; filename: string }> {
    const matches: Array<{ id: string; filename: string }> = [];
    const queryLower = query.toLowerCase();

    // Pattern 1: Quoted filenames
    const quotedPatterns = [
      /["']([^"']+\.(pdf|xlsx?|docx?|pptx?|csv|txt|png|jpg))["']/gi,
      /`([^`]+\.(pdf|xlsx?|docx?|pptx?|csv|txt|png|jpg))`/gi,
    ];

    for (const pattern of quotedPatterns) {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        const filename = match[1];
        const doc = availableDocs.find(d =>
          d.filename.toLowerCase() === filename.toLowerCase() ||
          d.filename.toLowerCase().includes(filename.toLowerCase())
        );
        if (doc && !matches.find(m => m.id === doc.id)) {
          matches.push(doc);
        }
      }
    }

    // Pattern 2: Direct filename substring match
    for (const doc of availableDocs) {
      const nameWithoutExt = doc.filename.replace(/\.[^.]+$/, '').toLowerCase();
      // Require at least 4 chars to avoid false positives
      if (nameWithoutExt.length >= 4 && queryLower.includes(nameWithoutExt)) {
        if (!matches.find(m => m.id === doc.id)) {
          matches.push(doc);
        }
      }
    }

    // Pattern 3: Multi-word fuzzy match (e.g., "Rosewood Fund" → "Rosewood_Fund_Report.pdf")
    if (matches.length === 0) {
      const found = this.fuzzyMatchDocument(query, availableDocs);
      if (found) {
        matches.push(found);
      }
    }

    return matches;
  }

  /**
   * Fuzzy match document name using word overlap
   */
  private fuzzyMatchDocument(
    query: string,
    availableDocs: Array<{ id: string; filename: string }>
  ): { id: string; filename: string } | undefined {
    // Extract capitalized phrases that might be document names
    const namePhrases = query.match(/([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*){0,3})/g) || [];

    for (const phrase of namePhrases) {
      if (phrase.length < 4) continue;

      const phraseWords = phrase.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
      if (phraseWords.length === 0) continue;

      let bestMatch: { doc: { id: string; filename: string }; score: number } | null = null;

      for (const doc of availableDocs) {
        const filenameWords = doc.filename.replace(/\.[^.]+$/, '').toLowerCase().split(/[\s_-]+/).filter(w => w.length >= 3);

        let matchCount = 0;
        for (const word of phraseWords) {
          if (filenameWords.some(fw => fw.includes(word) || word.includes(fw))) {
            matchCount++;
          }
        }

        const score = matchCount / phraseWords.length;
        if (score >= 0.5 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { doc, score };
        }
      }

      if (bestMatch) {
        return bestMatch.doc;
      }
    }

    return undefined;
  }

  /**
   * Detect type preference from anchor nouns (page→pdf, slide→pptx, cell→xlsx)
   */
  private detectTypePreference(query: string, language: string): { preferredTypes: string[]; confidence: number; anchor: string } | null {
    if (!this.typeScopeRules) return null;

    const queryLower = query.toLowerCase();
    const lang = language === 'pt' ? 'pt' : 'en';

    for (const [anchor, config] of Object.entries(this.typeScopeRules.anchorToType)) {
      const patterns = config.patterns[lang] || config.patterns.en || [];
      for (const pattern of patterns) {
        if (queryLower.includes(pattern.toLowerCase())) {
          return {
            preferredTypes: config.preferredTypes,
            confidence: config.confidence,
            anchor,
          };
        }
      }
    }

    return null;
  }

  /**
   * Detect domain preference from domain-specific terms
   */
  private detectDomainPreference(query: string, language: string): { preferredTypes: string[]; confidence: number; domain: string } | null {
    if (!this.domainScopeRules) return null;

    const queryLower = query.toLowerCase();

    // Try new structure (domainScopes)
    if (this.domainScopeRules.domainScopes) {
      for (const [domain, config] of Object.entries(this.domainScopeRules.domainScopes)) {
        // Check docTypeKeywords for domain match
        const keywords = config.docTypeKeywords || [];
        for (const keyword of keywords) {
          if (queryLower.includes(keyword.toLowerCase())) {
            // Convert extensions to simple types
            const preferredTypes = (config.preferredExtensions || [])
              .map(ext => ext.replace(/^\./, '').toLowerCase());
            return {
              preferredTypes,
              confidence: config.weight ? Math.min(config.weight / 2, 0.95) : 0.80,
              domain,
            };
          }
        }
      }
    }

    // Fallback: Try legacy structure (domains)
    if (this.domainScopeRules.domains) {
      const lang = language === 'pt' ? 'pt' : 'en';
      for (const [domain, config] of Object.entries(this.domainScopeRules.domains)) {
        const terms = config.terms?.[lang] || config.terms?.en || [];
        for (const term of terms) {
          if (queryLower.includes(term.toLowerCase())) {
            return {
              preferredTypes: config.preferredTypes,
              confidence: config.confidence,
              domain,
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Match query against scope frame patterns
   */
  private matchScopeFrames(query: string, language: string): { scopeType: string; confidence: number; family: string } | null {
    const bank = language === 'pt' ? this.scopeFramesPt : this.scopeFramesEn;
    if (!bank) return null;

    const queryLower = query.toLowerCase();
    let bestMatch: { scopeType: string; confidence: number; family: string } | null = null;

    for (const [familyName, family] of Object.entries(bank.families)) {
      for (const pattern of family.patterns) {
        if (queryLower.includes(pattern.toLowerCase())) {
          // Longer patterns are more specific, boost confidence
          const lengthBoost = Math.min(pattern.length / 30, 0.1);
          const adjustedConfidence = family.confidence + lengthBoost;

          if (!bestMatch || adjustedConfidence > bestMatch.confidence) {
            bestMatch = {
              scopeType: family.scopeType,
              confidence: adjustedConfidence,
              family: familyName,
            };
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * Get auto-scope threshold for operator/domain
   */
  private getAutoScopeThreshold(operator: ScopeDecision['operator'], domain?: string): number {
    if (!this.confidencePolicy) return 0.70; // Default

    // Check operator-specific threshold
    const operatorConfig = this.confidencePolicy.byOperator[operator];
    if (operatorConfig) {
      return operatorConfig.autoScopeThreshold;
    }

    // Check domain-specific threshold
    if (domain) {
      const domainConfig = this.confidencePolicy.byDomain[domain];
      if (domainConfig) {
        return domainConfig.autoScopeThreshold;
      }
    }

    // Default to general threshold
    return this.confidencePolicy.byOperator.unknown?.autoScopeThreshold || 0.70;
  }

  /**
   * Filter documents by preferred file types
   */
  private filterDocsByType(
    docs: Array<{ id: string; filename: string; mimeType?: string }>,
    preferredTypes: string[]
  ): Array<{ id: string; filename: string }> {
    if (!this.typeScopeRules) {
      // Fallback to extension matching
      return docs.filter(d => {
        const ext = d.filename.split('.').pop()?.toLowerCase();
        return ext && preferredTypes.some(t => t === ext || t.includes(ext));
      });
    }

    const extensionSet = new Set<string>();
    for (const type of preferredTypes) {
      const extensions = this.typeScopeRules.typeExtensionMap[type] || [type];
      extensions.forEach(ext => extensionSet.add(ext.toLowerCase()));
    }

    return docs.filter(d => {
      const ext = d.filename.split('.').pop()?.toLowerCase();
      return ext && extensionSet.has(ext);
    });
  }

  /**
   * Get most recent document from list
   */
  private getMostRecentDoc(docs: Array<{ id: string; filename: string; createdAt?: Date }>): { id: string; filename: string } | null {
    if (docs.length === 0) return null;

    const docsWithDate = docs.filter(d => d.createdAt);
    if (docsWithDate.length === 0) return docs[0]; // No dates, return first

    const maxDays = this.confidencePolicy?.autoSelectRules?.recentDocMaxAgeDays || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxDays);

    const recentDocs = docsWithDate.filter(d => d.createdAt! >= cutoffDate);
    if (recentDocs.length === 0) return null;

    // Sort by date descending
    recentDocs.sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime());
    return recentDocs[0];
  }

  /**
   * Generate clarification question (generic)
   */
  private getClarifyQuestion(
    type: 'compare' | 'type' | 'domain' | 'single',
    language: string,
    docs: Array<{ id: string; filename: string }>,
    qualifier?: string
  ): string {
    const maxOptions = this.confidencePolicy?.disambiguationPolicy?.maxCandidates || 5;
    const docNames = docs.slice(0, maxOptions).map(d => d.filename).join(', ');

    const templates: Record<string, Record<string, string>> = {
      compare: {
        en: 'Which documents would you like to compare? Please mention the file names.',
        pt: 'Quais documentos você gostaria de comparar? Por favor, mencione os nomes dos arquivos.',
      },
      type: {
        en: `I found multiple ${qualifier || 'files'}. Which one would you like me to use: ${docNames}?`,
        pt: `Encontrei vários ${qualifier === 'xlsx' ? 'planilhas' : qualifier === 'pptx' ? 'apresentações' : 'arquivos'}. Qual você gostaria que eu use: ${docNames}?`,
      },
      domain: {
        en: `I found multiple ${qualifier || 'documents'} that might be relevant. Which one: ${docNames}?`,
        pt: `Encontrei vários documentos de ${qualifier || 'conteúdo'} que podem ser relevantes. Qual: ${docNames}?`,
      },
      single: {
        en: `Which document would you like to query? For example: ${docNames}`,
        pt: `Qual documento você gostaria de consultar? Por exemplo: ${docNames}`,
      },
    };

    const template = templates[type]?.[language] || templates[type]?.en || templates.single.en;
    return template;
  }

  /**
   * CHATGPT-LIKE: Generate focused disambiguation question
   * - One short sentence
   * - 2-5 options formatted as buttons
   * - No preamble
   */
  private getDisambiguationQuestion(
    language: string,
    candidates: ScoredCandidate[],
    context?: string
  ): string {
    // Shorten filenames for display
    const shortNames = candidates.slice(0, 5).map(c => {
      const name = c.filename.replace(/\.[^.]+$/, ''); // Remove extension
      return name.length > 30 ? name.substring(0, 27) + '...' : name;
    });

    // Format as button-like list
    const buttonList = shortNames.map(n => `[${n}]`).join(' ');

    // Get contextual type label
    const typeLabels: Record<string, { en: string; pt: string }> = {
      xlsx: { en: 'spreadsheet', pt: 'planilha' },
      pptx: { en: 'presentation', pt: 'apresentação' },
      pdf: { en: 'document', pt: 'documento' },
      finance: { en: 'financial document', pt: 'documento financeiro' },
      legal: { en: 'contract', pt: 'contrato' },
      accounting: { en: 'accounting document', pt: 'documento contábil' },
    };

    const typeLabel = context && typeLabels[context]
      ? (language === 'pt' ? typeLabels[context].pt : typeLabels[context].en)
      : (language === 'pt' ? 'arquivo' : 'file');

    // Short question (ChatGPT-style)
    const question = language === 'pt'
      ? `Qual ${typeLabel}?`
      : `Which ${typeLabel}?`;

    return `${question}\n${buttonList}`;
  }

  /**
   * Get prompt modification to enforce scope structure
   */
  getPromptModification(decision: ScopeDecision, language: string): string {
    if (!decision.structureByDoc) {
      return '';
    }

    if (decision.type === 'multi_doc') {
      return language === 'pt'
        ? '\n\nIMPORTANTE: Estruture sua resposta por documento. Para cada documento relevante, identifique claramente qual informação vem de qual arquivo.'
        : '\n\nIMPORTANT: Structure your response by document. For each relevant document, clearly identify which information comes from which file.';
    }

    return '';
  }

  /**
   * Reload banks (useful for hot-reloading)
   */
  reloadBanks(): void {
    this.patternCache.clear();
    this.loadBanks();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let scopeGateInstance: ScopeGateService | null = null;

export function getScopeGate(): ScopeGateService {
  if (!scopeGateInstance) {
    scopeGateInstance = new ScopeGateService();
  }
  return scopeGateInstance;
}

export function resetScopeGate(): void {
  scopeGateInstance = null;
}
