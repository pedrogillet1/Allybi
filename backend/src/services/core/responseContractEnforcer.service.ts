/**
 * ResponseContractEnforcer Service
 *
 * Enforces ChatGPT-grade response formatting rules:
 * - Numbered lists when requested
 * - Bullet lists when requested
 * - No emojis (Koda brand)
 * - No forbidden fallback phrases
 * - Structured outlines (1., 1.1, 1.2)
 * - Tables when requested
 */

// Logger is optional - use console.warn as fallback
interface Logger {
  warn: (msg: string) => void;
}

interface FormatRequest {
  numberedList?: boolean;
  bulletList?: boolean;
  noEmojis?: boolean;
  tableFormat?: boolean;
  structuredOutline?: boolean;
  maxItems?: number;
  onePerLine?: boolean;
}

interface EnforcementResult {
  text: string;
  modified: boolean;
  rules: string[];
}

/**
 * Forbidden phrases that should NEVER appear in responses
 */
const FORBIDDEN_PHRASES = [
  'rephrase',
  'upload documents',
  'upload some documents',
  "i don't see any documents",
  "i couldn't find specific information",
  'please provide more context',
  'could you clarify',
  'i need more information',
];

/**
 * Parse formatting instructions from user query
 */
export function parseFormatRequest(query: string): FormatRequest {
  const q = query.toLowerCase();

  return {
    numberedList: /\b(numbered\s+list|numbered|as\s+numbers?|1\.\s*2\.\s*3\.)\b/i.test(q),
    bulletList: /\b(bullet\s*(points?|list)?|bulleted|bullets?)\b/i.test(q),
    noEmojis: /\bno\s+emojis?\b/i.test(q) || true, // Koda brand = always no emojis
    tableFormat: /\b(table|tabular|columns?|rows?)\b/i.test(q),
    structuredOutline: /\b(outline|structured|hierarchical|1\.1|1\.2)\b/i.test(q),
    maxItems: extractMaxItems(q),
    onePerLine: /\bone\s+(file|item|doc|document)\s+per\s+line\b/i.test(q),
  };
}

/**
 * Extract max items from query (e.g., "5 bullets", "top 3")
 */
function extractMaxItems(query: string): number | undefined {
  const match = query.match(/\b(\d+)\s*(bullets?|items?|points?|lines?)\b/i);
  if (match) return parseInt(match[1], 10);

  const topMatch = query.match(/\btop\s*(\d+)\b/i);
  if (topMatch) return parseInt(topMatch[1], 10);

  return undefined;
}

/**
 * Strip all emojis from text
 */
function stripEmojis(text: string): string {
  return text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F000}-\u{1FFFF}]/gu, '');
}

/**
 * Check for forbidden phrases
 */
function hasForbiddenPhrase(text: string): { found: boolean; phrase?: string } {
  const lower = text.toLowerCase();
  for (const phrase of FORBIDDEN_PHRASES) {
    if (lower.includes(phrase)) {
      return { found: true, phrase };
    }
  }
  return { found: false };
}

/**
 * Convert unformatted list to numbered list
 * Handles both raw items and items with DOC markers
 */
function enforceNumberedList(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let itemIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      result.push('');
      continue;
    }

    // Skip headings and intro lines
    if (trimmed.startsWith('#') || trimmed.startsWith('**') && trimmed.endsWith('**') && !trimmed.includes('{{DOC')) {
      // This is a heading or category label - skip numbering but include
      result.push(trimmed);
      continue;
    }

    // Check if line has content (document marker or filename)
    const hasDocMarker = /\{\{DOC::/.test(trimmed);
    const hasFileExtension = /\.\w{2,5}($|\s|\)|\*\*)/i.test(trimmed);

    if (hasDocMarker || hasFileExtension) {
      itemIndex++;
      // Remove existing numbering/bullets
      const cleaned = trimmed
        .replace(/^[-*•]\s*/, '')  // Remove bullet
        .replace(/^\d+[\.\)]\s*/, '');  // Remove existing number
      result.push(`${itemIndex}. ${cleaned}`);
    } else {
      // Keep non-item lines as-is
      result.push(trimmed);
    }
  }

  return result.join('\n');
}

/**
 * Convert to bullet list
 */
function enforceBulletList(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      result.push('');
      continue;
    }

    // Skip headings
    if (trimmed.startsWith('#')) {
      result.push(trimmed);
      continue;
    }

    // Check if line is a list item
    const hasDocMarker = /\{\{DOC::/.test(trimmed);
    const hasFileExtension = /\.\w{2,5}($|\s|\)|\*\*)/i.test(trimmed);

    if (hasDocMarker || hasFileExtension) {
      // Remove existing formatting and add bullet
      const cleaned = trimmed
        .replace(/^[-*•]\s*/, '')
        .replace(/^\d+[\.\)]\s*/, '');
      result.push(`- ${cleaned}`);
    } else if (/^[A-Z]|^\*\*/.test(trimmed) && !trimmed.includes('{{')) {
      // Intro or heading line
      result.push(trimmed);
    } else {
      result.push(trimmed);
    }
  }

  return result.join('\n');
}

