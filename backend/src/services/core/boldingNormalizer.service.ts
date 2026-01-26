/**
 * BOLDING NORMALIZER SERVICE
 *
 * ChatGPT-parity: Deterministic bolding rules.
 * ChatGPT doesn't bold random words - it bolds for scanability.
 *
 * Rules enforced:
 * - Label-value bolding: **Label:** value
 * - Section labels: **Key points**
 * - Never bold inside tables (except headers)
 * - Never bold entire paragraphs
 * - Max bold segments per 1000 chars
 */

import { getBank } from './bankLoader.service';

// ============================================================================
// BANK-LOADED DOMAIN TERMS (for keyword bolding)
// ============================================================================

interface BoldingDomainTermsBank {
  _meta: { id: string; version: string };
  config: { enabled: boolean; minTermLength: number; maxTermLength: number };
  terms: Record<string, string[]>;
}

let domainTermsCache: Set<string> | null = null;

/**
 * Load domain terms from bank for keyword bolding.
 * These short terms (ROI, NPV, etc.) get bolded even if under 5 chars.
 */
function getDomainTerms(): Set<string> {
  if (domainTermsCache) return domainTermsCache;

  const bank = getBank<BoldingDomainTermsBank>('bolding_domain_terms');
  const terms = new Set<string>();

  if (bank?.terms) {
    for (const category of Object.values(bank.terms)) {
      for (const term of category) {
        terms.add(term.toLowerCase());
      }
    }
  }

  domainTermsCache = terms;
  return terms;
}

// ============================================================================
// TYPES
// ============================================================================

export interface BoldingResult {
  text: string;
  repairs: string[];
  warnings: string[];
}

export interface BoldingOptions {
  maxBoldSegmentsPerKChars?: number;
  maxBoldSegmentLength?: number;
  allowBoldInTables?: boolean;
  allowBoldHeaders?: boolean;
}

// ============================================================================
// PATTERNS
// ============================================================================

const PATTERNS = {
  // Bold segments
  boldSegment: /\*\*([^*]+)\*\*/g,

  // Label-value pattern (to preserve): **Label:** value
  labelValue: /\*\*([^*:]+):\*\*\s/g,

  // Section headers (to preserve): **Key points** or **Key points:** at line start
  // FIX #6: Allow trailing colon
  sectionHeader: /^\*\*([^*]+)\*\*:?\s*$/gm,

  // Table row
  tableRow: /^\|.*\|$/gm,
  tableSeparator: /^\|[\s:-]+\|$/,

  // Code blocks (to preserve)
  codeBlock: /```[\s\S]*?```/g,
};

// ============================================================================
// BOLDING NORMALIZER
// ============================================================================

export class BoldingNormalizerService {
  /**
   * Normalize bolding according to ChatGPT-parity rules.
   */
  normalize(text: string, options: BoldingOptions = {}): BoldingResult {
    const {
      maxBoldSegmentsPerKChars = 12,
      maxBoldSegmentLength = 60,
      allowBoldInTables = false,
      allowBoldHeaders = true,
    } = options;

    const repairs: string[] = [];
    const warnings: string[] = [];
    let result = text;

    // Preserve code blocks
    const codeBlocks: string[] = [];
    result = result.replace(PATTERNS.codeBlock, (match) => {
      codeBlocks.push(match);
      return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });

    // 1. Remove bold from table cells (except headers if allowed)
    const beforeTables = result;
    result = this.normalizeBoldInTables(result, allowBoldInTables, allowBoldHeaders);
    if (result !== beforeTables) {
      repairs.push('REMOVED_BOLD_FROM_TABLES');
    }

    // 2. Remove whole-paragraph bold
    const beforeParagraph = result;
    result = this.removeWholeParagraphBold(result);
    if (result !== beforeParagraph) {
      repairs.push('REMOVED_WHOLE_PARAGRAPH_BOLD');
    }

    // 3. Truncate overly long bold segments
    const beforeLength = result;
    result = this.truncateLongBoldSegments(result, maxBoldSegmentLength);
    if (result !== beforeLength) {
      repairs.push('TRUNCATED_LONG_BOLD');
    }

    // FIX #5: Apply label-value bolding BEFORE density check
    const beforeLabel = result;
    result = this.applyLabelValueBolding(result);
    if (result !== beforeLabel) {
      repairs.push('APPLIED_LABEL_VALUE_BOLDING');
    }

    // 4. Check bold density (FIX #4: exclude preserved types)
    const densityResult = this.checkBoldDensity(result, maxBoldSegmentsPerKChars);
    if (!densityResult.passed) {
      warnings.push(`BOLD_TOO_DENSE: ${densityResult.actual} segments per 1000 chars (max ${maxBoldSegmentsPerKChars})`);
      // Optionally reduce bolding (remove non-label bold)
      if (densityResult.actual > maxBoldSegmentsPerKChars * 1.5) {
        result = this.reduceBoldDensity(result);
        repairs.push('REDUCED_BOLD_DENSITY');
      }
    }

    // Restore code blocks
    codeBlocks.forEach((block, i) => {
      result = result.replace(`__CODE_BLOCK_${i}__`, block);
    });

    return { text: result, repairs, warnings };
  }

