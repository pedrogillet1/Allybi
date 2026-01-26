/**
 * Format Constraint Parser Service
 *
 * Parses user queries to extract explicit formatting requirements:
 * - Bullet/list counts ("list 5 key points", "em 5 tópicos")
 * - Table requirements ("create a table", "comparison table")
 * - Line/character limits ("in 6 lines", "em poucas palavras")
 *
 * This enables deterministic format enforcement, not just LLM prompting.
 */

export type SupportedLanguage = 'en' | 'pt' | 'es';

export interface FormatConstraints {
  /** User wants bullet-point list */
  wantsBullets: boolean;
  /** User wants numbered list */
  wantsNumbered: boolean;
  /** User wants a markdown table */
  wantsTable: boolean;
  /** Exact number of bullets/items requested */
  bulletCount?: number;
  /** Exact number of lines requested */
  lineCount?: number;
  /** User wants a comparison table specifically */
  compareTable: boolean;
  /** User wants section headings */
  headings: boolean;
  /** User wants casual/chat-style response (not report-like) */
  wantsCasualTone: boolean;
  /** User wants checklist format (actionable items with checkboxes/bullets) */
  wantsChecklist: boolean;
  /** Raw patterns matched (for debugging) */
  matchedPatterns: string[];
}

// ============================================================================
// BULLET COUNT PATTERNS (EN/PT/ES)
// ============================================================================

interface CountPattern {
  pattern: RegExp;
  countGroup: number; // Which capture group contains the count
  description: string;
}

const BULLET_COUNT_PATTERNS: Record<SupportedLanguage, CountPattern[]> = {
  en: [
    { pattern: /\blist\s+(\d+)\b/i, countGroup: 1, description: 'list N' },
    { pattern: /\b(\d+)\s+(?:key\s+)?points?\b/i, countGroup: 1, description: 'N points' },
    { pattern: /\b(\d+)\s+(?:main\s+)?reasons?\b/i, countGroup: 1, description: 'N reasons' },
    { pattern: /\btop\s+(\d+)\b/i, countGroup: 1, description: 'top N' },
    { pattern: /\bgive\s+(?:me\s+)?(\d+)\b/i, countGroup: 1, description: 'give me N' },
    { pattern: /\b(\d+)\s+bullets?\b/i, countGroup: 1, description: 'N bullets' },
    { pattern: /\b(\d+)\s+items?\b/i, countGroup: 1, description: 'N items' },
    { pattern: /\bexactly\s+(\d+)\b/i, countGroup: 1, description: 'exactly N' },
    { pattern: /\bin\s+(\d+)\s+(?:bullet\s+)?points?\b/i, countGroup: 1, description: 'in N points' },
    { pattern: /\b(\d+)\s+key\s+takeaways?\b/i, countGroup: 1, description: 'N key takeaways' },
    { pattern: /\b(\d+)\s+things?\b/i, countGroup: 1, description: 'N things' },
    { pattern: /\b(\d+)\s+examples?\b/i, countGroup: 1, description: 'N examples' },
  ],
  pt: [
    { pattern: /\bem\s+(\d+)\s+t[óo]picos?\b/i, countGroup: 1, description: 'em N tópicos' },
    { pattern: /\bliste\s+(\d+)\b/i, countGroup: 1, description: 'liste N' },
    { pattern: /\b(\d+)\s+pontos?\b/i, countGroup: 1, description: 'N pontos' },
    { pattern: /\b(\d+)\s+raz[õo]es?\b/i, countGroup: 1, description: 'N razões' },
    { pattern: /\btop\s+(\d+)\b/i, countGroup: 1, description: 'top N' },
    { pattern: /\bos\s+(\d+)\s+principais?\b/i, countGroup: 1, description: 'os N principais' },
    { pattern: /\b(\d+)\s+itens?\b/i, countGroup: 1, description: 'N itens' },
    { pattern: /\b(\d+)\s+exemplos?\b/i, countGroup: 1, description: 'N exemplos' },
    { pattern: /\bexatamente\s+(\d+)\b/i, countGroup: 1, description: 'exatamente N' },
    { pattern: /\b(\d+)\s+coisas?\b/i, countGroup: 1, description: 'N coisas' },
    // Cross-language: English words used in Portuguese queries
    { pattern: /\b(\d+)\s+bullets?\b/i, countGroup: 1, description: 'N bullets (cross-lang)' },
  ],
  es: [
    { pattern: /\ben\s+(\d+)\s+puntos?\b/i, countGroup: 1, description: 'en N puntos' },
    { pattern: /\blista\s+(\d+)\b/i, countGroup: 1, description: 'lista N' },
    { pattern: /\b(\d+)\s+puntos?\s+(?:clave|principales?)?\b/i, countGroup: 1, description: 'N puntos' },
    { pattern: /\b(\d+)\s+razones?\b/i, countGroup: 1, description: 'N razones' },
    { pattern: /\btop\s+(\d+)\b/i, countGroup: 1, description: 'top N' },
    { pattern: /\blos\s+(\d+)\s+principales?\b/i, countGroup: 1, description: 'los N principales' },
    { pattern: /\bexactamente\s+(\d+)\b/i, countGroup: 1, description: 'exactamente N' },
    { pattern: /\b(\d+)\s+ejemplos?\b/i, countGroup: 1, description: 'N ejemplos' },
  ],
};