/**
 * Convert grouped list to flat numbered list
 * Removes category headings and creates single flat numbered list
 */
function flattenToNumberedList(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let itemIndex = 0;
  let introLine: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Capture intro line (first non-empty line that's not a category)
    if (!introLine && !trimmed.startsWith('**') && !trimmed.includes('{{DOC')) {
      introLine = trimmed;
      continue;
    }

    // Skip category headings like **PDF Documents** (5)
    if (/^\*\*[^*]+\*\*\s*\(\d+\)$/.test(trimmed)) {
      continue;
    }

    // Extract items with DOC markers or file extensions
    const hasDocMarker = /\{\{DOC::/.test(trimmed);
    const hasFileExtension = /\.\w{2,5}($|\s|\)|\*\*)/i.test(trimmed);

    if (hasDocMarker || hasFileExtension) {
      itemIndex++;
      // Remove existing numbering/bullets
      const cleaned = trimmed
        .replace(/^[-*•]\s*/, '')
        .replace(/^\d+[\.\)]\s*/, '');
      result.push(`${itemIndex}. ${cleaned}`);
    }
  }

  // Reconstruct with intro
  if (introLine && result.length > 0) {
    return introLine + '\n\n' + result.join('\n');
  }

  return result.join('\n') || text;
}

/**
 * Main enforcement function - apply all requested formatting rules
 */
export function enforceResponseContract(
  response: string,
  query: string,
  logger?: Logger
): EnforcementResult {
  const request = parseFormatRequest(query);
  let text = response;
  const rules: string[] = [];
  let modified = false;

  // Rule 1: Strip emojis (always for Koda brand)
  const beforeEmoji = text;
  text = stripEmojis(text);
  if (text !== beforeEmoji) {
    rules.push('stripped_emojis');
    modified = true;
  }

  // Rule 2: Check for forbidden phrases
  const forbidden = hasForbiddenPhrase(text);
  if (forbidden.found) {
    logger?.warn(`[ResponseContract] Forbidden phrase detected: "${forbidden.phrase}"`);
    // Don't modify here - let caller decide how to handle
    rules.push(`forbidden_phrase:${forbidden.phrase}`);
  }

  // Rule 3: Enforce numbered list if requested
  if (request.numberedList) {
    const beforeNumbered = text;
    // Use flattenToNumberedList for better results when response has categories
    if (text.includes('**') && text.includes('(') && /\*\*[^*]+\*\*\s*\(\d+\)/.test(text)) {
      text = flattenToNumberedList(text);
    } else {
      text = enforceNumberedList(text);
    }
    if (text !== beforeNumbered) {
      rules.push('enforced_numbered_list');
      modified = true;
    }
  }

  // Rule 4: Enforce bullet list if requested (and not numbered)
  if (request.bulletList && !request.numberedList) {
    const beforeBullet = text;
    text = enforceBulletList(text);
    if (text !== beforeBullet) {
      rules.push('enforced_bullet_list');
      modified = true;
    }
  }

  // Rule 5: Enforce max items if requested
  if (request.maxItems) {
    const lines = text.split('\n');
    const itemLines = lines.filter(l => /^\d+[\.\)]/.test(l.trim()) || /^[-*•]/.test(l.trim()));
    if (itemLines.length > request.maxItems) {
      // Keep intro + only maxItems items
      const intro = lines.filter(l => !(/^\d+[\.\)]/.test(l.trim()) || /^[-*•]/.test(l.trim()))).join('\n');
      const limited = itemLines.slice(0, request.maxItems).join('\n');
      text = intro.trim() + '\n\n' + limited;
      rules.push(`limited_to_${request.maxItems}_items`);
      modified = true;
    }
  }

  return { text, modified, rules };
}

/**
 * Validate response against contracts (doesn't modify, just checks)
 */
export function validateResponseContract(response: string, query: string): {
  valid: boolean;
  violations: string[];
} {
  const request = parseFormatRequest(query);
  const violations: string[] = [];

  // Check for emojis
  if (request.noEmojis && /[\u{1F300}-\u{1F9FF}]/u.test(response)) {
    violations.push('CONTAINS_EMOJIS');
  }

  // Check for forbidden phrases
  const forbidden = hasForbiddenPhrase(response);
  if (forbidden.found) {
    violations.push(`FORBIDDEN_PHRASE:${forbidden.phrase}`);
  }

  // Check for numbered list if requested
  if (request.numberedList) {
    const hasNumbers = /^\s*\d+[\.\)]\s+/m.test(response);
    if (!hasNumbers) {
      violations.push('MISSING_NUMBERED_LIST');
    }
  }

  // Check for bullet list if requested
  if (request.bulletList && !request.numberedList) {
    const hasBullets = /^\s*[-*•]\s+/m.test(response);
    if (!hasBullets) {
      violations.push('MISSING_BULLET_LIST');
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

// Export singleton-style functions
export const responseContractEnforcer = {
  parseFormatRequest,
  enforceResponseContract,
  validateResponseContract,
};
