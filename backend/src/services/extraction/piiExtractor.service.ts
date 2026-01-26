/**
 * PII Extractor Service - BANK-DRIVEN
 *
 * Extracts personally identifiable information (PII) from document text.
 * ChatGPT-like: enables "ask anything from personal docs" capability.
 *
 * BANK-DRIVEN: All patterns loaded from JSON data banks at runtime.
 * - pii_patterns.any.json: Regex patterns for each field type
 * - pii_field_labels.any.json: Field label dictionaries (multilingual)
 * - pii_normalization.any.json: Field name aliases
 * - pii_validation.any.json: Checksum validation rules
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// INTERFACES
// ============================================================================

export interface ExtractedPiiField {
  fieldType: string;         // e.g., 'cpf', 'rg', 'passport_number'
  value: string;             // The extracted value
  confidence: number;        // 0-1 confidence score
  labelFound?: string;       // Nearby label that was detected
  position?: {               // Position in text (if available)
    start: number;
    end: number;
  };
  validated?: boolean;       // True if passed checksum validation
  normalizedValue?: string;  // Cleaned/formatted value
}

export interface PiiExtractionResult {
  fields: ExtractedPiiField[];
  documentType?: string;     // Detected doc type (passport, id_card, etc.)
  language?: string;         // Detected language
  confidence: number;        // Overall extraction confidence
}

// Bank data structures
interface PiiPatternsBank {
  _meta: { id: string; version: string };
  patterns: Record<string, {
    regex: string[];
    confidence: number;
    requireLabelNearby?: boolean;
    labelWindowChars?: number;
  }>;
}

interface PiiFieldLabelsBank {
  _meta: { id: string; version: string };
  fields: Record<string, {
    en: string[];
    pt: string[];
    es: string[];
  }>;
}

interface PiiNormalizationBank {
  _meta: { id: string; version: string };
  aliases: Record<string, string[]>;
  normalizers?: Record<string, {
    removeChars?: string[];
    format?: string;
  }>;
}

interface PiiValidationBank {
  _meta: { id: string; version: string };
  validators: Record<string, {
    algorithm?: string;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    checksum?: string;
  }>;
}

// ============================================================================
// PII EXTRACTOR SERVICE
// ============================================================================

export class PiiExtractorService {
  private logger: Pick<Console, 'info' | 'warn' | 'debug'>;
  private banksPath: string;

  // Loaded banks
  private patternsBank: PiiPatternsBank | null = null;
  private fieldLabelsBank: PiiFieldLabelsBank | null = null;
  private normalizationBank: PiiNormalizationBank | null = null;
  private validationBank: PiiValidationBank | null = null;

  // Compiled regex cache
  private compiledPatterns: Map<string, RegExp[]> = new Map();
  private compiledLabels: Map<string, RegExp> = new Map();

  constructor(config?: { logger?: Pick<Console, 'info' | 'warn' | 'debug'>; banksPath?: string }) {
    this.logger = config?.logger || console;
    this.banksPath = config?.banksPath || path.join(__dirname, '../../data_banks');
    this.loadBanks();
  }

  // ==========================================================================
  // BANK LOADING
  // ==========================================================================

  private loadBanks(): void {
    try {
      this.patternsBank = this.loadBank<PiiPatternsBank>('entities/pii_patterns.any.json');
      this.fieldLabelsBank = this.loadBank<PiiFieldLabelsBank>('entities/pii_field_labels.any.json');
      this.normalizationBank = this.loadBank<PiiNormalizationBank>('entities/pii_normalization.any.json');
      this.validationBank = this.loadBank<PiiValidationBank>('entities/pii_validation.any.json');

      // Compile patterns for performance
      this.compilePatterns();
      this.compileLabels();

      this.logger.debug?.('[PiiExtractor] Banks loaded successfully');
    } catch (error) {
      this.logger.warn?.('[PiiExtractor] Failed to load banks:', error);
    }
  }

  private loadBank<T>(relativePath: string): T | null {
    try {
      const fullPath = path.join(this.banksPath, relativePath);
      if (!fs.existsSync(fullPath)) {
        this.logger.debug?.(`[PiiExtractor] Bank not found: ${relativePath}`);
        return null;
      }
      const content = fs.readFileSync(fullPath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (error) {
      this.logger.warn?.(`[PiiExtractor] Error loading bank ${relativePath}:`, error);
      return null;
    }
  }

  private compilePatterns(): void {
    if (!this.patternsBank?.patterns) return;

    for (const [fieldType, config] of Object.entries(this.patternsBank.patterns)) {
      const regexes: RegExp[] = [];
      for (const pattern of config.regex) {
        try {
          regexes.push(new RegExp(pattern, 'gi'));
        } catch (e) {
          this.logger.warn?.(`[PiiExtractor] Invalid regex for ${fieldType}: ${pattern}`);
        }
      }
      this.compiledPatterns.set(fieldType, regexes);
    }
  }

  private compileLabels(): void {
    if (!this.fieldLabelsBank?.fields) return;

    for (const [fieldType, labels] of Object.entries(this.fieldLabelsBank.fields)) {
      // Combine all language labels into one regex
      const allLabels = [
        ...(labels.en || []),
        ...(labels.pt || []),
        ...(labels.es || []),
      ];
      if (allLabels.length > 0) {
        const escapedLabels = allLabels.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        try {
          this.compiledLabels.set(fieldType, new RegExp(`\\b(${escapedLabels.join('|')})\\b`, 'gi'));
        } catch (e) {
          this.logger.warn?.(`[PiiExtractor] Failed to compile labels for ${fieldType}`);
        }
      }
    }
  }

  // ==========================================================================
  // EXTRACTION
  // ==========================================================================

  /**
   * Extract PII fields from text
   * ChatGPT-like: extracts all recognizable PII fields
   */
  extract(text: string, language?: string): PiiExtractionResult {
    const fields: ExtractedPiiField[] = [];

    if (!this.patternsBank?.patterns) {
      return { fields, confidence: 0 };
    }

    const textLower = text.toLowerCase();

    for (const [fieldType, config] of Object.entries(this.patternsBank.patterns)) {
      const patterns = this.compiledPatterns.get(fieldType) || [];
      const labelRegex = this.compiledLabels.get(fieldType);

      for (const regex of patterns) {
        // Reset regex state
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(text)) !== null) {
          const value = match[0];
          const position = { start: match.index, end: match.index + value.length };

          // Check if label is required nearby
          let labelFound: string | undefined;
          if (config.requireLabelNearby && labelRegex) {
            const windowSize = config.labelWindowChars || 50;
            const windowStart = Math.max(0, position.start - windowSize);
            const windowEnd = Math.min(text.length, position.end + windowSize);
            const window = text.slice(windowStart, windowEnd);

            labelRegex.lastIndex = 0;
            const labelMatch = labelRegex.exec(window);
            if (!labelMatch) {
              // Skip this match - no label nearby
              continue;
            }
            labelFound = labelMatch[1];
          }

          // Calculate confidence
          let confidence = config.confidence || 0.5;

          // Boost confidence if label found
          if (labelFound) {
            confidence = Math.min(confidence + 0.15, 1.0);
          }

          // Validate if validator exists
          let validated: boolean | undefined;
          let normalizedValue: string | undefined;
          if (this.validationBank?.validators[fieldType]) {
            const validatorResult = this.validate(fieldType, value);
            validated = validatorResult.valid;
            if (!validated) {
              confidence *= 0.7; // Reduce confidence for invalid values
            }
          }

          // Normalize value
          normalizedValue = this.normalize(fieldType, value);

          fields.push({
            fieldType,
            value,
            confidence,
            labelFound,
            position,
            validated,
            normalizedValue,
          });
        }
      }
    }

    // Deduplicate overlapping fields (keep highest confidence)
    const deduped = this.deduplicateFields(fields);

    // Calculate overall confidence
    const overallConfidence = deduped.length > 0
      ? deduped.reduce((sum, f) => sum + f.confidence, 0) / deduped.length
      : 0;

    return {
      fields: deduped,
      language,
      confidence: overallConfidence,
    };
  }

  /**
   * Extract specific field type from text
   */
  extractField(text: string, fieldType: string): ExtractedPiiField[] {
    const result = this.extract(text);
    return result.fields.filter(f => f.fieldType === fieldType);
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  /**
   * Validate a PII field value using bank-defined rules
   */
  validate(fieldType: string, value: string): { valid: boolean; reason?: string } {
    const validator = this.validationBank?.validators[fieldType];
    if (!validator) {
      return { valid: true }; // No validator = assume valid
    }

    // Length checks
    if (validator.minLength && value.length < validator.minLength) {
      return { valid: false, reason: 'Too short' };
    }
    if (validator.maxLength && value.length > validator.maxLength) {
      return { valid: false, reason: 'Too long' };
    }

    // Pattern check
    if (validator.pattern) {
      try {
        const regex = new RegExp(validator.pattern);
        if (!regex.test(value)) {
          return { valid: false, reason: 'Pattern mismatch' };
        }
      } catch (e) {
        // Invalid pattern, skip check
      }
    }

    // Checksum validation
    if (validator.checksum) {
      const isValid = this.validateChecksum(fieldType, value, validator.checksum);
      if (!isValid) {
        return { valid: false, reason: 'Checksum failed' };
      }
    }

    return { valid: true };
  }

  /**
   * Validate checksum for specific algorithms
   */
  private validateChecksum(fieldType: string, value: string, algorithm: string): boolean {
    const digits = value.replace(/\D/g, '');

    switch (algorithm) {
      case 'cpf_mod11':
        return this.validateCpf(digits);
      case 'cnpj_mod11':
        return this.validateCnpj(digits);
      case 'luhn':
        return this.validateLuhn(digits);
      default:
        return true; // Unknown algorithm, assume valid
    }
  }

  /**
   * Brazilian CPF validation (mod 11)
   */
  private validateCpf(digits: string): boolean {
    if (digits.length !== 11) return false;
    if (/^(\d)\1+$/.test(digits)) return false; // All same digit

    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(digits[i]) * (10 - i);
    }
    let check1 = 11 - (sum % 11);
    if (check1 >= 10) check1 = 0;
    if (check1 !== parseInt(digits[9])) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(digits[i]) * (11 - i);
    }
    let check2 = 11 - (sum % 11);
    if (check2 >= 10) check2 = 0;
    return check2 === parseInt(digits[10]);
  }

  /**
   * Brazilian CNPJ validation (mod 11)
   */
  private validateCnpj(digits: string): boolean {
    if (digits.length !== 14) return false;
    if (/^(\d)\1+$/.test(digits)) return false;

    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(digits[i]) * weights1[i];
    }
    let check1 = 11 - (sum % 11);
    if (check1 >= 10) check1 = 0;
    if (check1 !== parseInt(digits[12])) return false;

    sum = 0;
    for (let i = 0; i < 13; i++) {
      sum += parseInt(digits[i]) * weights2[i];
    }
    let check2 = 11 - (sum % 11);
    if (check2 >= 10) check2 = 0;
    return check2 === parseInt(digits[13]);
  }

  /**
   * Luhn algorithm (credit cards, etc.)
   */
  private validateLuhn(digits: string): boolean {
    let sum = 0;
    let alternate = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = parseInt(digits[i]);
      if (alternate) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alternate = !alternate;
    }
    return sum % 10 === 0;
  }

  // ==========================================================================
  // NORMALIZATION
  // ==========================================================================

  /**
   * Normalize a PII field value
   */
  normalize(fieldType: string, value: string): string {
    const normalizer = this.normalizationBank?.normalizers?.[fieldType];
    if (!normalizer) {
      return value;
    }

    let normalized = value;

    // Remove specified characters
    if (normalizer.removeChars) {
      for (const char of normalizer.removeChars) {
        normalized = normalized.split(char).join('');
      }
    }

    // Apply format if specified (e.g., "###.###.###-##" for CPF)
    if (normalizer.format && /^\d+$/.test(normalized)) {
      let formatted = '';
      let digitIndex = 0;
      for (const char of normalizer.format) {
        if (char === '#' && digitIndex < normalized.length) {
          formatted += normalized[digitIndex++];
        } else if (char !== '#') {
          formatted += char;
        }
      }
      normalized = formatted;
    }

    return normalized;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Deduplicate overlapping fields (keep highest confidence)
   */
  private deduplicateFields(fields: ExtractedPiiField[]): ExtractedPiiField[] {
    if (fields.length <= 1) return fields;

    // Sort by confidence descending
    const sorted = [...fields].sort((a, b) => b.confidence - a.confidence);
    const result: ExtractedPiiField[] = [];
    const usedRanges: Array<{ start: number; end: number }> = [];

    for (const field of sorted) {
      if (!field.position) {
        result.push(field);
        continue;
      }

      // Check for overlap with already-selected fields
      const overlaps = usedRanges.some(range =>
        (field.position!.start >= range.start && field.position!.start < range.end) ||
        (field.position!.end > range.start && field.position!.end <= range.end)
      );

      if (!overlaps) {
        result.push(field);
        usedRanges.push(field.position);
      }
    }

    return result;
  }

  /**
   * Get all supported field types
   */
  getSupportedFieldTypes(): string[] {
    return Object.keys(this.patternsBank?.patterns || {});
  }

  /**
   * Get field labels for a specific field type and language
   */
  getFieldLabels(fieldType: string, language: string = 'en'): string[] {
    const labels = this.fieldLabelsBank?.fields[fieldType];
    if (!labels) return [];
    return labels[language as 'en' | 'pt' | 'es'] || labels.en || [];
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: PiiExtractorService | null = null;

export function getPiiExtractor(): PiiExtractorService {
  if (!instance) {
    instance = new PiiExtractorService();
  }
  return instance;
}

export default PiiExtractorService;
