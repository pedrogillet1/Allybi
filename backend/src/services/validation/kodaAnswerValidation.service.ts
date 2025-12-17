/**
 * Koda Answer Validation Service V3
 *
 * Validates answers against policies from validation_policies.json.
 * Ensures answers meet minimum quality requirements before sending to user.
 *
 * Features:
 * - Policy-based validation (min length, citations required, etc.)
 * - Truncation detection
 * - Multilingual support
 * - Severity-based pass/fail
 * - Extensible validation rules
 *
 * Used by: kodaOrchestratorV3.service.ts
 */

import { loadJsonFile } from '../../config/dataPaths';

import type {
  IntentClassificationV3,
  Citation,
} from '../../types/ragV3.types';

// ============================================================================
// TYPES
// ============================================================================

export interface AnswerConfigKeys {
  styleKey: string;
  systemPromptKey: string;
  examplesKey: string;
  validationPolicyKey: string;
}

export interface ValidationPolicy {
  requireCitations?: boolean;
  minLengthTokens?: number;
  maxLengthTokens?: number;
  requireDocuments?: boolean;
  allowTruncated?: boolean;
  severity?: 'info' | 'warning' | 'error';
}

export interface ValidationResult {
  passed: boolean;
  reasons: string[];
  severity: 'info' | 'warning' | 'error';
}

export interface AnswerToValidate {
  text: string;
  citations?: Citation[];
  documentsUsed?: string[];
  wasTruncated?: boolean;
  finishReason?: string;
}

export interface ValidationRequest {
  answer: AnswerToValidate;
  intent: IntentClassificationV3;
  configKeys: AnswerConfigKeys;
}

export interface RepetitionCheckResult {
  isRepetition: boolean;
  similarity: number;
  shortConfirmation?: string;
}

// ============================================================================
// VALIDATION POLICIES JSON TYPE
// ============================================================================

interface ValidationPoliciesJson {
  [key: string]: ValidationPolicy;
}

// ============================================================================
// KODA ANSWER VALIDATION SERVICE
// ============================================================================

export class KodaAnswerValidationService {
  private policies: ValidationPoliciesJson;

  constructor() {
    try {
      this.policies = loadJsonFile<ValidationPoliciesJson>('validation_policies.json');
    } catch (err) {
      console.warn('[KodaAnswerValidation] Failed to load validation_policies.json, using defaults:', (err as Error).message);
      this.policies = this.getDefaultPolicies();
    }
  }

  /**
   * Validate an answer against its policy.
   */
  public validate(req: ValidationRequest): ValidationResult {
    const { answer, intent, configKeys } = req;
    const key = configKeys.validationPolicyKey;
    const policy = this.policies[key] || this.policies['default'] || {};

    const reasons: string[] = [];

    // Rule 1: Check citations requirement
    if (policy.requireCitations && intent.requiresRAG) {
      if (!answer.citations || answer.citations.length === 0) {
        reasons.push('NO_CITATIONS');
      }
    }

    // Rule 2: Check minimum length
    if (policy.minLengthTokens) {
      const tokenCount = this.estimateTokens(answer.text);
      if (tokenCount < policy.minLengthTokens) {
        reasons.push('TOO_SHORT');
      }
    }

    // Rule 3: Check maximum length
    if (policy.maxLengthTokens) {
      const tokenCount = this.estimateTokens(answer.text);
      if (tokenCount > policy.maxLengthTokens) {
        reasons.push('TOO_LONG');
      }
    }

    // Rule 4: Check documents requirement
    if (policy.requireDocuments && intent.requiresRAG) {
      if (!answer.documentsUsed || answer.documentsUsed.length === 0) {
        reasons.push('NO_DOCUMENTS_USED');
      }
    }

    // Rule 5: Check for empty answer
    if (!answer.text || answer.text.trim().length === 0) {
      reasons.push('EMPTY_ANSWER');
    }

    // Rule 6: Check for truncation (NEW)
    if (answer.wasTruncated && !policy.allowTruncated) {
      reasons.push('TRUNCATED');
    }

    return {
      passed: reasons.length === 0,
      reasons,
      severity: reasons.length ? (policy.severity || 'warning') : 'info',
    };
  }

  /**
   * Quick check if answer passes minimum requirements.
   */
  public isValid(req: ValidationRequest): boolean {
    const result = this.validate(req);
    return result.passed || result.severity !== 'error';
  }

  /**
   * Check specifically for truncation.
   */
  public isTruncated(answer: AnswerToValidate): boolean {
    return answer.wasTruncated === true;
  }

  /**
   * Estimate token count from text.
   * Uses simple word-based estimation (avg 1.3 tokens per word).
   */
  private estimateTokens(text: string): number {
    if (!text) return 0;
    const words = text.split(/\s+/).filter(w => w.length > 0);
    return Math.ceil(words.length * 1.3);
  }

  /**
   * Get default policies when JSON is not available.
   */
  private getDefaultPolicies(): ValidationPoliciesJson {
    return {
      default: {
        requireCitations: false,
        minLengthTokens: 5,
        maxLengthTokens: 2000,
        allowTruncated: false,
        severity: 'warning',
      },
      'documents.summary': {
        requireCitations: true,
        minLengthTokens: 20,
        maxLengthTokens: 500,
        allowTruncated: false,
        severity: 'warning',
      },
      'documents.factual': {
        requireCitations: true,
        minLengthTokens: 10,
        maxLengthTokens: 300,
        allowTruncated: false,
        severity: 'warning',
      },
      'documents.compare': {
        requireCitations: true,
        minLengthTokens: 30,
        maxLengthTokens: 800,
        allowTruncated: false,
        severity: 'warning',
      },
      'product.help': {
        requireCitations: false,
        minLengthTokens: 15,
        allowTruncated: true, // Product help can be truncated
        severity: 'info',
      },
      'chitchat': {
        requireCitations: false,
        minLengthTokens: 3,
        allowTruncated: true, // Chitchat can be truncated
        severity: 'info',
      },
    };
  }