// ============================================================================
// LINE COUNT PATTERNS
// ============================================================================

const LINE_COUNT_PATTERNS: Record<SupportedLanguage, CountPattern[]> = {
  en: [
    { pattern: /\bin\s+(\d+)\s+lines?\b/i, countGroup: 1, description: 'in N lines' },
    { pattern: /\b(\d+)\s+lines?\s+(?:or\s+less|max(?:imum)?)\b/i, countGroup: 1, description: 'N lines max' },
    { pattern: /\bmax(?:imum)?\s+(\d+)\s+lines?\b/i, countGroup: 1, description: 'max N lines' },
  ],
  pt: [
    { pattern: /\bem\s+(\d+)\s+linhas?\b/i, countGroup: 1, description: 'em N linhas' },
    { pattern: /\b(\d+)\s+linhas?\s+(?:ou\s+menos|m[áa]ximo)\b/i, countGroup: 1, description: 'N linhas máximo' },
    { pattern: /\bm[áa]ximo\s+(\d+)\s+linhas?\b/i, countGroup: 1, description: 'máximo N linhas' },
  ],
  es: [
    { pattern: /\ben\s+(\d+)\s+l[íi]neas?\b/i, countGroup: 1, description: 'en N líneas' },
    { pattern: /\b(\d+)\s+l[íi]neas?\s+(?:o\s+menos|m[áa]ximo)\b/i, countGroup: 1, description: 'N líneas máximo' },
    { pattern: /\bm[áa]ximo\s+(\d+)\s+l[íi]neas?\b/i, countGroup: 1, description: 'máximo N líneas' },
  ],
};

// ============================================================================
// TABLE PATTERNS
// ============================================================================

const TABLE_PATTERNS: Record<SupportedLanguage, RegExp[]> = {
  en: [
    /\b(?:create|make|show|give\s+me)\s+(?:a\s+)?(?:comparison\s+)?table\b/i,
    /\bcomparison\s+table\b/i,
    /\bside[\s-]by[\s-]side\s+(?:comparison|table)?\b/i,
    /\bin\s+(?:a\s+)?table\s+format\b/i,
    /\bas\s+(?:a\s+)?table\b/i,
    /\btabular\s+format\b/i,
    /\bformat\s+(?:it\s+)?as\s+(?:a\s+)?table\b/i,
  ],
  pt: [
    /\b(?:crie|fa[çc]a|mostre|me\s+d[êe])\s+(?:uma\s+)?tabela\b/i,
    /\btabela\s+(?:de\s+)?compara[çc][ãa]o\b/i,
    /\bcompara[çc][ãa]o\s+em\s+tabela\b/i,
    /\bem\s+(?:forma\s+de\s+)?tabela\b/i,
    /\bformato\s+(?:de\s+)?tabela\b/i,
    /\blado\s+a\s+lado\b/i,
  ],
  es: [
    /\b(?:crea|haz|muestra|dame)\s+(?:una\s+)?tabla\b/i,
    /\btabla\s+(?:de\s+)?comparaci[óo]n\b/i,
    /\bcomparaci[óo]n\s+en\s+tabla\b/i,
    /\ben\s+(?:forma\s+de\s+)?tabla\b/i,
    /\bformato\s+(?:de\s+)?tabla\b/i,
    /\blado\s+a\s+lado\b/i,
  ],
};

