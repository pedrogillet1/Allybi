/**
 * Router Service - Single Source of Truth for Query Routing
 *
 * This is the ONLY place routing decisions are made.
 * Orchestrator calls router.route() and trusts the result completely.
 * No second-guessing, no overrides, no regex checks after this.
 *
 * ChatGPT-style: one brain, one decision, one output.
 *
 * BANK-DRIVEN: All patterns come from JSON data banks via runtimePatterns.
 * NO hardcoded regex in this file - use bank services instead.
 */

import { runtimePatterns } from './runtimePatterns.service';
import { DefaultLanguageDetector, ILanguageDetector, LanguageResult } from './languageDetector.service';
import { classifyQuery, ContentGuardResult } from './contentGuard.service';
import { getScopeGate, ScopeDecision } from './scopeGate.service';
import { getClarifyTemplates, ClarifyTemplatesService } from './clarifyTemplates.service';
import { normalizeQuery, NormalizedQuery, NormalizeOptions } from './queryNormalizer.service';
import { SemanticQuery, buildSemanticQuery } from '../../semantics/semanticQuery';
import { operatorTiebreakers } from './operatorTiebreakers.service';
import { getBank } from './bankLoader.service';
import {
  routingOverlays,
  isFileLocationQuery,
  hasMultiDocSignals,
  hasDocReference,
  isFormatOnlyQuery,
  isAboutQuery,
  isDocDiscoveryQuery,
  isContentDiscoveryQuery,
  classifyAgainIntent,
  // New bank-driven overlay functions
  hasWorkspaceScopeSignals,
  isFileTypeListingQuery,
  resolveComputeVsExtract,
  isHelpOverrideQuery,
  isConversationOverrideQuery,
} from '../routing/routingOverlays.service';

// ═══════════════════════════════════════════════════════════════════════════
// ROUTING RESULT TYPE - The single contract between Router and Orchestrator
// ═══════════════════════════════════════════════════════════════════════════

export type IntentFamily = 'documents' | 'file_actions' | 'help' | 'conversation' | 'reasoning' | 'doc_stats' | 'error';

export type Operator =
  | 'list' | 'filter' | 'sort' | 'group' | 'open' | 'locate_file' | 'again' | 'count' | 'stats'  // file_actions operators (stats = folder/workspace summary)
  | 'locate_content' | 'summarize' | 'extract' | 'compare' | 'compute' | 'explain' | 'expand'  // documents operators
  | 'count_pages' | 'count_sheets' | 'count_slides'  // doc_stats operators
  | 'capabilities' | 'how_to'  // help operators
  | 'unknown';

export type DocScopeMode = 'none' | 'single_doc' | 'multi_doc' | 'workspace';

export interface DocScope {
  mode: DocScopeMode;
  docIds?: string[];
  docNames?: string[];
  folderPath?: string;
}

export interface RoutingFlags {
  isFollowup: boolean;
  hasPronoun: boolean;
  hasExplicitFilename: boolean;
  isInventoryQuery: boolean;
  isContentQuestion: boolean;
  requiresRAG: boolean;
  lowConfidence: boolean;
}