  // ============================================================================
  // REPETITION DETECTION
  // ============================================================================

  /**
   * Threshold for considering two answers as "same" (0.9 = 90% similar)
   */
  private readonly REPETITION_THRESHOLD = 0.9;

  /**
   * Check if new answer is a repetition of the previous assistant message.
   * Uses normalized Levenshtein similarity for comparison.
   *
   * @param newAnswer - The new answer to check
   * @param previousAnswer - The previous assistant answer
   * @param language - Language for short confirmation message
   * @returns RepetitionCheckResult with similarity score and optional short confirmation
   */
  public checkRepetition(
    newAnswer: string,
    previousAnswer: string | undefined,
    language: 'en' | 'pt' | 'es' = 'en'
  ): RepetitionCheckResult {
    if (!previousAnswer || !newAnswer) {
      return { isRepetition: false, similarity: 0 };
    }

    // Normalize both texts for comparison
    const normalizedNew = this.normalizeForComparison(newAnswer);
    const normalizedPrev = this.normalizeForComparison(previousAnswer);

    // Quick exact match check (hash comparison)
    if (normalizedNew === normalizedPrev) {
      return {
        isRepetition: true,
        similarity: 1.0,
        shortConfirmation: this.getShortConfirmation(previousAnswer, language),
      };
    }

    // Calculate similarity
    const similarity = this.calculateSimilarity(normalizedNew, normalizedPrev);

    if (similarity >= this.REPETITION_THRESHOLD) {
      return {
        isRepetition: true,
        similarity,
        shortConfirmation: this.getShortConfirmation(previousAnswer, language),
      };
    }

    return { isRepetition: false, similarity };
  }

  /**
   * Normalize text for comparison:
   * - Lowercase
   * - Remove extra whitespace
   * - Remove markdown formatting
   * - Remove citation markers
   */
  private normalizeForComparison(text: string): string {
    return text
      .toLowerCase()
      .replace(/\{\{[^}]+\}\}/g, '') // Remove {{DOC::...}} markers
      .replace(/📚.*$/gm, '') // Remove source lines
      .replace(/\*\*|__|~~|\[|\]|\(|\)|#|>/g, '') // Remove markdown
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate normalized similarity between two strings.
   * Uses Levenshtein distance normalized by max length.
   *
   * @returns Similarity score 0-1 (1 = identical)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (!str1 && !str2) return 1;
    if (!str1 || !str2) return 0;

    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1;

    const distance = this.levenshteinDistance(str1, str2);
    return 1 - (distance / maxLen);
  }

  /**
   * Calculate Levenshtein distance between two strings.
   * Optimized for memory using two-row approach.
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;

    // Quick checks
    if (m === 0) return n;
    if (n === 0) return m;

    // For very long strings, use sampling to avoid O(m*n) complexity
    if (m > 500 || n > 500) {
      return this.approximateLevenshtein(str1, str2);
    }

    // Two-row approach for memory efficiency
    let prevRow = new Array(n + 1);
    let currRow = new Array(n + 1);

    // Initialize first row
    for (let j = 0; j <= n; j++) {
      prevRow[j] = j;
    }

    for (let i = 1; i <= m; i++) {
      currRow[0] = i;

      for (let j = 1; j <= n; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        currRow[j] = Math.min(
          prevRow[j] + 1,      // deletion
          currRow[j - 1] + 1,  // insertion
          prevRow[j - 1] + cost // substitution
        );
      }

      // Swap rows
      [prevRow, currRow] = [currRow, prevRow];
    }

    return prevRow[n];
  }

  /**
   * Approximate Levenshtein for very long strings using sampling.
   */
  private approximateLevenshtein(str1: string, str2: string): number {
    const sampleSize = 200;
    const samples = 5;
    let totalDistance = 0;

    for (let i = 0; i < samples; i++) {
      const start1 = Math.floor((str1.length / samples) * i);
      const start2 = Math.floor((str2.length / samples) * i);
      const sample1 = str1.substr(start1, sampleSize);
      const sample2 = str2.substr(start2, sampleSize);

      // Simple character difference count for samples
      let diff = 0;
      const maxLen = Math.max(sample1.length, sample2.length);
      for (let j = 0; j < maxLen; j++) {
        if (sample1[j] !== sample2[j]) diff++;
      }
      totalDistance += diff;
    }

    // Scale to approximate full string distance
    const avgSampleDist = totalDistance / samples;
    const scaleFactor = Math.max(str1.length, str2.length) / sampleSize;
    return Math.floor(avgSampleDist * scaleFactor);
  }

  /**
   * Generate a short confirmation message when repetition is detected.
   */
  private getShortConfirmation(
    previousAnswer: string,
    language: 'en' | 'pt' | 'es'
  ): string {
    // Extract first meaningful sentence (up to 150 chars)
    const firstSentence = previousAnswer
      .replace(/\n+/g, ' ')
      .replace(/📚.*$/g, '')
      .trim()
      .split(/[.!?]/)
      .filter(s => s.trim().length > 10)[0] || '';

    const snippet = firstSentence.length > 120
      ? firstSentence.substring(0, 120) + '...'
      : firstSentence;

    const confirmations: Record<'en' | 'pt' | 'es', string> = {
      en: `As I mentioned: ${snippet}`,
      pt: `Como mencionei: ${snippet}`,
      es: `Como mencioné: ${snippet}`,
    };

    return confirmations[language] || confirmations.en;
  }
}

export default KodaAnswerValidationService;