// ============================================================================
// COMPARISON TABLE PATTERNS (subset that implies A vs B structure)
// ============================================================================

const COMPARE_TABLE_PATTERNS: Record<SupportedLanguage, RegExp[]> = {
  en: [
    /\bcompare\s+.+\s+(?:vs\.?|versus|and|with)\s+.+\s+(?:in\s+)?(?:a\s+)?table\b/i,
    /\bcomparison\s+(?:of|between)\b/i,
    /\bside[\s-]by[\s-]side\b/i,
    /\b(?:differences?|similarities?)\s+(?:between|of)\b/i,
    /\bvs\.?\s+.+\s+table\b/i,
  ],
  pt: [
    /\bcompare\s+.+\s+(?:vs\.?|versus|e|com)\s+.+\s+(?:em\s+)?tabela\b/i,
    /\bcompara[çc][ãa]o\s+(?:de|entre)\b/i,
    /\blado\s+a\s+lado\b/i,
    /\bdiferen[çc]as?\s+entre\b/i,
    /\bsemelhan[çc]as?\s+entre\b/i,
  ],
  es: [
    /\bcompara\s+.+\s+(?:vs\.?|versus|y|con)\s+.+\s+(?:en\s+)?tabla\b/i,
    /\bcomparaci[óo]n\s+(?:de|entre)\b/i,
    /\blado\s+a\s+lado\b/i,
    /\bdiferencias?\s+entre\b/i,
    /\bsimilitudes?\s+entre\b/i,
  ],
};

// ============================================================================
// LIST/BULLET PATTERNS (without count)
// ============================================================================

const LIST_PATTERNS: Record<SupportedLanguage, RegExp[]> = {
  en: [
    /\blist\s+(?:the|all|some|main|key)\b/i,
    /\b(?:as|in)\s+(?:a\s+)?(?:bulleted?\s+)?list\b/i,
    /\bbullet\s+points?\b/i,
    /\b(?:give|provide)\s+(?:me\s+)?(?:a\s+)?list\b/i,
    /\benumerate\b/i,
  ],
  pt: [
    /\bliste\s+(?:os?|as?|todos?|principais?)\b/i,
    /\bem\s+(?:forma\s+de\s+)?lista\b/i,
    /\bem\s+t[óo]picos\b/i,
    /\bpontos?\s+(?:de\s+)?destaque\b/i,
    /\benumere\b/i,
  ],
  es: [
    /\blista\s+(?:los?|las?|todos?|principales?)\b/i,
    /\ben\s+(?:forma\s+de\s+)?lista\b/i,
    /\bpuntos?\s+(?:clave|principales?)\b/i,
    /\benumera\b/i,
  ],
};

// ============================================================================
// NUMBERED LIST PATTERNS
// ============================================================================

const NUMBERED_LIST_PATTERNS: Record<SupportedLanguage, RegExp[]> = {
  en: [
    /\bnumbered\s+list\b/i,
    /\b(?:as|in)\s+(?:a\s+)?numbered\s+(?:list|format)\b/i,
    /\bwith\s+numbers?\b/i,
  ],
  pt: [
    /\blista\s+numerada\b/i,
    /\bcom\s+n[úu]meros?\b/i,
    /\bnumerado\b/i,
  ],
  es: [
    /\blista\s+numerada\b/i,
    /\bcon\s+n[úu]meros?\b/i,
    /\bnumerado\b/i,
  ],
};

// ============================================================================
// HEADING PATTERNS
// ============================================================================

