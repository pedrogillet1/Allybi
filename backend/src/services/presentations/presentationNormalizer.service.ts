/**
 * Presentation Normalizer Service
 *
 * Normalizes LLM output into consistent presentation formats:
 * - Bullets (• prefix, consistent spacing)
 * - Numbered lists (1. 2. 3. format)
 * - Tables (proper markdown alignment)
 * - Paragraphs (proper sentence breaks)
 *
 * Usage:
 * ```typescript
 * const normalizer = getPresentationNormalizer();
 * const normalized = normalizer.normalize(text, 'bullets');
 * ```
 */

export type PresentationFormat =
  | 'bullets'
  | 'numbered'
  | 'table'
  | 'paragraph'
  | 'direct'
  | 'code'
  | 'mixed';

export interface NormalizationOptions {
  language?: 'en' | 'pt';
  maxBullets?: number;
  maxSentences?: number;
  preserveMarkdown?: boolean;
  stripPreamble?: boolean;
}

export interface NormalizationResult {
  text: string;
  format: PresentationFormat;
  bulletCount?: number;
  sentenceCount?: number;
  tableRows?: number;
  modified: boolean;
}

// ============================================================================
// Service
// ============================================================================

export class PresentationNormalizerService {
  private readonly bulletPrefixes = ['•', '-', '*', '→', '▸', '▹', '‣'];
  private readonly numberedPatterns = [
    /^(\d+)\.\s/,
    /^(\d+)\)\s/,
    /^\((\d+)\)\s/,
  ];

  /**
   * Detect the presentation format of text
   */
  public detectFormat(text: string): PresentationFormat {
    const lines = text.trim().split('\n').filter(l => l.trim());

    if (lines.length === 0) return 'direct';

    // Check for table
    if (this.isTable(text)) return 'table';

    // Check for code block
    if (text.includes('```')) return 'code';

    // Check for bullets
    let bulletCount = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (this.isBulletLine(trimmed)) bulletCount++;
    }
    if (bulletCount >= lines.length * 0.6) return 'bullets';

    // Check for numbered list
    let numberedCount = 0;
    for (const line of lines) {
      if (this.isNumberedLine(line.trim())) numberedCount++;
    }
    if (numberedCount >= lines.length * 0.6) return 'numbered';

    // Check for paragraph (multiple sentences)
    const sentenceCount = (text.match(/[.!?]+/g) || []).length;
    if (sentenceCount >= 2 && lines.length <= 3) return 'paragraph';

    // Mixed content
    if (bulletCount > 0 || numberedCount > 0) return 'mixed';

    return 'direct';
  }

  /**
   * Check if line is a bullet point
   */
  private isBulletLine(line: string): boolean {
    for (const prefix of this.bulletPrefixes) {
      if (line.startsWith(prefix + ' ') || line.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if line is numbered
   */
  private isNumberedLine(line: string): boolean {
    return this.numberedPatterns.some(p => p.test(line));
  }

  /**
   * Check if text is a markdown table
   */
  private isTable(text: string): boolean {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return false;

    // Check for pipe characters and separator row
    let hasPipes = false;
    let hasSeparator = false;

    for (const line of lines) {
      if (line.includes('|')) hasPipes = true;
      if (/^\|?[\s\-:|]+\|?$/.test(line.trim())) hasSeparator = true;
    }

    return hasPipes && hasSeparator;
  }

  /**
   * Normalize text to specified format
   */
  public normalize(
    text: string,
    targetFormat: PresentationFormat,
    options: NormalizationOptions = {}
  ): NormalizationResult {
    const originalFormat = this.detectFormat(text);
    let result = text.trim();
    let modified = false;

    switch (targetFormat) {
      case 'bullets':
        result = this.normalizeToBullets(text, options);
        modified = result !== text.trim();
        break;

      case 'numbered':
        result = this.normalizeToNumbered(text, options);
        modified = result !== text.trim();
        break;

      case 'table':
        result = this.normalizeTable(text);
        modified = result !== text.trim();
        break;

      case 'paragraph':
        result = this.normalizeToParagraph(text, options);
        modified = result !== text.trim();
        break;

      case 'direct':
        result = this.normalizeDirect(text);
        modified = result !== text.trim();
        break;

      default:
        // Keep as-is for mixed/code
        break;
    }

    return {
      text: result,
      format: targetFormat,
      bulletCount: this.countBullets(result),
      sentenceCount: this.countSentences(result),
      tableRows: this.countTableRows(result),
      modified,
    };
  }

  /**
   * Normalize to bullet format
   */
  private normalizeToBullets(text: string, options: NormalizationOptions): string {
    const lines = text.trim().split('\n').filter(l => l.trim());
    const bullets: string[] = [];

    for (const line of lines) {
      let content = line.trim();

      // Remove existing bullet/number prefix
      for (const prefix of this.bulletPrefixes) {
        if (content.startsWith(prefix + ' ')) {
          content = content.slice(prefix.length + 1).trim();
          break;
        } else if (content.startsWith(prefix)) {
          content = content.slice(prefix.length).trim();
          break;
        }
      }

      // Remove numbered prefix
      for (const pattern of this.numberedPatterns) {
        content = content.replace(pattern, '');
      }

      // Skip empty or very short lines
      if (content.length < 3) continue;

      // Capitalize first letter
      content = content.charAt(0).toUpperCase() + content.slice(1);

      bullets.push(`• ${content}`);
    }

    // Apply max bullets limit
    if (options.maxBullets && bullets.length > options.maxBullets) {
      bullets.length = options.maxBullets;
    }

    return bullets.join('\n');
  }

  /**
   * Normalize to numbered list format
   */
  private normalizeToNumbered(text: string, options: NormalizationOptions): string {
    const lines = text.trim().split('\n').filter(l => l.trim());
    const numbered: string[] = [];
    let num = 1;

    for (const line of lines) {
      let content = line.trim();

      // Remove existing bullet/number prefix
      for (const prefix of this.bulletPrefixes) {
        if (content.startsWith(prefix + ' ')) {
          content = content.slice(prefix.length + 1).trim();
          break;
        }
      }

      for (const pattern of this.numberedPatterns) {
        content = content.replace(pattern, '');
      }

      // Skip empty lines
      if (content.length < 3) continue;

      // Capitalize first letter
      content = content.charAt(0).toUpperCase() + content.slice(1);

      numbered.push(`${num}. ${content}`);
      num++;
    }

    return numbered.join('\n');
  }

  /**
   * Normalize table formatting
   */
  private normalizeTable(text: string): string {
    const lines = text.trim().split('\n');
    const normalizedLines: string[] = [];

    for (const line of lines) {
      if (!line.includes('|')) {
        normalizedLines.push(line);
        continue;
      }

      // Ensure proper pipe formatting
      let normalized = line.trim();

      // Add leading/trailing pipes if missing
      if (!normalized.startsWith('|')) normalized = '| ' + normalized;
      if (!normalized.endsWith('|')) normalized = normalized + ' |';

      // Normalize spacing around pipes
      normalized = normalized.replace(/\s*\|\s*/g, ' | ').trim();

      normalizedLines.push(normalized);
    }

    return normalizedLines.join('\n');
  }

  /**
   * Normalize to paragraph format
   */
  private normalizeToParagraph(text: string, options: NormalizationOptions): string {
    // Remove bullet prefixes and join into paragraph
    let content = text;

    // Remove bullet prefixes
    for (const prefix of this.bulletPrefixes) {
      content = content.replace(new RegExp(`^\\${prefix}\\s*`, 'gm'), '');
    }

    // Remove numbered prefixes
    content = content.replace(/^\d+[.)]\s*/gm, '');

    // Join lines
    content = content
      .split('\n')
      .map(l => l.trim())
      .filter(l => l)
      .join(' ');

    // Normalize spacing
    content = content.replace(/\s+/g, ' ').trim();

    // Ensure proper sentence endings
    if (content && !content.match(/[.!?]$/)) {
      content += '.';
    }

    return content;
  }

  /**
   * Normalize direct answer format
   */
  private normalizeDirect(text: string): string {
    // Single line, no bullets or formatting
    let content = text.trim();

    // Remove bullet prefixes
    for (const prefix of this.bulletPrefixes) {
      if (content.startsWith(prefix + ' ')) {
        content = content.slice(prefix.length + 1);
        break;
      }
    }

    // Remove numbered prefix
    for (const pattern of this.numberedPatterns) {
      content = content.replace(pattern, '');
    }

    // Capitalize first letter
    content = content.charAt(0).toUpperCase() + content.slice(1);

    return content.trim();
  }

  /**
   * Count bullets in text
   */
  private countBullets(text: string): number {
    let count = 0;
    const lines = text.split('\n');

    for (const line of lines) {
      if (this.isBulletLine(line.trim())) count++;
    }

    return count;
  }

  /**
   * Count sentences in text
   */
  private countSentences(text: string): number {
    return (text.match(/[.!?]+/g) || []).length;
  }

  /**
   * Count table rows
   */
  private countTableRows(text: string): number {
    if (!this.isTable(text)) return 0;

    const lines = text.split('\n').filter(l => l.includes('|'));
    // Subtract header and separator
    return Math.max(0, lines.length - 2);
  }

  /**
   * Enforce bullet count constraint
   */
  public enforceBulletCount(text: string, count: number): string {
    const lines = text.split('\n').filter(l => l.trim());
    const bullets: string[] = [];

    for (const line of lines) {
      if (this.isBulletLine(line.trim())) {
        bullets.push(line);
      }
    }

    // If we have more bullets than requested, truncate
    if (bullets.length > count) {
      return bullets.slice(0, count).join('\n');
    }

    // If we have fewer, keep as-is (can't generate more)
    return bullets.join('\n');
  }

  /**
   * Enforce sentence count constraint
   */
  public enforceSentenceCount(text: string, maxSentences: number): string {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];

    if (sentences.length <= maxSentences) {
      return text;
    }

    return sentences.slice(0, maxSentences).join(' ').trim();
  }

  /**
   * Clean up inconsistent formatting
   */
  public cleanup(text: string): string {
    let result = text;

    // Normalize multiple newlines
    result = result.replace(/\n{3,}/g, '\n\n');

    // Normalize bullet spacing
    result = result.replace(/^([•\-\*])\s*/gm, '• ');

    // Normalize numbered list spacing
    result = result.replace(/^(\d+)\.\s*/gm, '$1. ');

    // Remove trailing whitespace
    result = result.replace(/[ \t]+$/gm, '');

    // Ensure single newline at end
    result = result.trim() + '\n';

    return result.trim();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: PresentationNormalizerService | null = null;

export function getPresentationNormalizer(): PresentationNormalizerService {
  if (!instance) {
    instance = new PresentationNormalizerService();
  }
  return instance;
}

export default PresentationNormalizerService;
