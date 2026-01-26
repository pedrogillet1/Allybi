/**
 * FINAL ANSWER GATE SERVICE
 *
 * ChatGPT-parity: Hard stop before sending responses.
 * Enforces markdown integrity, UI contracts, and quality minimums.
 *
 * Runs AFTER composition and BEFORE returning the response.
 *
 * BANK-DRIVEN: Reads quality_gates.any.json for thresholds and gate definitions.
 */

import fs from 'fs';
import path from 'path';
import type { ComposedResponse } from '../../types/handlerResult.types';
import { getBannedPhrases } from './bannedPhrases.service';
import { getBank } from './bankLoader.service';

// Bank-driven configuration loader
function loadListFirstOperators(): string[] {
  // Try bank-driven approach first
  const overlayBank = getBank<{ operators: string[] }>('list_first_operators');
  if (overlayBank?.operators) {
    return overlayBank.operators;
  }

  // Fallback to file-based loading
  try {
    const bankPath = path.join(__dirname, '../../data/routing_overlays/list_first_operators.json');
    if (fs.existsSync(bankPath)) {
      const bank = JSON.parse(fs.readFileSync(bankPath, 'utf-8'));
      return bank.operators || [];
    }
  } catch (error) {
    console.warn('[FinalAnswerGate] Failed to load list_first_operators bank, using empty');
  }
  return [];
}

// Cache the loaded operators
let listFirstOperatorsCache: string[] | null = null;
function getListFirstOperators(): string[] {
  if (!listFirstOperatorsCache) {
    listFirstOperatorsCache = loadListFirstOperators();
  }
  return listFirstOperatorsCache;
}

// Quality gates bank types
interface QualityGatesBank {
  _meta: { id: string; version: string };
  config: {
    enabled: boolean;
    limits: {
      maxCharsHard: number;
      maxBlocksHard: number;
      maxBulletsHard: number;
      maxTablesHard: number;
      maxQuotesHard: number;
      maxCodeBlocksHard: number;
    };
    modes: {
      byEnv: Record<string, { strictness: string; failClosed: boolean }>;
    };
  };
  gateOrder: string[];
  gates: Record<string, any>;
}

// ============================================================================
// TYPES
// ============================================================================

export type GateAction = 'PROCEED' | 'REGEN_ONCE' | 'FALLBACK';

export interface GateResult {
  action: GateAction;
  passed: boolean;
  hardBlocks: string[];
  softBlocks: string[];
  reason?: string;
}

export interface GateContext {
  intent: string;
  operator: string;
  language: 'en' | 'pt' | 'es';
  isButtonOnly?: boolean;
  hasAttachments?: boolean;
  regenAttempted?: boolean;
  // Exact-count constraints from user request
  constraints?: {
    exactBullets?: number;
    exactNumberedItems?: number;
    exactSentences?: number;
  };
  // Numeric grounding check result from orchestrator
  numericGrounding?: {
    passed: boolean;
    ungroundedCount: number;
    suggestedAction: 'proceed' | 'block' | 'quote_fallback';
    quoteFallback?: string;
  };
}

interface GatePolicy {
  defaults: {
    gateEnabled: boolean;
    hardBlocks: Record<string, boolean>;
    softBlocks: Record<string, string>;
    operatorMinimums: Record<string, { minChars: number; minSentences: number }>;
    uiContract: {
      buttonOnlyMeansNoText: boolean;
      fileActionsPreferAttachments: boolean;
      sourcesMustBeAttachments: boolean;
      maxSourceButtons: number;
    };
    actions: {
      onHardBlock: string;
      onSoftBlock: string;
      fallbackMessageKey: string;
    };
  };
  overrides?: Array<{
    match: { intent?: string };
    values: Partial<GatePolicy['defaults']>;
  }>;
}

// ============================================================================
// VALIDATION PATTERNS
// ============================================================================