const HEADING_PATTERNS: Record<SupportedLanguage, RegExp[]> = {
  en: [
    /\bwith\s+(?:section\s+)?headings?\b/i,
    /\borganized?\s+(?:by|with)\s+(?:section\s+)?headings?\b/i,
  ],
  pt: [
    /\bcom\s+(?:t[íi]tulos?|cabe[çc]alhos?|se[çc][õo]es?)\b/i,
    /\borganizado\s+(?:por|com)\s+(?:t[íi]tulos?|se[çc][õo]es?)\b/i,
  ],
  es: [
    /\bcon\s+(?:t[íi]tulos?|encabezados?|secciones?)\b/i,
    /\borganizado\s+(?:por|con)\s+(?:t[íi]tulos?|secciones?)\b/i,
  ],
};

// ============================================================================
// CHECKLIST PATTERNS
// ============================================================================

const CHECKLIST_PATTERNS: Record<SupportedLanguage, RegExp[]> = {
  en: [
    /\bchecklist\b/i,
    /\b(?:quick|rapid)\s+(?:action\s+)?list\b/i,
    /\bactionable\s+(?:items?|steps?)\b/i,
    /\bto[\s-]?do\s+list\b/i,
  ],
  pt: [
    /\bchecklist\b/i,
    /\blista\s+(?:r[áa]pida|de\s+a[çc][õo]es?|de\s+verifica[çc][ãa]o)\b/i,
    /\bchecklist\s+r[áa]pido\b/i,
    /\bitens?\s+acion[áa]veis?\b/i,
  ],
  es: [
    /\bchecklist\b/i,
    /\blista\s+(?:r[áa]pida|de\s+acciones?|de\s+verificaci[óo]n)\b/i,
    /\belementos?\s+accionables?\b/i,
  ],
};

// ============================================================================
// CASUAL TONE / CHAT STYLE PATTERNS
// ============================================================================

const CASUAL_TONE_PATTERNS: Record<SupportedLanguage, RegExp[]> = {
  en: [
    /\blike\s+(?:a\s+)?chat\b/i,
    /\bchat[\s-]?style\b/i,
    /\bconversational\b/i,
    /\bcasual\s+(?:tone|style|way)\b/i,
    /\bnot?\s+(?:like\s+)?(?:a\s+)?report\b/i,
    /\bwithout\s+(?:the\s+)?report\s+(?:feel|style|format)\b/i,
    /\binformal\b/i,
  ],
  pt: [
    /\bcomo\s+(?:um\s+)?chat\b/i,
    /\bestilo\s+(?:de\s+)?chat\b/i,
    /\bconversa(?:cional)?\b/i,
    /\btom\s+(?:casual|informal)\b/i,
    /\bsem\s+cara\s+de\s+relat[óo]rio\b/i,
    /\bn[ãa]o\s+(?:seja\s+)?(?:um\s+)?relat[óo]rio\b/i,
    /\bresposta\s+(?:de\s+)?chat\b/i,
  ],
  es: [
    /\bcomo\s+(?:un\s+)?chat\b/i,
    /\bestilo\s+(?:de\s+)?chat\b/i,
    /\bconversacional\b/i,
    /\btono\s+(?:casual|informal)\b/i,
    /\bsin\s+(?:parecer\s+)?(?:un\s+)?(?:informe|reporte)\b/i,
  ],
};

// ============================================================================
// MAIN PARSER FUNCTION
// ============================================================================

/**
 * Parse format constraints from user query.
 *
 * @param query - The user's query text
 * @param language - Language code ('en', 'pt', 'es')
 * @returns FormatConstraints object with parsed requirements
 */