export interface RoutingResult {
  languageLocked: 'en' | 'pt' | 'es';
  intentFamily: IntentFamily;
  operator: Operator;
  subIntent?: string;
  docScope: DocScope;
  confidence: number;
  shouldClarify: boolean;
  clarifyQuestion?: string;
  matchedPatternIds?: string[];
  flags: RoutingFlags;
  // Type preferences for scope biasing (xlsx, pdf, etc.)
  preferredTypes?: string[];
  // Debug/telemetry
  _debug?: {
    rawIntentScores?: Array<{ intent: string; score: number }>;
    operatorMatches?: Array<{ operator: string; confidence: number }>;
    appliedRules?: string[];
    languageDetection?: LanguageResult;
    contentGuard?: ContentGuardResult;
    scopeDecision?: ScopeDecision;
    tiebreakerResult?: { intentFamily: string; operator: string; confidence: number; reason?: string };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTING REQUEST
// ═══════════════════════════════════════════════════════════════════════════

export interface RoutingRequest {
  text: string;
  userId: string;
  conversationId?: string;
  language?: string;
  hasDocuments: boolean;
  recentDocIds?: string[];
  recentDocNames?: string[];
  previousIntent?: string;
  previousOperator?: string;
  availableDocs?: Array<{ id: string; filename: string; mimeType?: string; createdAt?: Date }>;
  // P0 FIX: Explicit document selection from UI (chat attachments)
  // When user explicitly attaches docs, scope MUST lock to those docs
  attachedDocumentIds?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIDENCE THRESHOLDS - BANK-DRIVEN
// Loaded from ambiguity_rank_features.any.json decision thresholds
// ═══════════════════════════════════════════════════════════════════════════

interface RouterThresholds {
  lowConfidence: number;      // used for flags.lowConfidence
  clarifyBelow: number;       // used for "should clarify"
  highConfidence: number;     // used for "very confident"
}

/**
 * Get router thresholds from bank (single source of truth)
 * BANK-DRIVEN: Reads from ambiguity_rank_features.any.json
 */
function getRouterThresholds(): RouterThresholds {
  const bank = getBank<any>('ambiguity_rank_features');

  if (!bank?.decision) {
    // Fail-fast in dev if bank missing
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Router] CRITICAL: ambiguity_rank_features bank missing or invalid');
    }
    // Return safe defaults that prefer clarification
    return { lowConfidence: 0.50, clarifyBelow: 0.40, highConfidence: 0.80 };
  }

  const autoPick = bank.decision.autoPickIfTopScoreGte ?? 0.70;
  const alwaysAskBelow = bank.decision.alwaysAskIfTopScoreBelow ?? 0.40;

  // Map to router semantics:
  // - lowConfidence: slightly above "always ask below" to mark weak results
  // - clarifyBelow: same as alwaysAskBelow (router should not be more aggressive than ranking)
  // - highConfidence: same as autopick threshold
  const lowConfidence = Math.min(0.60, Math.max(alwaysAskBelow + 0.10, 0.50));
  const clarifyBelow = alwaysAskBelow;
  const highConfidence = autoPick;

  return { lowConfidence, clarifyBelow, highConfidence };
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTER SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class RouterService {
  private static instance: RouterService;
  private languageDetector: ILanguageDetector;
  private scopeGate = getScopeGate();
  private clarifyTemplates: ClarifyTemplatesService;

  private constructor() {
    this.languageDetector = new DefaultLanguageDetector();
    this.clarifyTemplates = getClarifyTemplates();
  }

  static getInstance(): RouterService {
    if (!RouterService.instance) {
      RouterService.instance = new RouterService();
    }
    return RouterService.instance;
  }

  /**
   * Main routing method - THE ONLY place routing decisions are made
   *
   * Orchestrator must trust this result completely.
   * No overrides, no second-guessing, no regex checks after this.
   *
   * Two-stage typo handling:
   * 1. First pass with conservative normalization
   * 2. If confidence < lowConfidence threshold, retry with aggressive normalization
   *
   * BANK-DRIVEN: Thresholds loaded from ambiguity_rank_features.any.json
   */
  async route(request: RoutingRequest): Promise<RoutingResult> {
    // BANK-DRIVEN: Get thresholds once per route call
    const thr = getRouterThresholds();

    // First pass: conservative normalization
    const result1 = await this._routeWithNormalization(request, false, thr);

    // If confidence is acceptable, return immediately
    if (result1.confidence >= thr.lowConfidence) {
      return result1;
    }

    // Second pass: aggressive normalization for low-confidence queries
    const aggressiveNormalized = normalizeQuery(request.text, { applyFuzzy: true, aggressive: true });

    // Only retry if aggressive mode found additional corrections
    const conservativeNormalized = normalizeQuery(request.text, true);
    const hasNewCorrections = aggressiveNormalized.corrections.length > conservativeNormalized.corrections.length;

    if (!hasNewCorrections) {
      // No new corrections from aggressive mode, return first result
      return result1;
    }

    console.log(`[Router] Low confidence (${(result1.confidence * 100).toFixed(0)}%), retrying with aggressive normalization: ${aggressiveNormalized.corrections.map(c => `${c.original}->${c.corrected}`).join(', ')}`);

    // Re-route with aggressive normalization
    const result2 = await this._routeWithNormalization(request, true, thr);

    // Return whichever has higher confidence
    if (result2.confidence > result1.confidence) {
      result2._debug?.appliedRules?.push('rule:aggressive_typo_retry_improved');
      return result2;
    }

    result1._debug?.appliedRules?.push('rule:aggressive_typo_retry_no_improvement');
    return result1;
  }

  /**
   * Internal routing with specified normalization mode
   * BANK-DRIVEN: Thresholds passed from route() method
   */
  private async _routeWithNormalization(request: RoutingRequest, aggressive: boolean, thr: RouterThresholds): Promise<RoutingResult> {
    const appliedRules: string[] = [];

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 0: Query Normalization - Apply typo corrections for robustness
    // ChatGPT-like: understand what user meant, not just what they typed
    // ═══════════════════════════════════════════════════════════════════════
    const normalizeOpts: NormalizeOptions = { applyFuzzy: true, aggressive };
    const normalized = normalizeQuery(request.text, normalizeOpts);
    const query = normalized.normalized; // Use normalized text for all matching

    if (normalized.corrections.length > 0) {
      const mode = aggressive ? 'aggressive' : 'conservative';
      appliedRules.push(`typo_corrections(${mode}):${normalized.corrections.map(c => `${c.original}->${c.corrected}`).join(',')}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Language Detection - Use languageDetector FIRST, not request.language
    // ChatGPT-like: detect from query content, don't trust client hints blindly
    // ═══════════════════════════════════════════════════════════════════════
    const languageResult = await this.languageDetector.detectWithConfidence(query);
    let languageLocked: 'en' | 'pt' | 'es';

    if (languageResult.lang !== 'unknown' && languageResult.confidence >= 0.3) {
      // Trust detected language from query content
      languageLocked = languageResult.lang as 'en' | 'pt' | 'es';
      appliedRules.push(`lang:detected:${languageLocked}:${languageResult.confidence.toFixed(2)}`);
    } else if (request.language) {
      // Fall back to request.language only if detection is uncertain
      const normalized = request.language.toLowerCase();
      if (normalized.startsWith('pt')) languageLocked = 'pt';
      else if (normalized.startsWith('es')) languageLocked = 'es';
      else languageLocked = 'en';
      appliedRules.push(`lang:request_fallback:${languageLocked}`);
    } else {
      // Default to English
      languageLocked = 'en';
      appliedRules.push('lang:default:en');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Get operator matches from runtime patterns (BANK-DRIVEN)
    // All patterns come from compiled JSON, no hardcoded regex
    // ═══════════════════════════════════════════════════════════════════════
    const operatorMatches = runtimePatterns.getOperatorMatches(query, languageLocked);
    const intentMatches = runtimePatterns.getIntentMatches(query, languageLocked);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Detect routing flags using BANK-DRIVEN methods only
    // NO hardcoded regex - use runtimePatterns and contentGuard services
    // ═══════════════════════════════════════════════════════════════════════
    const contentGuardResult = classifyQuery(query, languageLocked);
    const flags = this.detectFlags(query, languageLocked, request, contentGuardResult);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: Determine intent family and operator using priority rules
    // ═══════════════════════════════════════════════════════════════════════
    let { intentFamily, operator, confidence, subIntent } = this.resolveIntentAndOperator(
      query,
      languageLocked,
      operatorMatches,
      intentMatches,
      flags,
      request,
      contentGuardResult,
      appliedRules
    );

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4.1: Apply operator tiebreakers from bank (ChatGPT-level refinement)
    // Bank: data_banks/routing/routing_operator_tiebreakers.any.json
    // Resolves: compute vs extract, locate_file vs locate_content, etc.
    // ═══════════════════════════════════════════════════════════════════════
    const tiebreakerResult = operatorTiebreakers.applyTiebreakers({
      query,
      language: languageLocked,
      hasDocuments: request.hasDocuments,
      currentIntentFamily: intentFamily,
      currentOperator: operator,
      currentConfidence: confidence,
    });

    console.log(`[Router:DEBUG] Tiebreaker check: current=${intentFamily}/${operator} (${confidence}), result=${JSON.stringify(tiebreakerResult)}`);
    if (tiebreakerResult && tiebreakerResult.confidence >= confidence) {
      console.log(`[Router:DEBUG] TIEBREAKER OVERRIDE: ${intentFamily}/${operator} -> ${tiebreakerResult.intentFamily}/${tiebreakerResult.operator}`);
      intentFamily = tiebreakerResult.intentFamily;
      operator = tiebreakerResult.operator;
      confidence = tiebreakerResult.confidence;
      appliedRules.push(`tiebreaker:${tiebreakerResult.matchedRule || 'bank'}:${tiebreakerResult.reason || ''}`);
    }

    // Get type preferences for scope biasing (doesn't change intent)
    const typePrefs = operatorTiebreakers.getTypePreferences(query, languageLocked);
    let scopePreferredTypes: string[] | undefined;
    if (typePrefs) {
      scopePreferredTypes = typePrefs.preferredTypes;
      appliedRules.push(`type_pref:${scopePreferredTypes.join(',')}`);

      // A7: Type preferences should only override operator when:
      // 1. Current operator is ambiguous (extract, compute, unknown)
      // 2. OR confidence is low (< 0.65)
      const ambiguousOperators = ['extract', 'compute', 'unknown'];
      const isAmbiguous = ambiguousOperators.includes(operator);
      const isLowConfidence = confidence < 0.65;

      if (typePrefs.suggestedOperator && intentFamily === 'documents' && (isAmbiguous || isLowConfidence)) {
        operator = typePrefs.suggestedOperator;
        appliedRules.push(`type_op:${typePrefs.suggestedOperator}:${isAmbiguous ? 'ambiguous' : 'low_conf'}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4.5: "again" operator inheritance - ChatGPT-style repeat
    // If operator is "again" and we have previousOperator, inherit it
    // ═══════════════════════════════════════════════════════════════════════
    if (operator === 'again' && request.previousOperator) {
      operator = request.previousOperator as Operator;
      if (request.previousIntent) {
        intentFamily = request.previousIntent as IntentFamily;
      }
      appliedRules.push(`rule:again_inherits_${request.previousOperator}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4.6: Operator collision rules (ChatGPT-like disambiguation)
    // These resolve ambiguous operator choices BEFORE scopeGate
    // ═══════════════════════════════════════════════════════════════════════

    // Collision 1: Extract vs Compute
    // "what is the revenue" → extract (reading a value)
    // "calculate total revenue" → compute (math operation)
    // Only use compute when explicitly asking for calculation/math
    if (operator === 'compute' && intentFamily === 'documents') {
      const resolution = resolveComputeVsExtract(query, languageLocked);
      if (resolution.shouldDowngradeComputeToExtract) {
        operator = 'extract';
        appliedRules.push(`rule:compute_to_extract:${resolution.reason || 'simple_query'}`);
      }
    }

    // Collision 2: locate_file (file_actions) vs locate_content (documents)
    // "where is the file" → file_actions/locate_file
    // "where does it mention X" → documents/locate_content
    // ContentGuard determines if it's about file location or content location
    if (operator === 'locate_file' || operator === 'locate_content') {
      if (contentGuardResult.isContentQuestion && request.hasDocuments) {
        // Content question → locate_content in documents
        intentFamily = 'documents';
        operator = 'locate_content';
        appliedRules.push('rule:locate_content_override');
      } else if (contentGuardResult.isFileAction) {
        // File action → locate_file in file_actions
        intentFamily = 'file_actions';
        operator = 'locate_file';
        appliedRules.push('rule:locate_file_override');
      }
    }

    // Collision 3: stats (file_actions) vs doc_stats (count_pages/slides/sheets)
    // "how many pages" → doc_stats/count_pages
    // "workspace summary" → file_actions/stats
    // doc_stats is for document-internal counts, stats is for workspace/folder overview
    if (operator === 'stats' && intentFamily === 'file_actions') {
      // Check if this is actually a doc_stats query (pages/slides/sheets)
      const docStatsResult = runtimePatterns.isDocStatsQuery(query, languageLocked);
      if (docStatsResult.isDocStats && request.hasDocuments) {
        intentFamily = 'doc_stats';
        const statsOpMap: Record<string, Operator> = {
          pages: 'count_pages',
          slides: 'count_slides',
          sheets: 'count_sheets',
        };
        operator = statsOpMap[docStatsResult.statsType || 'pages'] || 'count_pages';
        appliedRules.push(`rule:stats_to_doc_stats:${docStatsResult.statsType}`);
      }
    }

    // Collision 4: Summarize vs Extract
    // "summarize the document" → summarize (overview/abstract)
    // "what does it say about X" → extract (specific info retrieval)
    // "what is X" with specific term → extract (not summarize)
    if (operator === 'summarize' && intentFamily === 'documents') {
      // If query asks for specific information, downgrade to extract
      const hasSpecificQuery = /\b(what|where|when|who|how much|how many)\s+(is|are|was|were|does|do)\b/i.test(query);
      const hasAboutQuery = /\b(about|summary|summarize|overview|main\s+points|key\s+points)\b/i.test(query);
      if (hasSpecificQuery && !hasAboutQuery) {
        operator = 'extract';
        appliedRules.push('rule:summarize_to_extract:specific_query');
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: Set requiresRAG and lowConfidence flags PROPERLY
    // ═══════════════════════════════════════════════════════════════════════
    flags.requiresRAG = this.determineRequiresRAG(intentFamily, operator, request.hasDocuments);
    flags.lowConfidence = confidence < thr.lowConfidence;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: Determine document scope using BANK-DRIVEN scopeGate
    // Pass preferredTypes based on operator for better file scoring
    // ═══════════════════════════════════════════════════════════════════════
    const preferredTypes = this.getPreferredTypesForOperator(operator);
    const scopeDecision = this.scopeGate.detectScope(
      query,
      request.availableDocs || [],
      languageLocked,
      {
        lastDocIds: request.recentDocIds,
        lastDocNames: request.recentDocNames,
      },
      preferredTypes
    );

    let docScope = this.convertScopeDecision(scopeDecision, intentFamily, query, languageLocked);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6.5: Apply all scope overrides in consistent order
    // Consolidates: follow-up inheritance, compare signals, format-only workspace
    // ═══════════════════════════════════════════════════════════════════════
    const scopeOverrides = this.applyScopeOverrides(
      docScope,
      query,
      languageLocked,
      operator,
      intentFamily,
      flags,
      request,
      operatorMatches,
      appliedRules
    );
    docScope = scopeOverrides.docScope;
    operator = scopeOverrides.operator;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7: Check if clarification needed - ChatGPT-like: RARE clarification
    // Only clarify when truly ambiguous, prefer making best guess
    // BANK-DRIVEN: Thresholds from ambiguity_rank_features.any.json
    // ═══════════════════════════════════════════════════════════════════════
    const { shouldClarify, clarifyQuestion } = this.checkClarification(
      query,
      intentFamily,
      operator,
      confidence,
      flags,
      request,
      scopeDecision,
      languageLocked,
      thr
    );

    // ═══════════════════════════════════════════════════════════════════════
    // BUILD FINAL RESULT
    // ═══════════════════════════════════════════════════════════════════════
    const result: RoutingResult = {
      languageLocked,
      intentFamily,
      operator,
      subIntent,
      docScope,
      confidence,
      shouldClarify,
      clarifyQuestion,
      matchedPatternIds: operatorMatches.flatMap(m => m.matchedPatterns || []),
      flags,
      preferredTypes,
      _debug: {
        rawIntentScores: intentMatches.map(m => ({ intent: m.intent, score: m.confidence })),
        operatorMatches: operatorMatches.map(m => ({ operator: m.operator, confidence: m.confidence })),
        appliedRules,
        languageDetection: languageResult,
        contentGuard: contentGuardResult,
        scopeDecision,
        tiebreakerResult: tiebreakerResult ? {
          intentFamily: tiebreakerResult.intentFamily,
          operator: tiebreakerResult.operator,
          confidence: tiebreakerResult.confidence,
          reason: tiebreakerResult.reason,
        } : undefined,
      },
    };

    console.log(`[Router] ${query.substring(0, 40)}... → ${intentFamily}/${operator} (${(confidence * 100).toFixed(0)}%) lang=${languageLocked} requiresRAG=${flags.requiresRAG}`);

    return result;
  }

  /**
   * Extended routing method that returns both RoutingResult and SemanticQuery
   *
   * This is the preferred method for the ChatGPT-parity pipeline.
   * It builds a complete semantic understanding of the query including:
   * - Routing decisions (intent, operator, scope)
   * - Domain detection (finance, legal, etc.)
   * - Entity extraction (metrics, dates, amounts)
   * - Format constraints (bullets, tables, etc.)
   *
   * Usage in Orchestrator:
   * ```typescript
   * const { routingResult, semanticQuery } = await router.routeWithSemantics(request);
   * const plan = answerPlanService.buildPlan(semanticQuery, chunks);
   * ```
   */
  async routeWithSemantics(request: RoutingRequest): Promise<{
    routingResult: RoutingResult;
    semanticQuery: SemanticQuery;
    normalizedQuery: NormalizedQuery;
  }> {
    // First, normalize the query
    const normalized = normalizeQuery(request.text, true);

    // Get the routing result
    const routingResult = await this.route(request);

    // Build the semantic query
    const semanticQuery = buildSemanticQuery({
      routingResult,
      routingRequest: request,
      originalQuery: request.text,
      normalizedQuery: normalized.normalized,
    });

    console.log(
      `[Router:Semantic] ${request.text.substring(0, 30)}... → ` +
      `${semanticQuery.intentFamily}/${semanticQuery.operator} ` +
      `domain=${semanticQuery.domain} depth=${semanticQuery.depthPreference}`
    );

    return {
      routingResult,
      semanticQuery,
      normalizedQuery: normalized,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS - All using BANK-DRIVEN services, NO hardcoded regex
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detect flags using BANK-DRIVEN methods only
   * NO hardcoded regex - uses runtimePatterns and contentGuard
   */
  private detectFlags(
    query: string,
    lang: string,
    request: RoutingRequest,
    contentGuardResult: ContentGuardResult
  ): RoutingFlags {
    return {
      // BANK-DRIVEN: Use runtimePatterns.isFollowupQuery
      isFollowup: runtimePatterns.isFollowupQuery(query, lang),

      // BANK-DRIVEN: Use runtimePatterns.hasPronounReference
      hasPronoun: runtimePatterns.hasPronounReference(query, lang),

      // BANK-DRIVEN: Use runtimePatterns.hasExplicitFilename
      hasExplicitFilename: runtimePatterns.hasExplicitFilename(query, lang),

      // BANK-DRIVEN: Use runtimePatterns.isInventoryQuery
      isInventoryQuery: runtimePatterns.isInventoryQuery(query, lang),

      // BANK-DRIVEN: Use contentGuard.classifyQuery result
      isContentQuestion: contentGuardResult.isContentQuestion,

      // Set properly in STEP 5 after intentFamily is determined
      requiresRAG: false,
      lowConfidence: false,
    };
  }

  /**
   * Determine if RAG is required based on intent and operator
   */
  private determineRequiresRAG(
    intentFamily: IntentFamily,
    operator: Operator,
    hasDocuments: boolean
  ): boolean {
    // file_actions don't need RAG (database lookup)
    if (intentFamily === 'file_actions') {
      return false;
    }

    // help and conversation don't need RAG
    if (intentFamily === 'help' || intentFamily === 'conversation') {
      return false;
    }

    // doc_stats might need RAG for content analysis
    if (intentFamily === 'doc_stats') {
      return hasDocuments;
    }

    // documents intent requires RAG if user has documents
    if (intentFamily === 'documents') {
      return hasDocuments;
    }

    // reasoning might need RAG
    if (intentFamily === 'reasoning') {
      return hasDocuments;
    }

    return false;
  }

  /**
   * Get preferred file types for an operator
   * Used to boost scoring in ScopeGate for operator-appropriate file types
   */
  private getPreferredTypesForOperator(operator: Operator): string[] | undefined {
    // Map operators to their preferred file types
    const operatorTypePrefs: Record<string, string[]> = {
      // Compute operators prefer spreadsheets
      'compute': ['xlsx', 'xls', 'xlsm', 'csv'],
      'calculate': ['xlsx', 'xls', 'xlsm', 'csv'],
      'sum': ['xlsx', 'xls', 'xlsm', 'csv'],
      'aggregate': ['xlsx', 'xls', 'xlsm', 'csv'],

      // Legal operators prefer PDFs and Word docs
      'legal_extract': ['pdf', 'docx', 'doc'],
      'clause': ['pdf', 'docx', 'doc'],

      // Presentation operators prefer PowerPoint
      'slides': ['pptx', 'ppt'],
      'presentation': ['pptx', 'ppt'],

      // Document operators prefer PDFs and Word docs
      'summarize': ['pdf', 'docx', 'doc', 'pptx'],
      'explain': ['pdf', 'docx', 'doc'],
      'extract': ['pdf', 'docx', 'doc', 'xlsx'],

      // Stats operators can work with any type
      'count_pages': ['pdf', 'docx'],
      'count_slides': ['pptx', 'ppt'],
      'count_sheets': ['xlsx', 'xls'],
    };

    return operatorTypePrefs[operator];
  }

  /**
   * Resolve intent family and operator using priority rules
   * Uses BANK-DRIVEN operator matches sorted by confidence
   */
  private resolveIntentAndOperator(
    query: string,
    lang: string,
    operatorMatches: Array<{ operator: string; confidence: number; matchedPatterns: string[] }>,
    intentMatches: Array<{ intent: string; confidence: number }>,
    flags: RoutingFlags,
    request: RoutingRequest,
    contentGuardResult: ContentGuardResult,
    appliedRules: string[]
  ): { intentFamily: IntentFamily; operator: Operator; confidence: number; subIntent?: string } {

    // ═══════════════════════════════════════════════════════════════════════
    // PRIORITY 0: Doc stats queries (how many pages/slides/sheets)
    // BANK-DRIVEN: Uses runtimePatterns.isDocStatsQuery
    // Must check BEFORE content questions since these are specific doc queries
    // ═══════════════════════════════════════════════════════════════════════

    // First, check if this is a "word/excel documents" file type listing (NOT doc_stats)
    // "show me word documents" = file_actions/filter, NOT doc_stats
    // BANK-DRIVEN: Uses routingOverlays.isFileTypeListingQuery()
    const isFileTypeListing = isFileTypeListingQuery(query, lang).matched;

    const docStatsResult = runtimePatterns.isDocStatsQuery(query, lang);
    if (docStatsResult.isDocStats && request.hasDocuments && !isFileTypeListing) {
      appliedRules.push(`rule:doc_stats:${docStatsResult.statsType}`);

      // Map stats type to operator (bank-driven detection already done)
      const statsOperatorMap: Record<string, Operator> = {
        pages: 'count_pages',
        slides: 'count_slides',
        sheets: 'count_sheets',
        words: 'count_pages',
        size: 'count_pages',
      };

      return {
        intentFamily: 'doc_stats',
        operator: statsOperatorMap[docStatsResult.statsType || 'pages'] || 'count_pages',
        confidence: 0.90,
        subIntent: docStatsResult.statsType,
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIORITY 0.4: File location queries ("where is it located", "it located")
    // The word "located" strongly implies FILE location, not content location
    // OVERLAY-DRIVEN: Uses routingOverlays.isFileLocationQuery()
    // ═══════════════════════════════════════════════════════════════════════
    const fileLocationResult = isFileLocationQuery(query, lang);
    if (fileLocationResult.matched) {
      appliedRules.push('rule:file_location');
      return {
        intentFamily: 'file_actions',
        operator: 'locate_file',
        confidence: fileLocationResult.confidence,
        subIntent: 'locate_file',
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIORITY 0.5: Content discovery queries (which file is about X)
    // These look like file_actions but are actually content searches
    // OVERLAY-DRIVEN: Uses routingOverlays.isContentDiscoveryQuery() and isAboutQuery()
    // ═══════════════════════════════════════════════════════════════════════
    const contentDiscoveryResult = isContentDiscoveryQuery(query, lang);
    if (contentDiscoveryResult.matched && request.hasDocuments) {
      appliedRules.push('rule:content_discovery');

      // Check if this is a "what is it about" query → summarize
      const aboutResult = isAboutQuery(query, lang);
      if (aboutResult.matched) {
        return {
          intentFamily: 'documents',
          operator: 'summarize',
          confidence: aboutResult.confidence,
          subIntent: 'content_about',
        };
      }

      return {
        intentFamily: 'documents',
        operator: 'extract',
        confidence: contentDiscoveryResult.confidence,
        subIntent: 'content_discovery',
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIORITY 0.6: Conversation override - protect greetings/thanks/goodbye
    // ChatGPT-like: greetings should respond conversationally, not route to documents
    // Must run BEFORE ContentGuard steals these queries
    // Threshold 0.55: intentMatches gives 0.5 + 0.15*matchCount, so 1 match = 0.65
    // ═══════════════════════════════════════════════════════════════════════
    console.log(`[Router:DEBUG] Reached PRIORITY 0.6 conversation check. contentGuardResult=${JSON.stringify({isFileAction: contentGuardResult.isFileAction, isContentQuestion: contentGuardResult.isContentQuestion, matchedPattern: contentGuardResult.matchedPattern})}`);
    const conversationMatch = intentMatches.find(m => m.intent === 'conversation' || m.intent === 'chitchat');
    console.log(`[Router:DEBUG] conversation check: conversationMatch=${conversationMatch?.intent}:${conversationMatch?.confidence}, intentMatches=${JSON.stringify(intentMatches.map(m => m.intent))}`);
    if (conversationMatch && conversationMatch.confidence >= 0.55) {
      // Check that operator matches don't strongly indicate file action (open/list/filter)
      const fileActionOps = ['list', 'filter', 'sort', 'group', 'open', 'locate_file'];
      const fileActionMatch = operatorMatches.find(m => fileActionOps.includes(m.operator) && m.confidence >= 0.70);
      console.log(`[Router:DEBUG] fileActionMatch check: match=${fileActionMatch?.operator}:${fileActionMatch?.confidence}, operatorMatches=${JSON.stringify(operatorMatches.map(m => m.operator))}`);
      if (!fileActionMatch) {
        appliedRules.push('rule:conversation_override');
        console.log(`[Router:DEBUG] RETURNING conversation override!`);
        return {
          intentFamily: 'conversation',
          operator: 'unknown',
          confidence: conversationMatch.confidence,
          subIntent: 'chitchat',
        };
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIORITY 0.7: Help override - protect help queries from ContentGuard
    // ChatGPT-like: "what can you do" should explain capabilities, not search docs
    // Must run BEFORE ContentGuard steals these queries
    // Threshold 0.40: Lower threshold to catch more help queries (was 0.55)
    // ═══════════════════════════════════════════════════════════════════════
    const helpOperators = ['capabilities', 'how_to'];
    const helpOperatorMatch = operatorMatches.find(m => helpOperators.includes(m.operator) && m.confidence >= 0.40);
    const helpIntentMatch = intentMatches.find(m => m.intent === 'help' || m.intent === 'help_product');
    if (helpOperatorMatch || (helpIntentMatch && helpIntentMatch.confidence >= 0.40)) {
      appliedRules.push('rule:help_override');
      return {
        intentFamily: 'help',
        operator: (helpOperatorMatch?.operator as Operator) || 'capabilities',
        confidence: helpOperatorMatch?.confidence || helpIntentMatch?.confidence || 0.65,
        subIntent: 'help',
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIORITY 1: ContentGuard says content question + has documents → documents
    // This ALWAYS wins - contentGuard is the authority on content vs file questions
    // ═══════════════════════════════════════════════════════════════════════
    if (contentGuardResult.isContentQuestion && request.hasDocuments) {
      appliedRules.push('rule:contentGuard_to_documents');

      // Find the best document operator from bank-driven matches
      const docOperators = ['summarize', 'extract', 'compare', 'compute', 'explain', 'locate_content', 'locate_docs'];
      const docMatches = operatorMatches.filter(m => docOperators.includes(m.operator));

      // SPECIAL CASE: "what is...about" queries should prefer summarize over extract
      // This handles queries like "what is the document about?" which extract might steal
      // OVERLAY-DRIVEN: Uses routingOverlays.isAboutQuery()
      const aboutQueryResult = isAboutQuery(query, lang);
      if (aboutQueryResult.matched) {
        const summarizeMatch = docMatches.find(m => m.operator === 'summarize');
        console.log(`[Router] aboutQuery overlay matched, summarizeMatch:`, summarizeMatch, 'docMatches:', docMatches.map(m => m.operator));
        if (summarizeMatch) {
          appliedRules.push('rule:about_prefers_summarize');
          return {
            intentFamily: 'documents',
            operator: 'summarize',
            confidence: Math.max(summarizeMatch.confidence, aboutQueryResult.confidence),
            subIntent: 'summarize',
          };
        }
        // If summarize not in matches but aboutQuery matched, force summarize anyway
        appliedRules.push('rule:about_forces_summarize');
        return {
          intentFamily: 'documents',
          operator: 'summarize',
          confidence: aboutQueryResult.confidence,
          subIntent: 'summarize',
        };
      }

      const docMatch = docMatches[0];

      return {
        intentFamily: 'documents',
        operator: (docMatch?.operator as Operator) || 'extract',
        confidence: Math.max(docMatch?.confidence || 0.75, contentGuardResult.confidence === 'high' ? 0.85 : 0.70),
        subIntent: docMatch?.operator,
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIORITY 2: Inventory query (no content) → file_actions
    // BANK-DRIVEN: Uses runtimePatterns.isInventoryQuery + operator matches
    // ═══════════════════════════════════════════════════════════════════════
    if (flags.isInventoryQuery && !flags.isContentQuestion) {
      appliedRules.push('rule:inventory_to_file_actions');

      // Find the best file action operator from bank-driven matches
      // FIX: Added 'stats' for folder/workspace summary queries
      const fileActionOps = ['list', 'filter', 'sort', 'group', 'count', 'open', 'locate_file', 'stats'];
      const fileMatch = operatorMatches.find(m => fileActionOps.includes(m.operator));

      return {
        intentFamily: 'file_actions',
        operator: (fileMatch?.operator as Operator) || 'list',
        confidence: Math.max(fileMatch?.confidence || 0.85, 0.85),
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIORITY 2.5: Help queries that ContentGuard classified as file actions
    // ContentGuard's NG-8 patterns correctly identify help queries as NOT content
    // but the router needs to route them to help, not file_actions
    // BANK-DRIVEN: Uses routingOverlays.isHelpOverrideQuery()
    // ═══════════════════════════════════════════════════════════════════════
    if (contentGuardResult.isFileAction) {
      const helpOverrideResult = isHelpOverrideQuery(query, lang);
      if (helpOverrideResult.matched) {
        appliedRules.push('rule:contentGuard_help_override');
        return {
          intentFamily: 'help',
          operator: 'capabilities',
          confidence: helpOverrideResult.confidence,
          subIntent: 'help',
        };
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIORITY 3: ContentGuard says file action → file_actions
    // ═══════════════════════════════════════════════════════════════════════
    if (contentGuardResult.isFileAction) {
      appliedRules.push('rule:contentGuard_to_file_actions');

      // Find the best file action operator from bank-driven matches
      // FIX: Added 'stats' for folder/workspace summary queries
      const fileActionOps = ['list', 'filter', 'sort', 'group', 'open', 'locate_file', 'again', 'count', 'stats'];
      const fileMatches = operatorMatches.filter(m => fileActionOps.includes(m.operator));

      // Special case: "again" takes priority when there's context (recentDocIds)
      // This handles queries like "Open it again" where both "open" and "again" match
      // OVERLAY-DRIVEN: Use classifyAgainIntent to distinguish "open it again" from "rules again"
      const hasRepeatContext = !!(request.previousOperator || (request.recentDocIds && request.recentDocIds.length > 0));
      const againMatch = fileMatches.find(m => m.operator === 'again');
      const againIntentType = classifyAgainIntent(query, lang);

      // Only treat as repeat action if: has context AND matched "again" AND not content-intent
      if (hasRepeatContext && againMatch && againIntentType !== 'content') {
        appliedRules.push('rule:again_with_context');
        return {
          intentFamily: 'file_actions',
          operator: 'again',
          confidence: Math.max(againMatch.confidence, 0.90),
          subIntent: 'again',
        };
      }

      const fileMatch = fileMatches[0]; // First match by confidence

      return {
        intentFamily: 'file_actions',
        operator: (fileMatch?.operator as Operator) || 'list',
        confidence: Math.max(fileMatch?.confidence || 0.75, contentGuardResult.confidence === 'high' ? 0.85 : 0.70),
        subIntent: fileMatch?.operator,
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIORITY 4: Bank-driven operator detection (highest confidence wins)
    // operatorMatches are already sorted by confidence (descending)
    // ═══════════════════════════════════════════════════════════════════════

    if (operatorMatches.length > 0) {
      // CONTEXTUAL FILTER: "again" operator only triggers with context AND action-intent
      // Context signals: previousOperator or recentDocIds (from prior actions in session)
      // This prevents "What are the rules again?" from being misrouted as a repeat action
      // OVERLAY-DRIVEN: Uses classifyAgainIntent to detect content-intent "again"
      const hasRepeatContext = !!(
        request.previousOperator ||
        (request.recentDocIds && request.recentDocIds.length > 0)
      );

      // Check if "again" is content-intent (e.g., "rules again", "explain again")
      const againType = classifyAgainIntent(query, lang);
      const isAgainContentIntent = againType === 'content';

      let filteredMatches = operatorMatches;
      // Filter out "again" if: no context OR content-intent
      if (!hasRepeatContext || isAgainContentIntent) {
        filteredMatches = operatorMatches.filter(m => m.operator !== 'again');
        if (isAgainContentIntent && operatorMatches.some(m => m.operator === 'again')) {
          appliedRules.push('rule:again_content_intent_override');
        }
      }

      if (filteredMatches.length === 0) {
        // All matches were "again" without context - fall through to other detection
        appliedRules.push('rule:again_filtered_no_context');
        // Continue to PRIORITY 5 below
      } else {
        const topMatch = filteredMatches[0];
        const { intentFamily, operator } = this.operatorToIntent(topMatch.operator);

        // Special handling: locate operators - use BANK-DRIVEN detection
        if (topMatch.operator === 'locate' || topMatch.operator === 'locate_file' || topMatch.operator === 'locate_content') {
          // BANK-DRIVEN: Use runtimePatterns.isLocationQuery for file location
          const isFileLocation = runtimePatterns.isLocationQuery(query, lang) && !flags.isContentQuestion;

          if (isFileLocation) {
            appliedRules.push('rule:locate_file');
            return {
              intentFamily: 'file_actions',
              operator: 'locate_file',
              confidence: topMatch.confidence,
            };
          } else {
            appliedRules.push('rule:locate_content');
            return {
              intentFamily: 'documents',
              operator: 'locate_content',
              confidence: topMatch.confidence,
            };
          }
        }

        appliedRules.push(`rule:operator_match:${topMatch.operator}`);
        return {
          intentFamily,
          operator: operator as Operator,
          confidence: topMatch.confidence,
          subIntent: topMatch.operator,
        };
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIORITY 5: Intent-based fallback
    // intentMatches are already sorted by confidence (descending)
    // ═══════════════════════════════════════════════════════════════════════
    if (intentMatches.length > 0) {
      const topIntent = intentMatches[0];
      const family = this.intentToFamily(topIntent.intent);
      const defaultOp = this.getDefaultOperator(family);

      appliedRules.push(`rule:intent_fallback:${topIntent.intent}`);
      return {
        intentFamily: family,
        operator: defaultOp,
        confidence: topIntent.confidence,
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIORITY 6: Has documents → documents/extract (default)
    // ChatGPT-like: make a best guess rather than asking
    // ═══════════════════════════════════════════════════════════════════════
    if (request.hasDocuments) {
      appliedRules.push('rule:default_documents');
      return {
        intentFamily: 'documents',
        operator: 'extract',
        confidence: 0.50,
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIORITY 7: No documents → help
    // ═══════════════════════════════════════════════════════════════════════
    appliedRules.push('rule:default_help');
    return {
      intentFamily: 'help',
      operator: 'capabilities',
      confidence: 0.40,
    };
  }

  /**
   * Check if query is a document discovery question (which document/file mentions X)
   * These should ALWAYS use workspace scope to search all documents
   * OVERLAY-DRIVEN: Now delegates to routingOverlays.isDocDiscoveryQuery()
   */
  private isDocumentDiscoveryQuery(query: string, lang: string = 'en'): boolean {
    return isDocDiscoveryQuery(query, lang).matched;
  }

  /**
   * Convert scopeGate decision to DocScope
   */
  private convertScopeDecision(scopeDecision: ScopeDecision, intentFamily: IntentFamily, query?: string, lang: string = 'en'): DocScope {
    // file_actions don't use RAG scope
    if (intentFamily === 'file_actions') {
      return { mode: 'none' };
    }

    // DOCUMENT DISCOVERY OVERRIDE: "which document/file..." queries should always search workspace
    // These are asking WHICH document (searching across all), not about a specific document
    // OVERLAY-DRIVEN: Uses routingOverlays.isDocDiscoveryQuery()
    if (query && this.isDocumentDiscoveryQuery(query, lang)) {
      return { mode: 'workspace' };
    }

    switch (scopeDecision.type) {
      case 'single_doc':
        return {
          mode: 'single_doc',
          docIds: scopeDecision.targetDocIds,
          docNames: scopeDecision.targetDocNames,
        };
      case 'multi_doc':
        return {
          mode: 'multi_doc',
          docIds: scopeDecision.targetDocIds,
          docNames: scopeDecision.targetDocNames,
        };
      case 'any_doc':
        return { mode: 'workspace' };
      case 'needs_clarification':
        // Even when scope needs clarification, default to workspace search
        // ChatGPT-like: prefer making a guess over asking user
        return { mode: 'workspace' };
      default:
        return { mode: 'workspace' };
    }
  }

  /**
   * Apply all scope overrides in a consistent order
   * Consolidates: follow-up inheritance, compare signals, format-only workspace, discovery workspace
   *
   * Order matters:
   * 1. Follow-up inheritance (highest priority - maintain conversation context)
   * 2. Compare multi-doc signals
   * 3. Format-only workspace override
   * 4. Document discovery workspace (already handled in convertScopeDecision)
   */
  private applyScopeOverrides(
    docScope: DocScope,
    query: string,
    lang: string,
    operator: Operator,
    intentFamily: IntentFamily,
    flags: RoutingFlags,
    request: RoutingRequest,
    operatorMatches: Array<{ operator: string; confidence: number; matchedPatterns: string[] }>,
    appliedRules: string[]
  ): { docScope: DocScope; operator: Operator } {
    let resultScope = { ...docScope };
    let resultOperator = operator;

    // ═══════════════════════════════════════════════════════════════════════
    // OVERRIDE 0: Explicit UI attachment lock (HIGHEST priority)
    // When user explicitly attaches documents in the chat UI, ALWAYS lock scope
    // to those documents. This overrides ALL other scope logic including follow-ups.
    // ═══════════════════════════════════════════════════════════════════════
    if (request.attachedDocumentIds && request.attachedDocumentIds.length > 0 && intentFamily === 'documents') {
      const ids = request.attachedDocumentIds;
      resultScope = {
        mode: ids.length === 1 ? 'single_doc' : 'multi_doc',
        docIds: ids,
        docNames: request.availableDocs?.filter(d => ids.includes(d.id)).map(d => d.filename),
      };
      appliedRules.push('rule:attached_docs_scope_lock');
      // Return early - UI attachments override everything
      return { docScope: resultScope, operator: resultOperator };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OVERRIDE 1: Follow-up inheritance (highest priority)
    // Follow-ups stay on the same document(s) unless user clearly switches
    // ═══════════════════════════════════════════════════════════════════════
    if (flags.isFollowup && intentFamily === 'documents' && request.recentDocIds && request.recentDocIds.length > 0) {
      if (request.recentDocIds.length === 1) {
        resultScope = {
          mode: 'single_doc',
          docIds: request.recentDocIds,
          docNames: request.recentDocNames,
        };
      } else {
        resultScope = {
          mode: 'multi_doc',
          docIds: request.recentDocIds,
          docNames: request.recentDocNames,
        };
      }
      appliedRules.push('rule:followup_inherit_scope');

      // Also inherit operator for ambiguous follow-ups
      const hasStrongOperatorSignal = operatorMatches.length > 0 && operatorMatches[0].confidence >= 0.7;
      if (!hasStrongOperatorSignal) {
        if (request.previousOperator) {
          resultOperator = request.previousOperator as Operator;
          appliedRules.push(`rule:followup_inherit_operator:${request.previousOperator}`);
        } else if (request.recentDocIds.length >= 2) {
          resultOperator = 'compare';
          appliedRules.push('rule:followup_infer_compare');
        }
      }

      return { docScope: resultScope, operator: resultOperator };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OVERRIDE 1.5: Workspace signals → force workspace scope
    // Queries with "all documents", "across documents", "everything" should search all
    // BUT only if there's no specific doc name reference
    // BANK-DRIVEN: Uses routingOverlays.hasWorkspaceScopeSignals()
    // ═══════════════════════════════════════════════════════════════════════
    const docRefResult = hasDocReference(query, lang);
    const workspaceScopeResult = hasWorkspaceScopeSignals(query, lang);

    // Only apply workspace signal if NO doc reference exists
    if (workspaceScopeResult.matched && intentFamily === 'documents' && !docRefResult.matched && !flags.isFollowup) {
      resultScope = { mode: 'workspace' };
      appliedRules.push('rule:workspace_signal_detected');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OVERRIDE 1.6: Compute without doc reference → workspace
    // "what is total revenue" should search all docs, not narrow to one
    // BUT respect explicit doc references: "sum of X in DocumentName" → single_doc
    // ═══════════════════════════════════════════════════════════════════════
    if (resultOperator === 'compute' && resultScope.mode === 'single_doc') {
      // docRefResult already computed above
      if (!docRefResult.matched && !flags.isFollowup) {
        resultScope = { mode: 'workspace' };
        appliedRules.push('rule:compute_workspace_default');
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OVERRIDE 2: Compare queries with multi-doc signals → multi_doc
    // ═══════════════════════════════════════════════════════════════════════
    if (operator === 'compare') {
      const multiDocResult = hasMultiDocSignals(query, lang);
      if (multiDocResult.matched) {
        resultScope = { mode: 'multi_doc' };
        appliedRules.push('rule:compare_multi_doc_signal');
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OVERRIDE 3: Format-only requests with no doc reference → workspace
    // (docRefResult already computed in OVERRIDE 1.5)
    // ═══════════════════════════════════════════════════════════════════════
    const formatResult = isFormatOnlyQuery(query, lang);
    if (!docRefResult.matched && formatResult.matched && resultScope.mode === 'single_doc' && !flags.isFollowup) {
      resultScope = { mode: 'workspace' };
      appliedRules.push('rule:format_request_workspace');
    }

    return { docScope: resultScope, operator: resultOperator };
  }

  private operatorToIntent(operator: string): { intentFamily: IntentFamily; operator: string } {
    // FIX: Added 'stats' for folder/workspace summary queries
    const fileActionsOps = ['list', 'filter', 'sort', 'group', 'open', 'locate_file', 'again', 'count', 'stats'];
    const documentsOps = ['summarize', 'extract', 'compare', 'compute', 'explain', 'locate_content', 'expand', 'locate_docs'];
    const docStatsOps = ['count_pages', 'count_sheets', 'count_slides'];
    const helpOps = ['capabilities', 'how_to', 'help'];

    if (fileActionsOps.includes(operator)) {
      return { intentFamily: 'file_actions', operator };
    }
    if (documentsOps.includes(operator)) {
      return { intentFamily: 'documents', operator };
    }
    if (docStatsOps.includes(operator)) {
      return { intentFamily: 'doc_stats', operator };
    }
    if (helpOps.includes(operator)) {
      return { intentFamily: 'help', operator };
    }

    return { intentFamily: 'documents', operator: 'extract' };
  }

  private intentToFamily(intent: string): IntentFamily {
    const mapping: Record<string, IntentFamily> = {
      documents: 'documents',
      file_actions: 'file_actions',
      help: 'help',
      conversation: 'conversation',
      reasoning: 'reasoning',
      doc_stats: 'doc_stats',
      accounting: 'documents',
      finance: 'documents',
      legal: 'documents',
      medical: 'documents',
      engineering: 'documents',
      error: 'error',
    };
    return mapping[intent] || 'documents';
  }

  private getDefaultOperator(family: IntentFamily): Operator {
    const defaults: Record<IntentFamily, Operator> = {
      documents: 'extract',
      file_actions: 'list',
      help: 'capabilities',
      conversation: 'unknown',
      reasoning: 'compute',
      doc_stats: 'count_pages',
      error: 'unknown',
    };
    return defaults[family];
  }

  /**
   * Check if clarification is needed - ChatGPT-like: RARE clarification
   * Prefer making best guess over asking user
   *
   * Uses BANK-DRIVEN clarifyTemplates for messages when needed
   * BANK-DRIVEN: Thresholds from ambiguity_rank_features.any.json
   */
  private checkClarification(
    query: string,
    intentFamily: IntentFamily,
    operator: Operator,
    confidence: number,
    flags: RoutingFlags,
    request: RoutingRequest,
    scopeDecision: ScopeDecision,
    language: 'en' | 'pt' | 'es',
    thr: RouterThresholds
  ): { shouldClarify: boolean; clarifyQuestion?: string } {

    // ═══════════════════════════════════════════════════════════════════════
    // ChatGPT-like: NEVER clarify for high confidence queries
    // BANK-DRIVEN: highConfidence threshold from ambiguity_rank_features
    // ═══════════════════════════════════════════════════════════════════════
    if (confidence >= thr.highConfidence) {
      return { shouldClarify: false };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ChatGPT-like: NEVER clarify for inventory or content questions
    // These have clear intent even at lower confidence
    // ═══════════════════════════════════════════════════════════════════════
    if (flags.isInventoryQuery || flags.isContentQuestion) {
      return { shouldClarify: false };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ChatGPT-like: Don't clarify for help intent
    // ═══════════════════════════════════════════════════════════════════════
    if (intentFamily === 'help') {
      return { shouldClarify: false };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ONLY clarify for pronoun reference WITHOUT context (truly ambiguous)
    // But still prefer not to clarify if we have any documents
    // BANK-DRIVEN: clarifyBelow threshold from ambiguity_rank_features
    // ═══════════════════════════════════════════════════════════════════════
    if (
      flags.hasPronoun &&
      !request.recentDocIds?.length &&
      intentFamily === 'documents' &&
      confidence < thr.clarifyBelow &&
      request.hasDocuments === false  // Only clarify if user has NO documents at all
    ) {
      // Use BANK-DRIVEN clarifyTemplates
      const langCode = language === 'es' ? 'en' : language;
      const clarifyResult = this.clarifyTemplates.getMissingInfo(
        'no_document_specified',
        langCode as 'en' | 'pt'
      );
      return {
        shouldClarify: true,
        clarifyQuestion: clarifyResult.message,
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ChatGPT-like: Even for very low confidence, prefer making a guess
    // Only clarify if confidence is extremely low AND no clear signals
    // BANK-DRIVEN: clarifyBelow threshold from ambiguity_rank_features
    // ═══════════════════════════════════════════════════════════════════════
    if (
      confidence < thr.clarifyBelow &&
      !flags.hasPronoun &&
      !flags.hasExplicitFilename &&
      !flags.isFollowup &&
      intentFamily !== 'file_actions' &&
      request.hasDocuments === false
    ) {
      // Very low confidence with no signals and no documents - MAYBE clarify
      // But still prefer not to
      return { shouldClarify: false };
    }

    // Default: don't clarify - make best guess
    return { shouldClarify: false };
  }
}

// Export singleton
export const router = RouterService.getInstance();
