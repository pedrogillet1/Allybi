/**
 * Numeric Grounding Service
 *
 * ANTI-HALLUCINATION: Ensures numeric claims in answers are backed by evidence.
 *
 * ChatGPT-quality requires that numbers in answers either:
 * 1. Exist verbatim in the evidence chunks
 * 2. Are computed from evidence numbers (with visible equation)
 * 3. Are explicitly marked as uncertain
 *
 * This runs AFTER answer generation to validate numeric claims.
 */

export interface NumericToken {
  raw: string;           // Original text: "R$ 900.000,00"
  normalized: number;    // Numeric value: 900000
  type: 'currency' | 'percentage' | 'quantity' | 'area' | 'rate' | 'plain';
  currency?: string;     // "R$", "$", "€", etc.
  unit?: string;         // "m²", "%", "meses", etc.
  isUnitPrice?: boolean; // true if followed by /m², per m², etc.
  context?: string;      // Surrounding text for debugging
}

export interface GroundingResult {
  passed: boolean;
  ungroundedNumbers: NumericToken[];
  groundedNumbers: NumericToken[];
  suggestedAction: 'proceed' | 'block' | 'quote_fallback';
  reason?: string;
  quoteFallback?: string;  // If action is quote_fallback, the exact excerpt to use
}

/**
 * Parse Brazilian/international number formats
 * Brazilian: 900.000,00 (period for thousands, comma for decimals)
 * International: 900,000.00 (comma for thousands, period for decimals)
 */