export function parseFormatConstraints(
  query: string,
  language: SupportedLanguage = 'en'
): FormatConstraints {
  const matchedPatterns: string[] = [];

  // 1. Check for bullet count
  let bulletCount: number | undefined;
  const bulletPatterns = BULLET_COUNT_PATTERNS[language] || BULLET_COUNT_PATTERNS.en;

  for (const { pattern, countGroup, description } of bulletPatterns) {
    const match = query.match(pattern);
    if (match && match[countGroup]) {
      const count = parseInt(match[countGroup], 10);
      if (count > 0 && count <= 50) {
        // Reasonable range
        bulletCount = count;
        matchedPatterns.push(`bullet_count:${description}`);
        break;
      }
    }
  }

  // 2. Check for line count
  let lineCount: number | undefined;
  const linePatterns = LINE_COUNT_PATTERNS[language] || LINE_COUNT_PATTERNS.en;

  for (const { pattern, countGroup, description } of linePatterns) {
    const match = query.match(pattern);
    if (match && match[countGroup]) {
      const count = parseInt(match[countGroup], 10);
      if (count > 0 && count <= 100) {
        lineCount = count;
        matchedPatterns.push(`line_count:${description}`);
        break;
      }
    }
  }

  // 3. Check for table requirement
  let wantsTable = false;
  const tablePatterns = TABLE_PATTERNS[language] || TABLE_PATTERNS.en;

  for (const pattern of tablePatterns) {
    if (pattern.test(query)) {
      wantsTable = true;
      matchedPatterns.push('table:explicit');
      break;
    }
  }

  // 4. Check for comparison table
  let compareTable = false;
  const comparePatterns = COMPARE_TABLE_PATTERNS[language] || COMPARE_TABLE_PATTERNS.en;

  for (const pattern of comparePatterns) {
    if (pattern.test(query)) {
      compareTable = true;
      wantsTable = true; // Comparison implies table
      matchedPatterns.push('table:comparison');
      break;
    }
  }

  // 5. Check for list requirement (without count)
  let wantsBullets = bulletCount !== undefined;
  if (!wantsBullets) {
    const listPatterns = LIST_PATTERNS[language] || LIST_PATTERNS.en;
    for (const pattern of listPatterns) {
      if (pattern.test(query)) {
        wantsBullets = true;
        matchedPatterns.push('list:explicit');
        break;
      }
    }
  }

  // 6. Check for numbered list
  let wantsNumbered = false;
  const numberedPatterns = NUMBERED_LIST_PATTERNS[language] || NUMBERED_LIST_PATTERNS.en;

  for (const pattern of numberedPatterns) {
    if (pattern.test(query)) {
      wantsNumbered = true;
      wantsBullets = true; // Numbered is a type of list
      matchedPatterns.push('list:numbered');
      break;
    }
  }

  // 7. Check for headings
  let headings = false;
  const headingPatterns = HEADING_PATTERNS[language] || HEADING_PATTERNS.en;

  for (const pattern of headingPatterns) {
    if (pattern.test(query)) {
      headings = true;
      matchedPatterns.push('headings:explicit');
      break;
    }
  }

  // 8. Check for checklist format
  let wantsChecklist = false;
  const checklistPatterns = CHECKLIST_PATTERNS[language] || CHECKLIST_PATTERNS.en;

  for (const pattern of checklistPatterns) {
    if (pattern.test(query)) {
      wantsChecklist = true;
      wantsBullets = true; // Checklist implies bullet list
      matchedPatterns.push('checklist:explicit');
      break;
    }
  }

  // 9. Check for casual tone / chat style
  let wantsCasualTone = false;
  const casualTonePatterns = CASUAL_TONE_PATTERNS[language] || CASUAL_TONE_PATTERNS.en;

  for (const pattern of casualTonePatterns) {
    if (pattern.test(query)) {
      wantsCasualTone = true;
      matchedPatterns.push('tone:casual');
      break;
    }
  }

  return {
    wantsBullets,
    wantsNumbered,
    wantsTable,
    bulletCount,
    lineCount,
    compareTable,
    headings,
    wantsCasualTone,
    wantsChecklist,
    matchedPatterns,
  };
}

// ============================================================================
// BULLET DETECTION AND COUNTING
// ============================================================================

/**
 * Bullet marker patterns for detection.
 * Supports: -, *, •, 1., 2., a), b), etc.
 */
const BULLET_LINE_PATTERN = /^[\s]*(?:[-*•]|\d+[.):]|[a-zA-Z][.):])\s+.+$/;

/**
 * Extract all bullet lines from text.
 */
export function extractBulletLines(text: string): string[] {
  const lines = text.split('\n');
  return lines.filter((line) => BULLET_LINE_PATTERN.test(line));
}

/**
 * Count bullet items in text.
 */
export function countBullets(text: string): number {
  return extractBulletLines(text).length;
}

/**
 * Remove dangling/empty bullet markers from text.
 * TRUST_HARDENING: Prevents incomplete lists from appearing in output.
 *
 * Removes:
 * - Empty bullet lines: "- ", "* ", "• "
 * - Dangling numbered list items: "1. ", "2. "
 * - Lines that are just markers without content
 */