  /**
   * FIX #2: Remove bold from table cells with correct row handling
   * Row 0 = header, Row 1 = separator, Row 2+ = body
   */
  private normalizeBoldInTables(text: string, allowInCells: boolean, allowHeaders: boolean): string {
    const lines = text.split('\n');
    let tableRowIndex = 0;
    let inTable = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isRow = line.trim().startsWith('|') && line.trim().endsWith('|');

      if (!isRow) {
        inTable = false;
        tableRowIndex = 0;
        continue;
      }

      if (!inTable) {
        inTable = true;
        tableRowIndex = 0;
      }

      // Row 0 = header, Row 1 = separator, Row 2+ = body
      if (tableRowIndex === 0) {
        // Header row
        if (!allowHeaders) {
          lines[i] = this.removeBoldFromLine(line);
        }
      } else if (tableRowIndex === 1) {
        // Separator row – never touch
      } else {
        // Body rows (2+)
        if (!allowInCells) {
          lines[i] = this.removeBoldFromLine(line);
        }
      }

      tableRowIndex++;
    }

    return lines.join('\n');
  }

  /**
   * Remove bold markers from a line
   */
  private removeBoldFromLine(line: string): string {
    return line.replace(/\*\*([^*]+)\*\*/g, '$1');
  }

  /**
   * FIX #1: Remove whole-paragraph bold with proper multi-line detection
   * ChatGPT never bolds entire paragraphs.
   */
  private removeWholeParagraphBold(text: string): string {
    const paragraphs = text.split(/\n{2,}/);

    return paragraphs.map(p => {
      const trimmed = p.trim();

      // Skip short headings like "**Key points**" or "**Key points:**"
      if (PATTERNS.sectionHeader.test(trimmed)) {
        // Reset lastIndex since we're using global flag
        PATTERNS.sectionHeader.lastIndex = 0;
        return p;
      }

      // Whole paragraph wrapped in **...**
      if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
        const inner = trimmed.slice(2, -2).trim();

        // Check for unbalanced bold pairs inside (would indicate nested bold, not whole-paragraph bold)
        const innerBoldCount = (inner.match(/\*\*/g) || []).length;
        if (innerBoldCount > 0 && innerBoldCount % 2 !== 0) {
          // Unbalanced - not a simple whole-paragraph bold
          return p;
        }

        // If it's long (>=80 chars), remove the wrapper bold
        // ChatGPT never bolds entire paragraphs
        if (inner.length >= 80) {
          return inner;
        }
      }

      return p;
    }).join('\n\n');
  }

  /**
   * FIX #3: Truncate overly long bold segments at word boundary
   */
  private truncateLongBoldSegments(text: string, maxLength: number): string {
    return text.replace(PATTERNS.boldSegment, (match, content) => {
      if (content.length <= maxLength) return match;

      const cut = content.slice(0, maxLength);
      // Drop partial last word to avoid breaking mid-word
      const safeCut = cut.replace(/\s+\S*$/, '').trim();

      // If safeCut is empty or too short, just use the original cut
      if (safeCut.length < maxLength / 2) {
        return match; // Don't truncate if it would be too aggressive
      }

      const rest = content.slice(safeCut.length);
      return `**${safeCut}**${rest}`;
    });
  }

  /**
   * FIX #4: Check bold density excluding preserved types (label-value, headers)
   */
  private checkBoldDensity(text: string, maxPerKChars: number): { passed: boolean; actual: number } {
    const all = (text.match(PATTERNS.boldSegment) || []).length;

    // Count preserved patterns that we shouldn't count against density
    // Reset lastIndex for global patterns
    PATTERNS.labelValue.lastIndex = 0;
    PATTERNS.sectionHeader.lastIndex = 0;

    const labelMatches = text.match(PATTERNS.labelValue) || [];
    const headerMatches = text.match(PATTERNS.sectionHeader) || [];

    const label = labelMatches.length;
    const headers = headerMatches.length;

    // Effective bold = total - preserved
    const effective = Math.max(0, all - label - headers);
    const len = text.length || 1;
    const actual = (effective / len) * 1000;

    return {
      passed: actual <= maxPerKChars,
      actual: Math.round(actual * 10) / 10,
    };
  }

  /**
   * Reduce bold density by removing non-essential bold
   */
  private reduceBoldDensity(text: string): string {
    // Keep label-value bold (**Label:** value) and section headers
    // Remove other bold

    let result = text;

    // First, mark the bold we want to keep
    const labelValueMatches: string[] = [];
    PATTERNS.labelValue.lastIndex = 0;
    result = result.replace(PATTERNS.labelValue, (match) => {
      labelValueMatches.push(match);
      return `__LABEL_${labelValueMatches.length - 1}__`;
    });

    const sectionMatches: string[] = [];
    PATTERNS.sectionHeader.lastIndex = 0;
    result = result.replace(PATTERNS.sectionHeader, (match) => {
      sectionMatches.push(match);
      return `__SECTION_${sectionMatches.length - 1}__`;
    });

    // Remove all other bold
    result = result.replace(PATTERNS.boldSegment, '$1');

    // Restore kept bold
    labelValueMatches.forEach((match, i) => {
      result = result.replace(`__LABEL_${i}__`, match);
    });
    sectionMatches.forEach((match, i) => {
      result = result.replace(`__SECTION_${i}__`, match);
    });

    return result;
  }

  /**
   * Extract meaningful keywords from a user query for bolding.
   * Filters out stopwords and short words, returns unique keywords.
   */
  private extractKeywords(query: string): string[] {
    if (!query || query.length < 5) return [];

    // Stopwords in English, Portuguese, Spanish
    const stopwords = new Set([
      // English
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
      'and', 'but', 'or', 'nor', 'for', 'yet', 'so', 'of', 'to', 'in', 'on', 'at',
      'by', 'with', 'from', 'up', 'about', 'into', 'over', 'after', 'this', 'that',
      'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why', 'all', 'each',
      'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own',
      'same', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then',
      'show', 'me', 'tell', 'give', 'find', 'get', 'please', 'thanks', 'thank',
      // Portuguese
      'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'do', 'das', 'dos',
      'em', 'na', 'no', 'nas', 'nos', 'por', 'para', 'com', 'sem', 'sob', 'sobre',
      'que', 'qual', 'quais', 'quem', 'como', 'quando', 'onde', 'porque', 'este',
      'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas', 'aquele', 'aquela',
      'meu', 'minha', 'seu', 'sua', 'nosso', 'nossa', 'eu', 'tu', 'ele', 'ela', 'nós',
      'vós', 'eles', 'elas', 'você', 'vocês', 'me', 'te', 'se', 'nos', 'vos', 'lhe',
      'mostre', 'mostra', 'diga', 'encontre', 'ache', 'obrigado', 'obrigada',
      // Spanish
      'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'del', 'al',
      'y', 'e', 'ni', 'que', 'pero', 'mas', 'aunque', 'sino', 'porque', 'pues',
      'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'aquel',
      'mi', 'tu', 'su', 'nuestro', 'nuestra', 'yo', 'tú', 'él', 'ella', 'nosotros',
      'muestra', 'dime', 'encuentra', 'gracias',
    ]);

    // Load domain terms from bank (ROI, NPV, etc. that should be bolded even if short)
    const domainTerms = getDomainTerms();

    // Extract words, filter stopwords
    // Only keep words with length >= 5 OR known domain terms from bank
    const words = query
      .toLowerCase()
      .replace(/[^\w\sáéíóúàèìòùâêîôûãõñç]/g, ' ')
      .split(/\s+/)
      .filter(w => !stopwords.has(w) && (w.length >= 5 || domainTerms.has(w)));

    // Deduplicate and return top 5 keywords
    const unique = [...new Set(words)];
    return unique.slice(0, 5);
  }

  /**
   * SMART BOLDING - ChatGPT-like emphasis on key values
   * Bolds: currencies, key numbers, key metric labels, section references (max 10-14 total)
   * Also bolds keywords from user query (first 2-3 occurrences)
   * Never bolds: inside tables, inside quotes, entire sentences
   */
  smartBold(text: string, maxBoldItems: number = 12, userQuery?: string): string {
    let result = text;
    let boldCount = 0;

    // Skip if text is too short
    if (text.length < 50) return text;

    // Preserve existing bold, tables, code blocks, quotes
    const preservePatterns = [
      /\*\*[^*]+\*\*/g,           // Existing bold
      /^\|.*\|$/gm,               // Table rows
      /```[\s\S]*?```/g,          // Code blocks
      /"[^"]+"/g,                 // Quoted text
      />[^\n]+/g,                 // Blockquotes
    ];

    // Mark preserved sections
    const preserved: string[] = [];
    for (const pattern of preservePatterns) {
      result = result.replace(pattern, (match) => {
        preserved.push(match);
        return `__PRESERVE_${preserved.length - 1}__`;
      });
    }

    // 0. Bold keywords from user query (first 2 occurrences per keyword)
    if (userQuery && boldCount < maxBoldItems) {
      const keywords = this.extractKeywords(userQuery);
      const maxOccurrences = 2; // Bold max 2 occurrences per keyword (less noisy)

      for (const keyword of keywords) {
        if (boldCount >= maxBoldItems) break;

        // Escape regex special chars
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match whole word, case insensitive, not already bold or in placeholder
        const keywordRegex = new RegExp(
          `(?<!\\*\\*)\\b(${escaped})\\b(?!\\*\\*)`,
          'gi'
        );

        let occurrenceCount = 0;
        result = result.replace(keywordRegex, (match, captured) => {
          if (boldCount >= maxBoldItems) return match;
          if (occurrenceCount >= maxOccurrences) return match;
          // Don't bold if inside placeholder
          if (match.includes('__PRESERVE_')) return match;

          boldCount++;
          occurrenceCount++;
          return `**${captured}**`;
        });
      }
    }

    // 1. Bold currency values (R$, $, €, £) with amounts
    // Pattern: currency symbol + number (with separators)
    if (boldCount < maxBoldItems) {
      result = result.replace(
        /(?<!\*\*)(?:R\$|US\$|\$|€|£)\s*[\d,.]+(?:\.\d{2})?(?!\*\*)/g,
        (match) => {
          if (boldCount >= maxBoldItems) return match;
          boldCount++;
          return `**${match.trim()}**`;
        }
      );
    }

    // 2. Bold key numeric values with units
    // Pattern: number + unit (months, years, m², %, etc.)
    if (boldCount < maxBoldItems) {
      result = result.replace(
        /(?<!\*\*)(\d+(?:[.,]\d+)?)\s*(months?|meses?|years?|anos?|m²|%|days?|dias?|weeks?|semanas?)(?!\*\*)/gi,
        (match, num, unit) => {
          if (boldCount >= maxBoldItems) return match;
          boldCount++;
          return `**${num} ${unit}**`;
        }
      );
    }

    // 3. Bold section references when mentioned
    // Pattern: "the [Section Name]" or "in [Section Name]"
    if (boldCount < maxBoldItems) {
      result = result.replace(
        /(?:the|in|no|na|em)\s+"([^"]+)"/gi,
        (match, section) => {
          if (boldCount >= maxBoldItems) return match;
          if (section.length > 40) return match; // Skip long quotes
          boldCount++;
          return match.replace(section, `**${section}**`);
        }
      );
    }

    // 4. Bold key metric labels (ChatGPT-like emphasis on important financial/business terms)
    // These are commonly bolded in business documents for scanability
    if (boldCount < maxBoldItems) {
      const metricLabels = [
        // English
        'Total investment', 'Total Investment',
        'Payback', 'Break-even', 'Break even',
        'Net profit', 'Net Profit', 'Gross profit', 'Gross Profit',
        'Revenue', 'Additional revenue',
        'ROI', 'IRR', 'NPV',
        'Cost savings', 'Cost Savings',
        'Monthly cost', 'Monthly Cost', 'Annual cost', 'Annual Cost',
        // Portuguese
        'Investimento total', 'Investimento Total',
        'Lucro líquido', 'Lucro Líquido', 'Lucro bruto', 'Lucro Bruto',
        'Receita adicional', 'Receita Adicional',
        'Economia', 'Economia mensal', 'Economia anual',
        'Custo mensal', 'Custo Mensal', 'Custo anual', 'Custo Anual',
        'Retorno', 'Retorno sobre investimento',
        'Prazo de retorno', 'Prazo de Retorno',
      ];

      for (const label of metricLabels) {
        if (boldCount >= maxBoldItems) break;
        // Match label followed by colon or at word boundary, not already bold
        const labelRegex = new RegExp(
          `(?<!\\*\\*)\\b(${label})\\b(?::)?(?!\\*\\*)`,
          'g'
        );
        result = result.replace(labelRegex, (match, captured) => {
          if (boldCount >= maxBoldItems) return match;
          // Don't bold if it's inside a preserve placeholder
          if (match.includes('__PRESERVE_')) return match;
          boldCount++;
          return `**${captured}**${match.endsWith(':') ? ':' : ''}`;
        });
      }
    }

    // Restore preserved sections
    preserved.forEach((match, i) => {
      result = result.replace(`__PRESERVE_${i}__`, match);
    });

    return result;
  }

  /**
   * Apply label-value bolding - STRICT LINE-BASED
   * Only bold labels when:
   * - Label is short (<= 18 chars)
   * - Label starts at beginning of line
   * - Single "Label: value" line (not in paragraph)
   * - Value is not too long (paragraph)
   *
   * This makes bolding feel like ChatGPT: occasional, purposeful, not everywhere.
   */
  applyLabelValueBolding(text: string): string {
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip table rows
      const t = line.trim();
      if (t.startsWith('|') && t.endsWith('|')) continue;

      // Only apply on single-line "Label: value" forms
      // Pattern: optional indent, then label (A-Za-z, 2-18 chars), then colon, then value
      const m = line.match(/^(\s*)([A-Za-z][A-Za-z0-9 \-/&]{1,17}):\s+(.+)$/);
      if (!m) continue;

      const indent = m[1];
      const label = m[2];
      const value = m[3];

      // Don't bold if value is very long (paragraph-like)
      if (value.length > 120) continue;

      // Don't double-bold
      if (line.includes('**')) continue;

      lines[i] = `${indent}**${label}:** ${value}`;
    }

    return lines.join('\n');
  }
}

// Singleton
let boldingInstance: BoldingNormalizerService | null = null;

export function getBoldingNormalizer(): BoldingNormalizerService {
  if (!boldingInstance) {
    boldingInstance = new BoldingNormalizerService();
  }
  return boldingInstance;
}

export default BoldingNormalizerService;