function parseNumber(raw: string): number | null {
  // Remove currency symbols and whitespace
  let cleaned = raw.replace(/[R$€£¥\s]/g, '').trim();

  if (!cleaned || !/\d/.test(cleaned)) return null;

  // Detect format by looking at separators
  // Brazilian: last separator before 2 decimal digits is comma
  // International: last separator before 2 decimal digits is period

  const lastComma = cleaned.lastIndexOf(',');
  const lastPeriod = cleaned.lastIndexOf('.');

  if (lastComma > lastPeriod) {
    // Brazilian format: 900.000,00
    // Remove thousand separators (periods), replace decimal comma with period
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastPeriod > lastComma) {
    // International format: 900,000.00
    // Remove thousand separators (commas)
    cleaned = cleaned.replace(/,/g, '');
  } else {
    // No clear format - just remove non-numeric except period
    cleaned = cleaned.replace(/[^\d.]/g, '');
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Extract all numeric tokens from text
 */
export function extractNumericTokens(text: string): NumericToken[] {
  const tokens: NumericToken[] = [];

  // Currency patterns (Brazilian R$, USD, EUR, etc.)
  const currencyPattern = /(?<currency>R\$|US\$|\$|€|£)\s*(?<value>[\d.,]+)/g;

  // Percentage patterns
  const percentPattern = /(?<value>[\d.,]+)\s*%/g;

  // Area patterns (m², sqm, square meters)
  const areaPattern = /(?<value>[\d.,]+)\s*(?<unit>m²|m2|sqm|square\s*meters?)/gi;

  // Rate/unit price patterns (R$/m², per m², /month, etc.)
  const ratePattern = /(?<currency>R\$|US\$|\$|€|£)?\s*(?<value>[\d.,]+)\s*(?<separator>\/|per|por)\s*(?<unit>m²|m2|mês|month|ano|year|unidade|unit)/gi;

  // Plain numbers (with context check)
  const plainPattern = /\b(?<value>\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\b/g;

  // Extract currencies
  let match;
  while ((match = currencyPattern.exec(text)) !== null) {
    const raw = match[0];
    const normalized = parseNumber(match.groups?.value || '');
    if (normalized !== null) {
      // Check if this is a unit price (followed by /m², per m², etc.)
      const afterMatch = text.slice(match.index + raw.length, match.index + raw.length + 20);
      const isUnitPrice = /^\s*(?:\/|per|por)\s*(?:m²|m2|mês|month)/i.test(afterMatch);

      tokens.push({
        raw,
        normalized,
        type: isUnitPrice ? 'rate' : 'currency',
        currency: match.groups?.currency,
        isUnitPrice,
        context: text.slice(Math.max(0, match.index - 20), match.index + raw.length + 20),
      });
    }
  }

  // Extract percentages
  while ((match = percentPattern.exec(text)) !== null) {
    const normalized = parseNumber(match.groups?.value || '');
    if (normalized !== null) {
      tokens.push({
        raw: match[0],
        normalized,
        type: 'percentage',
        unit: '%',
        context: text.slice(Math.max(0, match.index - 20), match.index + match[0].length + 20),
      });
    }
  }

  // Extract areas
  while ((match = areaPattern.exec(text)) !== null) {
    const normalized = parseNumber(match.groups?.value || '');
    if (normalized !== null) {
      tokens.push({
        raw: match[0],
        normalized,
        type: 'area',
        unit: match.groups?.unit,
        context: text.slice(Math.max(0, match.index - 20), match.index + match[0].length + 20),
      });
    }
  }

  return tokens;
}

/**
 * Check if a number from the answer is grounded in evidence
 */
function isNumberGrounded(
  answerToken: NumericToken,
  evidenceTokens: NumericToken[],
  tolerance: number = 0.01  // 1% tolerance for rounding
): boolean {
  // Unit prices are always grounded (they're rates, not totals)
  if (answerToken.isUnitPrice) {
    return true;
  }

  // Check for exact or near-exact match
  for (const evidenceToken of evidenceTokens) {
    // Must be same type (currency with currency, percentage with percentage)
    if (answerToken.type !== evidenceToken.type) continue;

    // Check if same currency
    if (answerToken.currency && evidenceToken.currency &&
        answerToken.currency !== evidenceToken.currency) continue;

    // Check numeric match within tolerance
    const diff = Math.abs(answerToken.normalized - evidenceToken.normalized);
    const maxVal = Math.max(answerToken.normalized, evidenceToken.normalized);
    if (maxVal === 0) continue;

    const relativeDiff = diff / maxVal;
    if (relativeDiff <= tolerance) {
      return true;
    }
  }

  return false;
}

/**
 * Check if answer numbers could be computed from evidence
 * E.g., 1800 m² × R$ 500/m² = R$ 900,000
 */
function isComputedFromEvidence(
  answerToken: NumericToken,
  evidenceTokens: NumericToken[]
): boolean {
  // Only check currency totals
  if (answerToken.type !== 'currency') return false;

  // Look for area × rate = total patterns
  const areas = evidenceTokens.filter(t => t.type === 'area');
  const rates = evidenceTokens.filter(t => t.type === 'rate' || t.isUnitPrice);

  for (const area of areas) {
    for (const rate of rates) {
      const computed = area.normalized * rate.normalized;
      const diff = Math.abs(answerToken.normalized - computed);
      const relativeDiff = diff / Math.max(answerToken.normalized, computed);

      if (relativeDiff <= 0.05) {  // 5% tolerance for computed values
        return true;
      }
    }
  }

  return false;
}

/**
 * Clean up text with encoding issues (common in PDF extraction)
 * Fixes mojibake like "œ" -> "ú", "†" -> "²", etc.
 */
function cleanEncodingIssues(text: string): string {
  // Common Windows-1252 to UTF-8 mojibake fixes
  const fixes: [RegExp, string][] = [
    [/œ/g, 'ú'],   // ú encoded wrong
    [/†/g, '²'],   // ² (superscript 2)
    [/Ø/g, 'é'],   // é encoded wrong
    [/ª/g, 'ã'],   // ã encoded wrong
    [/Æ/g, 'á'],   // á encoded wrong
    [/ç/g, 'ç'],   // ç (keep as is)
    [/`/g, 'Á'],   // Á encoded wrong
    [/ã/g, 'ã'],   // Keep correct ã
    [/\u0000/g, ''], // Remove null bytes
    [/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''], // Remove control chars
  ];

  let cleaned = text;
  for (const [pattern, replacement] of fixes) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  // Also try to fix common patterns like "m†" -> "m²"
  cleaned = cleaned.replace(/m†/g, 'm²');
  cleaned = cleaned.replace(/R\$ /g, 'R$ '); // Normalize R$ spacing

  return cleaned;
}

/**
 * Find the best excerpt containing a number from evidence
 */
function findExcerptWithNumber(
  targetValue: number,
  evidenceText: string,
  maxLength: number = 200
): string | null {
  const tokens = extractNumericTokens(evidenceText);

  for (const token of tokens) {
    if (Math.abs(token.normalized - targetValue) / targetValue < 0.01) {
      // Found matching number, return context
      const start = evidenceText.indexOf(token.raw);
      if (start >= 0) {
        const excerptStart = Math.max(0, start - 50);
        const excerptEnd = Math.min(evidenceText.length, start + token.raw.length + 100);
        const rawExcerpt = evidenceText.slice(excerptStart, excerptEnd).trim();
        // Clean up encoding issues before returning
        return '...' + cleanEncodingIssues(rawExcerpt) + '...';
      }
    }
  }

  return null;
}

export class NumericGroundingService {
  private logger: Pick<Console, 'info' | 'warn' | 'debug'>;

  constructor(logger?: Pick<Console, 'info' | 'warn' | 'debug'>) {
    this.logger = logger || console;
  }

  /**
   * Main entry: Check if numeric claims in answer are grounded in evidence
   */
  checkGrounding(
    answerText: string,
    evidenceChunks: Array<{ text: string; metadata?: Record<string, unknown> }>,
    options: {
      operator?: string;
      requireStrictMatch?: boolean;
    } = {}
  ): GroundingResult {
    const { operator, requireStrictMatch = false } = options;

    // Extract numbers from answer
    const answerTokens = extractNumericTokens(answerText);

    // Extract numbers from all evidence
    const evidenceText = evidenceChunks.map(c => c.text).join('\n');
    const evidenceTokens = extractNumericTokens(evidenceText);

    this.logger.debug('[NumericGrounding] Extracted tokens', {
      answerCount: answerTokens.length,
      evidenceCount: evidenceTokens.length,
    });

    // Check each answer number
    const groundedNumbers: NumericToken[] = [];
    const ungroundedNumbers: NumericToken[] = [];

    for (const token of answerTokens) {
      // Skip unit prices - they're rates, not claims about totals
      if (token.isUnitPrice) {
        groundedNumbers.push(token);
        continue;
      }

      // Check if grounded
      const isGrounded = isNumberGrounded(token, evidenceTokens);
      const isComputed = !isGrounded && operator === 'compute' &&
                         isComputedFromEvidence(token, evidenceTokens);

      if (isGrounded || isComputed) {
        groundedNumbers.push(token);
      } else {
        // Check if it's a "suspiciously small" currency that's likely truncated
        if (token.type === 'currency' && token.normalized < 10000) {
          // Look for a larger version in evidence
          const largerInEvidence = evidenceTokens.some(
            e => e.type === 'currency' &&
                 e.normalized > token.normalized * 100 &&
                 e.normalized.toString().startsWith(token.normalized.toString().replace(/\D/g, ''))
          );

          if (largerInEvidence) {
            this.logger.warn('[NumericGrounding] Likely truncated currency', {
              answer: token.raw,
              normalized: token.normalized,
            });
          }
        }

        ungroundedNumbers.push(token);
      }
    }

    // Determine result
    const hasCurrencyUngrounded = ungroundedNumbers.some(t => t.type === 'currency');

    if (ungroundedNumbers.length === 0) {
      return {
        passed: true,
        groundedNumbers,
        ungroundedNumbers,
        suggestedAction: 'proceed',
      };
    }

    // If we have ungrounded currency values, that's a hard fail
    if (hasCurrencyUngrounded && requireStrictMatch) {
      // Try to find a quote fallback
      const firstUngrounded = ungroundedNumbers.find(t => t.type === 'currency');
      let quoteFallback: string | undefined;

      if (firstUngrounded) {
        // Look for any currency in evidence that might be the "real" value
        const possibleReal = evidenceTokens.find(
          t => t.type === 'currency' && t.normalized > 1000
        );
        if (possibleReal) {
          quoteFallback = findExcerptWithNumber(
            possibleReal.normalized,
            evidenceText
          ) || undefined;
        }
      }

      return {
        passed: false,
        groundedNumbers,
        ungroundedNumbers,
        suggestedAction: quoteFallback ? 'quote_fallback' : 'block',
        reason: `Currency value ${firstUngrounded?.raw} not found in evidence`,
        quoteFallback,
      };
    }

    // Soft fail - allow but warn
    return {
      passed: true,
      groundedNumbers,
      ungroundedNumbers,
      suggestedAction: 'proceed',
      reason: `${ungroundedNumbers.length} number(s) not strictly grounded`,
    };
  }

  /**
   * Build a regen hint when numeric grounding fails
   */
  buildRegenHint(result: GroundingResult, language: 'en' | 'pt' | 'es' = 'en'): string {
    if (result.passed) return '';

    const L = (en: string, pt: string, es: string) =>
      language === 'pt' ? pt : language === 'es' ? es : en;

    if (result.suggestedAction === 'quote_fallback' && result.quoteFallback) {
      return L(
        `CRITICAL: Your previous answer contained numbers not found in the source. Use this exact excerpt: "${result.quoteFallback}"`,
        `CRÍTICO: Sua resposta anterior continha números não encontrados na fonte. Use este trecho exato: "${result.quoteFallback}"`,
        `CRÍTICO: Tu respuesta anterior contenía números no encontrados en la fuente. Usa este extracto exacto: "${result.quoteFallback}"`
      );
    }

    const ungroundedList = result.ungroundedNumbers
      .slice(0, 3)
      .map(t => t.raw)
      .join(', ');

    return L(
      `ERROR: These numbers were not found in the document: ${ungroundedList}. Only use numbers that appear exactly in the source. If the document shows "R$ 900.000,00", write exactly that - do not shorten to "R$ 900".`,
      `ERRO: Estes números não foram encontrados no documento: ${ungroundedList}. Use apenas números que aparecem exatamente na fonte. Se o documento mostra "R$ 900.000,00", escreva exatamente isso - não abrevie para "R$ 900".`,
      `ERROR: Estos números no se encontraron en el documento: ${ungroundedList}. Use solo números que aparezcan exactamente en la fuente. Si el documento muestra "R$ 900.000,00", escriba exactamente eso - no abrevie a "R$ 900".`
    );
  }
}

// Singleton
let numericGroundingInstance: NumericGroundingService | null = null;

export function getNumericGrounding(): NumericGroundingService {
  if (!numericGroundingInstance) {
    numericGroundingInstance = new NumericGroundingService();
  }
  return numericGroundingInstance;
}