export function removeDanglingMarkers(text: string): string {
  const lines = text.split('\n');
  const cleaned = lines.filter((line) => {
    const trimmed = line.trim();
    // Remove empty bullet markers
    if (/^[-*•]\s*$/.test(trimmed)) return false;
    // Remove dangling numbered markers
    if (/^\d+[.)]\s*$/.test(trimmed)) return false;
    // Remove empty lettered markers
    if (/^[a-zA-Z][.)]\s*$/.test(trimmed)) return false;
    return true;
  });
  return cleaned.join('\n');
}

/**
 * Normalize bullet markers to consistent "- " format.
 */
export function normalizeBulletMarkers(text: string): string {
  const lines = text.split('\n');
  return lines
    .map((line) => {
      // Replace * or • at start of line with -
      return line.replace(/^(\s*)(?:\*|•)\s+/, '$1- ');
    })
    .join('\n');
}

// ============================================================================
// BULLET COUNT ENFORCEMENT
// ============================================================================

/**
 * Enforce exact bullet count.
 *
 * If text has more bullets than required, truncate to first N.
 * If text has fewer bullets than required, add explanation note.
 *
 * @param text - The text to enforce
 * @param requiredCount - The exact number of bullets required
 * @param language - Language for any added notes
 * @returns Text with enforced bullet count
 */
export function enforceBulletCount(
  text: string,
  requiredCount: number,
  language: SupportedLanguage = 'en'
): { text: string; modified: boolean; originalCount: number } {
  const lines = text.split('\n');
  const bulletLines: { index: number; line: string }[] = [];
  const nonBulletLines: { index: number; line: string }[] = [];

  // Categorize lines
  for (let i = 0; i < lines.length; i++) {
    if (BULLET_LINE_PATTERN.test(lines[i])) {
      bulletLines.push({ index: i, line: lines[i] });
    } else {
      nonBulletLines.push({ index: i, line: lines[i] });
    }
  }

  const originalCount = bulletLines.length;

  if (originalCount === requiredCount) {
    // Perfect match
    return { text, modified: false, originalCount };
  }

  if (originalCount > requiredCount) {
    // Too many bullets - truncate
    const keptBullets = bulletLines.slice(0, requiredCount);
    const keptBulletIndices = new Set(keptBullets.map((b) => b.index));

    // Find the last bullet we're keeping
    const lastKeptIndex = Math.max(...keptBullets.map((b) => b.index));

    // Rebuild text: keep non-bullets before first bullet, bullets we're keeping,
    // and non-bullets after last kept bullet (like citations)
    const result: string[] = [];
    let foundFirstBullet = false;

    for (let i = 0; i < lines.length; i++) {
      if (BULLET_LINE_PATTERN.test(lines[i])) {
        foundFirstBullet = true;
        if (keptBulletIndices.has(i)) {
          result.push(lines[i]);
        }
        // Skip bullets not in kept set
      } else if (!foundFirstBullet || i > lastKeptIndex) {
        // Keep preamble and postamble (citations, source lines)
        result.push(lines[i]);
      }
    }

    return {
      text: result.join('\n').trim(),
      modified: true,
      originalCount,
    };
  }

  // P0 Phase 5: Fewer bullets than required - return as-is without meta note
  // ChatGPT-quality: Don't expose internal mechanics to user
  return {
    text: text.trim(),
    modified: false,  // No modification made
    originalCount,
  };
}

// ============================================================================
// TABLE VALIDATION AND REPAIR
// ============================================================================

/**
 * Check if text contains a valid Markdown table.
 *
 * Valid table requirements:
 * - At least one header row with pipes
 * - Separator row with dashes
 * - Consistent column count
 */