const PATTERNS = {
  // Hard blocks - structural problems
  // FIX: Remove /g from patterns used with .test() - /g is stateful and skips matches
  docMarker: /\{\{DOC::[^}]+\}\}/,  // No /g - used with .test()
  // DOC_N labels from LLM chunking (e.g., [[DOC_1_P12]], [DOC_2], [SNIPPET 1], etc.)
  // FIX: Also catch SNIPPET labels which are the new internal format
  docLabel: /\[\[?(?:DOC_\d+(?:_P\d+)?|SNIPPET\s*\d+)\]?\]/i,  // No /g - used with .test()
  actionMarker: /\{\{ACTION::[^}]+\}\}/,  // No /g - used with .test()
  loadMoreMarker: /\{\{LOAD_MORE::[^}]+\}\}/,  // No /g - used with .test()
  trailingEllipsis: /(?:\.{3}|…)\s*$/,
  unicodeEllipsis: /…/g,  // OK - used for replace
  danglingBullet: /^[-*]\s*$/m,
  danglingNumber: /^\d+\.\s*$/m,
  unbalancedCodeFences: /```/g,  // OK - used with .match() for counting
  boldMarker: /\*\*/g,  // OK - used with .match() for counting
  rawHtml: /<(?:script|iframe|object|embed|form|input|button|select|textarea|style|link|meta|base)[^>]*>/i,  // No /g - used with .test()
  // FIX: brokenTable - check for pipe lines without proper separator row
  // A valid table has: |header| followed by |---|---| separator
  // Broken = has 2+ pipe lines but no separator row matching |[-:| ]+|
  brokenTable: /^\|.+\|$/m,  // Just detect pipe rows - validation logic moved to check()

  // Truncation detection
  midSentenceCut: /[a-zA-Z,]\s*$/, // Ends with letter/comma (no punctuation)
  incompleteList: /^[-*\d.]\s+[^\n]+[^.!?\n]\s*$/m, // List item without ending punctuation

  // CRITICAL: Numeric truncation - currency/numbers merged with text
  // Catches: "R$ 900This", "R$ 1,000,000.00The", "$500the", "€200Este"
  // Also catches bolded versions: "**R$ 900**This", "**R$ 900,000.00**The"
  // Pattern: optional bold + currency + number + optional bold + letter (no space = error)
  numericTruncation: /\*{0,2}(?:R\$|US\$|\$|€|£)\s*[\d,.]+\*{0,2}[A-Za-z]/,

  // NOTE: Suspicious currency detection moved to NumericGroundingService
  // which compares answer numbers against evidence numbers (evidence-shaped, not query-shaped)

  // CRITICAL: Unfinished list - colon followed by nothing or whitespace only
  // Catches: "The main points:" with nothing after, or "Here are the items:\n\n"
  unfinishedList: /:\s*(?:\n\s*)?$/,

  // CRITICAL: Lead-in colon with no actual list content following
  // Catches: "The assumptions are:" followed by paragraph instead of bullets
  colonWithoutList: /:\s*\n(?!\s*[-*•\d])/,

  // List patterns for counting
  bulletItem: /^[-*]\s+.+$/gm,  // OK - used with .match() for counting
  numberedItem: /^\d+\.\s+.+$/gm,  // OK - used with .match() for counting

  // Soft blocks - quality issues
  vagueDeflection: /^(I (?:cannot|can't|don't|am unable)|Unfortunately|I apologize|Sorry)/i,
  // FIX: Valid "not found" responses should NOT be treated as vague deflection
  validNotFound: /\b(could not find|couldn't find|not found|isn't mentioned|is not mentioned|not mentioned|no mention of|não (?:encontrei|achei)|não é mencionado|não foi mencionado|no se menciona|no encontré)\b/i,
  // FIX: Language mixing - more comprehensive patterns, require word boundaries
  // Only flag if strong foreign-language markers appear (not common loanwords)
  languageMixing: {
    en: /\b(não|você|está|isso|pode|então|porque|quando|onde|também|muito|fazer|ainda|depois|antes|sempre|nunca|quero|preciso|tenho)\b/i,
    pt: /\b(the|you|this|that|have|with|from|what|when|where|would|could|should|because|however|therefore|although|whether)\b/i,
    es: /\b(the|you|this|that|have|with|from|what|when|where|would|could|should|because|however|therefore|although|whether)\b/i,
  },
};

// ============================================================================
// FINAL ANSWER GATE
// ============================================================================

export class FinalAnswerGateService {
  private policy: GatePolicy | null = null;
  private qualityGatesBank: QualityGatesBank | null = null;
  private bankVersion: string = 'unknown';

  constructor() {
    this.loadPolicy();
    this.loadQualityGatesBank();
  }

  private loadPolicy(): void {
    try {
      const policyPath = path.join(
        __dirname,
        '../../data/policies/final_answer_gate_policy.json'
      );
      if (fs.existsSync(policyPath)) {
        this.policy = JSON.parse(fs.readFileSync(policyPath, 'utf-8'));
      }
    } catch (error) {
      console.warn('[FinalAnswerGate] Failed to load policy, using defaults');
    }
  }

  /**
   * BANK-DRIVEN: Load quality gates bank for thresholds and gate definitions
   */
  private loadQualityGatesBank(): void {
    try {
      this.qualityGatesBank = getBank<QualityGatesBank>('quality_gates');
      if (this.qualityGatesBank) {
        this.bankVersion = this.qualityGatesBank._meta.version;
        console.log(`[FinalAnswerGate] Loaded quality_gates bank v${this.bankVersion}`);
      }
    } catch (error) {
      console.warn('[FinalAnswerGate] Failed to load quality_gates bank, using hardcoded defaults');
    }
  }

  /**
   * Get bank-driven limits with fallback to hardcoded defaults
   */
  private getLimits(): { maxCharsHard: number; maxBulletsHard: number; maxTablesHard: number } {
    if (this.qualityGatesBank?.config?.limits) {
      return this.qualityGatesBank.config.limits;
    }
    // Hardcoded fallback
    return {
      maxCharsHard: 4200,
      maxBulletsHard: 18,
      maxTablesHard: 3,
    };
  }

  /**
   * Check if gate is enabled in bank config
   */
  private isGateEnabled(): boolean {
    return this.qualityGatesBank?.config?.enabled !== false;
  }

  /**
   * Run the final answer gate on a composed response.
   */
  check(response: ComposedResponse, context: GateContext): GateResult {
    const hardBlocks: string[] = [];
    const softBlocks: string[] = [];

    const content = response.content || '';
    const { intent, operator, language, isButtonOnly, regenAttempted } = context;

    // ========================================================================
    // HARD BLOCKS - Must fix or fallback
    // ========================================================================

    // 1. DOC/ACTION markers in text (should be in attachments)
    if (PATTERNS.docMarker.test(content)) {
      hardBlocks.push('DOC_MARKERS_IN_TEXT');
    }
    // 1b. DOC_N labels from LLM chunking (should never leak to output)
    if (PATTERNS.docLabel.test(content)) {
      hardBlocks.push('DOC_LABELS_IN_TEXT');
    }
    if (PATTERNS.actionMarker.test(content) || PATTERNS.loadMoreMarker.test(content)) {
      hardBlocks.push('ACTION_MARKERS_IN_TEXT');
    }

    // 2. Raw HTML
    if (PATTERNS.rawHtml.test(content)) {
      hardBlocks.push('RAW_HTML');
    }

    // 3. Trailing ellipsis (truncation indicator)
    if (PATTERNS.trailingEllipsis.test(content)) {
      hardBlocks.push('TRAILING_ELLIPSIS');
    }

    // 4. Dangling list markers
    if (PATTERNS.danglingBullet.test(content)) {
      hardBlocks.push('DANGLING_BULLET');
    }
    if (PATTERNS.danglingNumber.test(content)) {
      hardBlocks.push('DANGLING_NUMBER');
    }

    // 5. Unbalanced code fences
    const codeFenceCount = (content.match(PATTERNS.unbalancedCodeFences) || []).length;
    if (codeFenceCount % 2 !== 0) {
      hardBlocks.push('UNBALANCED_CODE_FENCES');
    }

    // 6. Broken markdown table
    // FIX: Only flag as broken if it LOOKS like a table attempt but is malformed
    // A valid markdown table needs: header row, separator row (|---|), data rows
    if (content.includes('|')) {
      const lines = content.split('\n');
      const pipeLines = lines.filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'));
      // Only check if there are 2+ pipe-delimited lines (suggesting table intent)
      if (pipeLines.length >= 2) {
        // Valid separator: | followed by dashes/colons/spaces/pipes, ending with |
        const hasSeparator = pipeLines.some(l => /^\|[\s-:|]+\|$/.test(l.trim()));
        // Only flag broken if: compare intent OR explicit table structure without separator
        if (!hasSeparator && (intent === 'compare' || pipeLines.length >= 3)) {
          hardBlocks.push('BROKEN_TABLE');
        }
      }
    }

    // 7. Button-only response with text (UI contract violation)
    if (isButtonOnly && content.trim().length > 0) {
      hardBlocks.push('BUTTON_ONLY_HAS_TEXT');
    }

    // 8. Empty answer when text is required
    if (!isButtonOnly && content.trim().length === 0 && intent !== 'file_actions') {
      hardBlocks.push('EMPTY_ANSWER');
    }

    // 9. Unbalanced bold markers
    const boldCount = (content.match(PATTERNS.boldMarker) || []).length;
    if (boldCount % 2 !== 0) {
      hardBlocks.push('UNBALANCED_BOLD');
    }

    // 10. Mid-sentence truncation (no terminal punctuation)
    const trimmed = content.trim();
    if (trimmed.length > 50 && PATTERNS.midSentenceCut.test(trimmed)) {
      // Check it's not a list item or code block
      const lastLine = trimmed.split('\n').pop() || '';
      const isListItem = /^[-*\d.]/.test(lastLine.trim());
      const isCodeBlock = lastLine.includes('```');
      if (!isListItem && !isCodeBlock) {
        hardBlocks.push('MID_SENTENCE_TRUNCATION');
      }
    }

    // 10b. CRITICAL: Numeric truncation - "R$ 900This..." catastrophic error
    // Currency/numbers merged with following text indicates extraction/composition failure
    if (PATTERNS.numericTruncation.test(content)) {
      hardBlocks.push('NUMERIC_TRUNCATION');
    }

    // NOTE: Numeric grounding check (NUMERIC_NOT_IN_EVIDENCE) is done in orchestrator
    // where evidence chunks are available for comparison

    // 10c. CRITICAL: Unfinished list - ends with colon but no list follows
    // "The main assumptions:" with nothing after = compositor failure
    if (PATTERNS.unfinishedList.test(content)) {
      hardBlocks.push('UNFINISHED_LIST');
    }

    // 10d. CRITICAL: Lead-in colon followed by paragraph instead of list
    // "Here are the items:" followed by prose = structural failure
    if (PATTERNS.colonWithoutList.test(content)) {
      // Only flag if there's clearly a lead-in that expects a list
      const colonMatch = content.match(/([^.!?\n]{10,}:)\s*\n/);
      if (colonMatch) {
        const leadIn = colonMatch[1].toLowerCase();
        const listIntentWords = ['following', 'these', 'here', 'below', 'include', 'are', 'list', 'points', 'items', 'steps', 'reasons', 'assumptions', 'principais', 'seguintes'];
        const hasListIntent = listIntentWords.some(w => leadIn.includes(w));
        if (hasListIntent) {
          hardBlocks.push('COLON_WITHOUT_LIST');
        }
      }
    }

    // 11. Exact-count constraint violations
    if (context.constraints) {
      const countResult = this.validateExactCounts(content, context.constraints);
      if (!countResult.passed) {
        hardBlocks.push(`EXACT_COUNT_VIOLATION: ${countResult.reason}`);
      }
    }

    // 11b. Numeric grounding check (passed from orchestrator)
    // This checks if numbers in the answer exist in evidence
    if (context.numericGrounding && !context.numericGrounding.passed) {
      if (context.numericGrounding.suggestedAction === 'block') {
        hardBlocks.push('NUMERIC_NOT_IN_EVIDENCE');
      } else if (context.numericGrounding.suggestedAction === 'quote_fallback') {
        hardBlocks.push('NUMERIC_REQUIRES_QUOTE_FALLBACK');
      }
    }

    // 12. Bank-driven banned phrases check
    // P0.2 FIX: Wire banned_phrases.any.json for comprehensive phrase checking
    const bannedPhrases = getBannedPhrases();
    if (bannedPhrases.isLoaded()) {
      const bannedCheck = bannedPhrases.check(content, language);

      // Hard blocked phrases trigger regen
      if (bannedCheck.hasHardBlocked) {
        const hardMatches = bannedCheck.matches
          .filter(m => m.category === 'hardBlocked')
          .map(m => m.phrase)
          .slice(0, 3); // Limit to 3 for logging
        hardBlocks.push(`BANNED_PHRASE: ${hardMatches.join(', ')}`);
      }

      // Sources section in text (should be attachments)
      if (bannedCheck.hasSourcesSection) {
        hardBlocks.push('SOURCES_SECTION_IN_TEXT');
      }
    }

    // ========================================================================
    // SOFT BLOCKS - Regenerate once
    // ========================================================================

    // 1. Language drift (mixing languages)
    // FIX: Require 3+ hits AND check ratio - a few loanwords in a long response is OK
    const langPattern = PATTERNS.languageMixing[language];
    if (langPattern) {
      const hits = (content.match(new RegExp(langPattern.source, 'gi')) || []).length;
      const wordCount = content.split(/\s+/).length;
      const hitRatio = hits / wordCount;
      // Only flag if: 3+ foreign words AND >5% of content is foreign
      if (hits >= 3 && hitRatio > 0.05) {
        softBlocks.push('LANGUAGE_DRIFT');
      }
    }

    // 2. Vague deflection patterns
    // FIX: Exclude valid "not found" responses - these are grounded, not vague
    if (PATTERNS.vagueDeflection.test(content) && !PATTERNS.validNotFound.test(content)) {
      softBlocks.push('VAGUE_DEFLECTION');
    }

    // 3. Too short for operator - REMOVED
    // FIX: Volume enforcement is now handled by AnswerComposer (single source of truth)
    // The gate should only check structural/hard violations, not volume
    // This prevents regen storms from competing quality systems

    // 4. Check for quality warnings from composer
    if (response.meta?.warnings?.some((w: string) =>
      w.startsWith('QUALITY_WARNING') || w.startsWith('VAGUE_CONTENT_DETECTED')
    )) {
      softBlocks.push('COMPOSER_QUALITY_WARNING');
    }

    // 5. Composer flagged for regeneration
    if (response.meta?.requiresRegeneration) {
      softBlocks.push('COMPOSER_REGEN_FLAG');
    }

    // 6. Starts with list (no opener) for operators that require lead-in
    // BANK-DRIVEN: Operators loaded from list_first_operators.json
    const listFirstOperators = getListFirstOperators();
    const userRequestedExactBullets = context.constraints?.exactBullets !== undefined;
    if (listFirstOperators.includes(operator) && !userRequestedExactBullets) {
      const startsWithBullet = /^[-•]\s+/.test(trimmed);
      const startsWithNumber = /^\d+\.\s+/.test(trimmed);
      if (startsWithBullet || startsWithNumber) {
        softBlocks.push('STARTS_WITH_LIST');
      }
    }

    // 7. Bank-driven soft blocks (robotic phrases)
    // P0.2 FIX: Wire banned_phrases.any.json for robotic phrase detection
    if (bannedPhrases.isLoaded()) {
      const bannedCheck = bannedPhrases.check(content, language);
      if (bannedCheck.hasRoboticPhrases) {
        softBlocks.push('ROBOTIC_PHRASES_DETECTED');
      }
      if (bannedCheck.hasSoftBlocked) {
        softBlocks.push('SOFT_BLOCKED_PHRASES');
      }
    }

    // ========================================================================
    // DETERMINE ACTION
    // ========================================================================

    if (hardBlocks.length > 0) {
      // Hard blocks: regen once, then fallback
      if (regenAttempted) {
        return {
          action: 'FALLBACK',
          passed: false,
          hardBlocks,
          softBlocks,
          reason: `Hard block after regen: ${hardBlocks[0]}`,
        };
      }
      return {
        action: 'REGEN_ONCE',
        passed: false,
        hardBlocks,
        softBlocks,
        reason: `Hard block: ${hardBlocks[0]}`,
      };
    }

    if (softBlocks.length > 0 && !regenAttempted) {
      return {
        action: 'REGEN_ONCE',
        passed: false,
        hardBlocks,
        softBlocks,
        reason: `Soft block: ${softBlocks[0]}`,
      };
    }

    return {
      action: 'PROCEED',
      passed: true,
      hardBlocks,
      softBlocks,
    };
  }

  /**
   * Strip DOC markers from text (safety net - they should never be there)
   */
  stripMarkers(text: string): string {
    return text
      .replace(PATTERNS.docMarker, '')
      .replace(PATTERNS.docLabel, '')
      .replace(PATTERNS.actionMarker, '')
      .replace(PATTERNS.loadMoreMarker, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /**
   * REPAIR: Fix numeric truncation issues
   * Adds space after currency values that are glued to following text
   * E.g., "**R$ 900**This" → "**R$ 900**. This"
   * E.g., "R$ 900,000.00The" → "R$ 900,000.00. The"
   */
  repairNumericTruncation(text: string): { text: string; repaired: boolean } {
    let repaired = false;

    // Pattern: currency + number (possibly bolded) + immediately followed by capital letter
    // Fix by adding period and space
    const result = text.replace(
      /(\*{0,2}(?:R\$|US\$|\$|€|£)\s*[\d,.]+\*{0,2})([A-Z])/g,
      (_, currency, letter) => {
        repaired = true;
        return `${currency}. ${letter}`;
      }
    );

    // Also fix lowercase letter immediately after number (less common but still broken)
    const result2 = result.replace(
      /(\*{0,2}(?:R\$|US\$|\$|€|£)\s*[\d,.]+\*{0,2})([a-z])/g,
      (_, currency, letter) => {
        repaired = true;
        return `${currency}. ${letter.toUpperCase()}`;
      }
    );

    return { text: result2, repaired };
  }

  /**
   * REPAIR: Fix broken bullets (glued to preceding text)
   * E.g., "Here are the points:- First" → "Here are the points:\n- First"
   */
  repairBrokenBullets(text: string): { text: string; repaired: boolean } {
    let repaired = false;

    // Pattern: colon or period followed immediately by bullet marker (no newline)
    const result = text.replace(
      /([.:])(\s*)(-\s+)/g,
      (_, punct, space, bullet) => {
        if (!space.includes('\n')) {
          repaired = true;
          return `${punct}\n${bullet}`;
        }
        return _;
      }
    );

    return { text: result, repaired };
  }

  /**
   * Run all repairs on text
   */
  repair(text: string): { text: string; repairs: string[] } {
    const repairs: string[] = [];
    let result = text;

    // 1. Numeric truncation repair
    const numericResult = this.repairNumericTruncation(result);
    if (numericResult.repaired) {
      result = numericResult.text;
      repairs.push('NUMERIC_TRUNCATION_FIXED');
    }

    // 2. Broken bullets repair
    const bulletResult = this.repairBrokenBullets(result);
    if (bulletResult.repaired) {
      result = bulletResult.text;
      repairs.push('BROKEN_BULLETS_FIXED');
    }

    // 3. Strip markers (always run)
    result = this.stripMarkers(result);

    return { text: result, repairs };
  }

  /**
   * Get minimum requirements for an operator
   */
  private getOperatorMinimums(operator: string): { minChars: number; minSentences: number } | null {
    // FIX: Lowered minimums to allow valid short answers (ChatGPT-like behavior)
    // Short factual answers like "Total revenue is $1,200,000." should pass
    const defaults: Record<string, { minChars: number; minSentences: number }> = {
      summarize: { minChars: 200, minSentences: 3 },
      extract: { minChars: 20, minSentences: 1 },   // was 80 - too strict for factual answers
      compare: { minChars: 60, minSentences: 1 },   // was 80
      compute: { minChars: 20, minSentences: 1 },   // was 60 - numeric answers can be short
      explain: { minChars: 120, minSentences: 2 },  // was 150/3
      locate_content: { minChars: 20, minSentences: 1 }, // was 40
      qa: { minChars: 20, minSentences: 1 },        // was 40
      file_actions: { minChars: 0, minSentences: 0 },
    };

    // Try policy first, then defaults
    if (this.policy?.defaults?.operatorMinimums?.[operator]) {
      return this.policy.defaults.operatorMinimums[operator];
    }

    return defaults[operator] || null;
  }

  /**
   * Validate exact-count constraints from user request
   */
  private validateExactCounts(
    content: string,
    constraints: { exactBullets?: number; exactNumberedItems?: number; exactSentences?: number }
  ): { passed: boolean; reason?: string } {
    // Count bullets
    if (constraints.exactBullets !== undefined) {
      const bullets = (content.match(PATTERNS.bulletItem) || []).length;
      if (bullets !== constraints.exactBullets) {
        return {
          passed: false,
          reason: `Expected ${constraints.exactBullets} bullets, got ${bullets}`,
        };
      }
    }

    // Count numbered items
    if (constraints.exactNumberedItems !== undefined) {
      const numbered = (content.match(PATTERNS.numberedItem) || []).length;
      if (numbered !== constraints.exactNumberedItems) {
        return {
          passed: false,
          reason: `Expected ${constraints.exactNumberedItems} numbered items, got ${numbered}`,
        };
      }
    }

    // Count sentences (approximate)
    if (constraints.exactSentences !== undefined) {
      // Remove code blocks before counting
      const textOnly = content.replace(/```[\s\S]*?```/g, '');
      const sentences = (textOnly.match(/[.!?]+/g) || []).length;
      // Allow ±1 tolerance for sentence counting
      if (Math.abs(sentences - constraints.exactSentences) > 1) {
        return {
          passed: false,
          reason: `Expected ${constraints.exactSentences} sentences, got ${sentences}`,
        };
      }
    }

    return { passed: true };
  }
}

// Singleton
let gateInstance: FinalAnswerGateService | null = null;

export function getFinalAnswerGate(): FinalAnswerGateService {
  if (!gateInstance) {
    gateInstance = new FinalAnswerGateService();
  }
  return gateInstance;
}

export default FinalAnswerGateService;
