/**
 * OCR Cleanup Service - BANK-DRIVEN
 *
 * Cleans OCR-extracted text to fix common artifacts and improve quality.
 * ChatGPT-like: enables better extraction from scanned documents.
 *
 * BANK-DRIVEN: All patterns loaded from JSON data banks at runtime.
 * - ocr_cleanup.any.json: Character replacements, text normalization rules
 * - layout_signals.any.json: Layout zone detection (MRZ, tables, headers)
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// INTERFACES
// ============================================================================

export interface OcrCleanupResult {
  text: string;                  // Cleaned text
  originalLength: number;        // Original text length
  cleanedLength: number;         // Cleaned text length
  changesApplied: number;        // Number of changes made
  confidence: number;            // Confidence in the cleanup
  detectedZones?: LayoutZone[];  // Detected layout zones
}

export interface LayoutZone {
  type: string;          // 'mrz', 'table', 'header', 'body'
  start: number;         // Start position in text
  end: number;           // End position in text
  confidence: number;    // Detection confidence
}

// Bank data structures
interface OcrCleanupBank {
  _meta: { id: string; version: string };
  characterReplacements: {
    numericContext: Array<{ from: string; to: string }>;
    wordContext: Array<{ from: string; to: string }>;
    global: Array<{ from: string; to: string; when?: string }>;
  };
  textNormalization: {
    mergeHyphenatedLineBreaks: boolean;
    collapseMultipleSpaces: boolean;
    collapseMultipleNewlines: boolean;
    stripRepeatedHeaders: boolean;
    fixBrokenAccents: boolean;
    accentPatterns?: Array<{ from: string; to: string }>;
  };
  lineProcessing: {
    minLineLength: number;
    stripPageNumbers: boolean;
    pageNumberPatterns: string[];
    stripHeadersFooters: boolean;
    headerFooterMaxLines: number;
  };
  languageSpecific?: Record<string, {
    accentRestoration?: Array<{ pattern: string; replace: string }>;
  }>;
  confidenceThresholds: {
    applyCharacterReplacements: number;
    applyWordReplacements: number;
  };
}

interface LayoutSignalsBank {
  _meta: { id: string; version: string };
  zones: Record<string, {
    patterns: string[];
    minLength?: number;
    maxLength?: number;
    confidence: number;
  }>;
  tableDetection?: {
    columnSeparators: string[];
    rowSeparators: string[];
    minColumns: number;
  };
}

// ============================================================================
// OCR CLEANUP SERVICE
// ============================================================================

export class OcrCleanupService {
  private logger: Pick<Console, 'info' | 'warn' | 'debug'>;
  private banksPath: string;

  // Loaded banks
  private cleanupBank: OcrCleanupBank | null = null;
  private layoutBank: LayoutSignalsBank | null = null;

  // Compiled patterns
  private pageNumberPatterns: RegExp[] = [];
  private zonePatterns: Map<string, RegExp[]> = new Map();

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
      this.cleanupBank = this.loadBank<OcrCleanupBank>('ocr/ocr_cleanup.any.json');
      this.layoutBank = this.loadBank<LayoutSignalsBank>('ocr/layout_signals.any.json');

      // Compile patterns
      this.compilePatterns();

      this.logger.debug?.('[OcrCleanup] Banks loaded successfully');
    } catch (error) {
      this.logger.warn?.('[OcrCleanup] Failed to load banks:', error);
    }
  }

  private loadBank<T>(relativePath: string): T | null {
    try {
      const fullPath = path.join(this.banksPath, relativePath);
      if (!fs.existsSync(fullPath)) {
        this.logger.debug?.(`[OcrCleanup] Bank not found: ${relativePath}`);
        return null;
      }
      const content = fs.readFileSync(fullPath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (error) {
      this.logger.warn?.(`[OcrCleanup] Error loading bank ${relativePath}:`, error);
      return null;
    }
  }

  private compilePatterns(): void {
    // Compile page number patterns
    if (this.cleanupBank?.lineProcessing?.pageNumberPatterns) {
      for (const pattern of this.cleanupBank.lineProcessing.pageNumberPatterns) {
        try {
          this.pageNumberPatterns.push(new RegExp(pattern, 'i'));
        } catch (e) {
          this.logger.warn?.(`[OcrCleanup] Invalid page number pattern: ${pattern}`);
        }
      }
    }

    // Compile zone patterns
    if (this.layoutBank?.zones) {
      for (const [zoneType, config] of Object.entries(this.layoutBank.zones)) {
        const patterns: RegExp[] = [];
        for (const pattern of config.patterns) {
          try {
            patterns.push(new RegExp(pattern, 'gim'));
          } catch (e) {
            this.logger.warn?.(`[OcrCleanup] Invalid zone pattern for ${zoneType}: ${pattern}`);
          }
        }
        this.zonePatterns.set(zoneType, patterns);
      }
    }
  }

  // ==========================================================================
  // MAIN CLEANUP
  // ==========================================================================

  /**
   * Clean OCR-extracted text
   * ChatGPT-like: fixes common OCR artifacts for better extraction
   */
  cleanup(text: string, options?: {
    language?: string;
    ocrConfidence?: number;
    detectZones?: boolean;
  }): OcrCleanupResult {
    const originalLength = text.length;
    let cleaned = text;
    let changesApplied = 0;

    const ocrConfidence = options?.ocrConfidence ?? 1.0;
    const language = options?.language;

    // Detect layout zones first (if requested)
    let detectedZones: LayoutZone[] | undefined;
    if (options?.detectZones) {
      detectedZones = this.detectLayoutZones(text);
    }

    // Apply text normalization
    if (this.cleanupBank?.textNormalization) {
      const norm = this.cleanupBank.textNormalization;

      // Merge hyphenated line breaks (e.g., "docu-\nment" -> "document")
      if (norm.mergeHyphenatedLineBreaks) {
        const before = cleaned;
        cleaned = cleaned.replace(/(\w)-\n(\w)/g, '$1$2');
        if (cleaned !== before) changesApplied++;
      }

      // Collapse multiple spaces
      if (norm.collapseMultipleSpaces) {
        const before = cleaned;
        cleaned = cleaned.replace(/ {2,}/g, ' ');
        if (cleaned !== before) changesApplied++;
      }

      // Collapse multiple newlines
      if (norm.collapseMultipleNewlines) {
        const before = cleaned;
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
        if (cleaned !== before) changesApplied++;
      }

      // Fix broken accents
      if (norm.fixBrokenAccents && norm.accentPatterns) {
        for (const pattern of norm.accentPatterns) {
          const before = cleaned;
          cleaned = cleaned.split(pattern.from).join(pattern.to);
          if (cleaned !== before) changesApplied++;
        }
      }
    }

    // Apply character replacements based on confidence
    if (this.cleanupBank?.characterReplacements) {
      const thresholds = this.cleanupBank.confidenceThresholds;

      // Numeric context replacements (O -> 0 in numbers)
      if (ocrConfidence <= thresholds.applyCharacterReplacements) {
        cleaned = this.applyNumericContextReplacements(cleaned);
        changesApplied++;
      }

      // Word context replacements (rn -> m)
      if (ocrConfidence <= thresholds.applyWordReplacements) {
        cleaned = this.applyWordContextReplacements(cleaned);
        changesApplied++;
      }
    }

    // Line processing
    if (this.cleanupBank?.lineProcessing) {
      cleaned = this.processLines(cleaned);
    }

    // Language-specific cleanup
    if (language && this.cleanupBank?.languageSpecific?.[language]) {
      cleaned = this.applyLanguageSpecificCleanup(cleaned, language);
      changesApplied++;
    }

    return {
      text: cleaned,
      originalLength,
      cleanedLength: cleaned.length,
      changesApplied,
      confidence: this.calculateCleanupConfidence(originalLength, cleaned.length, changesApplied),
      detectedZones,
    };
  }

  // ==========================================================================
  // CHARACTER REPLACEMENTS
  // ==========================================================================

  /**
   * Apply character replacements in numeric context
   * E.g., "O123" -> "0123", "1O5" -> "105"
   */
  private applyNumericContextReplacements(text: string): string {
    if (!this.cleanupBank?.characterReplacements?.numericContext) {
      return text;
    }

    let result = text;

    // Find number-like sequences and apply replacements
    const numberPattern = /\b[\dOolISBZ]+\b/g;
    result = result.replace(numberPattern, (match) => {
      // Only replace if it looks like a number (has at least one digit)
      if (!/\d/.test(match)) return match;

      let cleaned = match;
      for (const rep of this.cleanupBank!.characterReplacements.numericContext) {
        cleaned = cleaned.split(rep.from).join(rep.to);
      }
      return cleaned;
    });

    return result;
  }

  /**
   * Apply word context replacements
   * E.g., "rn" -> "m" (common OCR error)
   */
  private applyWordContextReplacements(text: string): string {
    if (!this.cleanupBank?.characterReplacements?.wordContext) {
      return text;
    }

    let result = text;

    for (const rep of this.cleanupBank.characterReplacements.wordContext) {
      // Only replace within words (not crossing word boundaries)
      const pattern = new RegExp(`\\b(\\w*?)${rep.from}(\\w*?)\\b`, 'gi');
      result = result.replace(pattern, `$1${rep.to}$2`);
    }

    return result;
  }

  // ==========================================================================
  // LINE PROCESSING
  // ==========================================================================

  /**
   * Process text line by line
   */
  private processLines(text: string): string {
    const config = this.cleanupBank?.lineProcessing;
    if (!config) return text;

    const lines = text.split('\n');
    const filtered: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip short lines
      if (line.length < config.minLineLength) {
        continue;
      }

      // Strip page numbers
      if (config.stripPageNumbers && this.isPageNumber(line)) {
        continue;
      }

      // Strip headers/footers (first/last N lines that repeat)
      if (config.stripHeadersFooters) {
        // Simple heuristic: skip lines that look like headers/footers
        // (could be enhanced with repeated pattern detection)
        if (i < config.headerFooterMaxLines || i >= lines.length - config.headerFooterMaxLines) {
          if (this.looksLikeHeaderFooter(line)) {
            continue;
          }
        }
      }

      filtered.push(line);
    }

    return filtered.join('\n');
  }

  /**
   * Check if a line is a page number
   */
  private isPageNumber(line: string): boolean {
    for (const pattern of this.pageNumberPatterns) {
      if (pattern.test(line)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a line looks like a header/footer
   */
  private looksLikeHeaderFooter(line: string): boolean {
    // Common header/footer patterns
    const patterns = [
      /^[A-Z][a-z]+ \d{4}$/,  // "January 2024"
      /^Confidential$/i,
      /^Draft$/i,
      /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,  // Date
    ];

    return patterns.some(p => p.test(line));
  }

  // ==========================================================================
  // LANGUAGE-SPECIFIC CLEANUP
  // ==========================================================================

  /**
   * Apply language-specific cleanup rules
   */
  private applyLanguageSpecificCleanup(text: string, language: string): string {
    const langConfig = this.cleanupBank?.languageSpecific?.[language];
    if (!langConfig) return text;

    let result = text;

    // Apply accent restoration
    if (langConfig.accentRestoration) {
      for (const rule of langConfig.accentRestoration) {
        try {
          const regex = new RegExp(rule.pattern, 'gi');
          result = result.replace(regex, rule.replace);
        } catch (e) {
          // Invalid pattern, skip
        }
      }
    }

    return result;
  }

  // ==========================================================================
  // LAYOUT ZONE DETECTION
  // ==========================================================================

  /**
   * Detect layout zones in text (MRZ, tables, headers, etc.)
   */
  detectLayoutZones(text: string): LayoutZone[] {
    const zones: LayoutZone[] = [];

    if (!this.layoutBank?.zones) return zones;

    for (const [zoneType, config] of Object.entries(this.layoutBank.zones)) {
      const patterns = this.zonePatterns.get(zoneType) || [];

      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(text)) !== null) {
          const start = match.index;
          const end = match.index + match[0].length;

          // Check length constraints
          const length = end - start;
          if (config.minLength && length < config.minLength) continue;
          if (config.maxLength && length > config.maxLength) continue;

          zones.push({
            type: zoneType,
            start,
            end,
            confidence: config.confidence,
          });
        }
      }
    }

    // Sort by start position
    zones.sort((a, b) => a.start - b.start);

    return zones;
  }

  /**
   * Extract text from a specific zone
   */
  extractZone(text: string, zone: LayoutZone): string {
    return text.slice(zone.start, zone.end);
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Calculate cleanup confidence based on changes
   */
  private calculateCleanupConfidence(
    originalLength: number,
    cleanedLength: number,
    changesApplied: number
  ): number {
    // If no changes, high confidence
    if (changesApplied === 0) return 1.0;

    // If too many changes, lower confidence
    const changeRatio = Math.abs(originalLength - cleanedLength) / originalLength;
    if (changeRatio > 0.3) return 0.5;
    if (changeRatio > 0.1) return 0.7;

    return 0.9;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: OcrCleanupService | null = null;

export function getOcrCleanup(): OcrCleanupService {
  if (!instance) {
    instance = new OcrCleanupService();
  }
  return instance;
}

export default OcrCleanupService;