export function isValidMarkdownTable(text: string): boolean {
  const lines = text.split('\n').filter((line) => line.trim());

  // Find lines that look like table rows
  const tableRows = lines.filter((line) => /\|/.test(line));

  if (tableRows.length < 2) {
    return false; // Need at least header + separator
  }

  // Check for separator row (dashes)
  const hasSeparator = tableRows.some((row) => /^\s*\|[\s\-:|]+\|\s*$/.test(row));

  if (!hasSeparator) {
    return false;
  }

  // Check column count consistency
  const columnCounts = tableRows.map((row) => (row.match(/\|/g) || []).length);
  const firstCount = columnCounts[0];
  const consistent = columnCounts.every((count) => count === firstCount);

  return consistent;
}

/**
 * Attempt to convert prose/bullets to a table.
 *
 * Works for patterns like:
 * - "A: value1 / B: value2" → 2-column table
 * - Comparison bullets → Aspect | A | B table
 */
export function attemptTableConversion(
  text: string,
  language: SupportedLanguage = 'en'
): string | null {
  const lines = text.split('\n').filter((line) => line.trim());

  // Pattern 1: Key-value pairs with colons
  // "Revenue: $100" → | Metric | Value |
  const kvPattern = /^[-*•]?\s*(.+?):\s*(.+)$/;
  const kvPairs: { key: string; value: string }[] = [];

  for (const line of lines) {
    const match = line.match(kvPattern);
    if (match) {
      kvPairs.push({ key: match[1].trim(), value: match[2].trim() });
    }
  }

  if (kvPairs.length >= 2) {
    const headers: Record<SupportedLanguage, string[]> = {
      en: ['Metric', 'Value'],
      pt: ['Métrica', 'Valor'],
      es: ['Métrica', 'Valor'],
    };

    const [h1, h2] = headers[language];
    let table = `| ${h1} | ${h2} |\n|---|---|\n`;
    for (const { key, value } of kvPairs) {
      table += `| ${key} | ${value} |\n`;
    }
    return table.trim();
  }

  // Pattern 2: Comparison bullets with "vs" or "versus"
  // - Project A: $100k vs Project B: $150k
  const vsPattern = /^[-*•]?\s*(.+?)\s+(?:vs\.?|versus)\s+(.+)$/i;
  const comparisons: { a: string; b: string }[] = [];

  for (const line of lines) {
    const match = line.match(vsPattern);
    if (match) {
      comparisons.push({ a: match[1].trim(), b: match[2].trim() });
    }
  }

  if (comparisons.length >= 2) {
    const headers: Record<SupportedLanguage, string[]> = {
      en: ['Aspect', 'Option A', 'Option B'],
      pt: ['Aspecto', 'Opção A', 'Opção B'],
      es: ['Aspecto', 'Opción A', 'Opción B'],
    };

    const [h1, h2, h3] = headers[language];
    let table = `| ${h1} | ${h2} | ${h3} |\n|---|---|---|\n`;
    for (let i = 0; i < comparisons.length; i++) {
      table += `| Item ${i + 1} | ${comparisons[i].a} | ${comparisons[i].b} |\n`;
    }
    return table.trim();
  }

  return null; // Cannot convert
}

/**
 * Enforce table format.
 *
 * If wantsTable=true but output is not a table:
 * 1. Try to convert to table
 * 2. If conversion fails, add a note
 */
export function enforceTableFormat(
  text: string,
  language: SupportedLanguage = 'en'
): { text: string; modified: boolean; hasTable: boolean } {
  if (isValidMarkdownTable(text)) {
    return { text, modified: false, hasTable: true };
  }

  // Try conversion
  const converted = attemptTableConversion(text, language);
  if (converted) {
    // Keep any preamble before the first bullet/content
    const lines = text.split('\n');
    const firstContentIndex = lines.findIndex(
      (line) => /^[-*•]/.test(line.trim()) || /^\w.*:/.test(line.trim())
    );

    if (firstContentIndex > 0) {
      const preamble = lines.slice(0, firstContentIndex).join('\n').trim();
      return {
        text: preamble + '\n\n' + converted,
        modified: true,
        hasTable: true,
      };
    }

    return { text: converted, modified: true, hasTable: true };
  }

  // P0 Phase 5: Cannot convert - return as-is without meta note
  // ChatGPT-quality: Don't expose internal mechanics to user
  return {
    text: text.trim(),
    modified: false,
    hasTable: false,
  };
}

// ============================================================================
// LINE COUNT ENFORCEMENT
// ============================================================================

/**
 * Enforce exact line count.
 *
 * If text has more lines than required, truncate intelligently:
 * - Keep complete sentences/bullet points
 * - Add ellipsis if truncated mid-thought
 *
 * @param text - The text to enforce
 * @param requiredLines - The exact number of lines required
 * @param language - Language for any added notes
 * @returns Text with enforced line count
 */
export function enforceLineCount(
  text: string,
  requiredLines: number,
  language: SupportedLanguage = 'en'
): { text: string; modified: boolean; originalLines: number } {
  // Split into lines, preserving empty lines for structure
  const lines = text.split('\n');
  const nonEmptyLines = lines.filter(line => line.trim().length > 0);
  const originalLines = nonEmptyLines.length;

  if (originalLines <= requiredLines) {
    // Already within limit
    return { text, modified: false, originalLines };
  }

  // Take first N non-empty lines, preserving structure
  const keptLines: string[] = [];
  let nonEmptyCount = 0;

  for (const line of lines) {
    if (line.trim().length === 0) {
      // Keep empty lines for structure if we haven't hit limit
      if (nonEmptyCount < requiredLines) {
        keptLines.push(line);
      }
    } else {
      if (nonEmptyCount < requiredLines) {
        keptLines.push(line);
        nonEmptyCount++;
      }
    }
  }

  let result = keptLines.join('\n').trim();

  // Check if we cut off mid-sentence (doesn't end with punctuation)
  if (!/[.!?:]\s*$/.test(result)) {
    // Add ellipsis to indicate truncation
    result += '...';
  }

  return {
    text: result,
    modified: true,
    originalLines,
  };
}

// ============================================================================
// DANGLING LIST ITEM DETECTION AND FIX
// ============================================================================

/**
 * Detect and fix dangling list items (truncated mid-item).
 *
 * Examples of dangling items:
 * - "1. " (number with no content)
 * - "- " (bullet with no content)
 * - "- Some text that ends" (truncated mid-sentence)
 *
 * @param text - The text to check
 * @returns Fixed text with complete list items only
 */
export function fixDanglingListItems(text: string): { text: string; modified: boolean } {
  const lines = text.split('\n');
  const fixedLines: string[] = [];
  let modified = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for dangling list markers (just the marker, no content)
    if (/^(?:[-*•]|\d+[.):])\s*$/.test(trimmed)) {
      // This is just a list marker with no content - remove it
      modified = true;
      continue;
    }

    // Check if this is a list item that looks truncated
    // (ends without punctuation and is the last item, or next line starts new item)
    const isListItem = /^(?:[-*•]|\d+[.):])/.test(trimmed);
    const isLastLine = i === lines.length - 1;
    const nextLineIsListItem = i < lines.length - 1 &&
      /^\s*(?:[-*•]|\d+[.):])\s/.test(lines[i + 1]);
    const endsWithoutPunctuation = !/[.!?:,;]\s*$/.test(trimmed) && trimmed.length > 0;

    if (isListItem && isLastLine && endsWithoutPunctuation && trimmed.length < 50) {
      // Short truncated list item at end - likely incomplete, add ellipsis
      fixedLines.push(line + '...');
      modified = true;
      continue;
    }

    fixedLines.push(line);
  }

  // Also check for truncated numbered lists (e.g., ends with "2." when expecting more)
  const numberedPattern = /^\s*(\d+)[.):\s]/;
  let lastNumber = 0;
  let hasIncompleteNumbering = false;

  for (const line of fixedLines) {
    const match = line.match(numberedPattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num === lastNumber + 1) {
        lastNumber = num;
      } else if (num > lastNumber + 1) {
        // Gap in numbering - might indicate truncation
        hasIncompleteNumbering = true;
      }
    }
  }

  return {
    text: fixedLines.join('\n'),
    modified,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const formatConstraintParser = {
  parseFormatConstraints,
  extractBulletLines,
  countBullets,
  normalizeBulletMarkers,
  removeDanglingMarkers,
  enforceBulletCount,
  enforceLineCount,
  fixDanglingListItems,
  isValidMarkdownTable,
  attemptTableConversion,
  enforceTableFormat,
};

export default formatConstraintParser;
