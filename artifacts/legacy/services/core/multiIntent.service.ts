/**
 * Multi-Intent Detection Service
 *
 * Detects when a user query contains multiple distinct intents
 * that should be handled separately.
 */

import { IntentClassificationV3 } from '../../types/ragV3.types';

export interface MultiIntentResult {
  isMultiIntent: boolean;
  segments: string[];
  intents?: IntentClassificationV3[];
  formatConstraints?: string[]; // Extracted formatting instructions (not separate intents)
}

class MultiIntentService {
  // FORMAT-ONLY SUFFIXES: These are NOT separate intents - they modify HOW to format the response
  // When detected, they should be extracted as formatConstraints, not treated as separate segments
  private readonly formatOnlyPatterns = [
    // Numbered/list formatting
    /^(keep|make|leave)\s+(it|them|this)\s+(numbered|a\s+list|bulleted|as\s+bullets)/i,
    /^(numbered|bullet|bulleted)\s+(list|points?|format)/i,
    /^(as|in)\s+(a\s+)?(numbered\s+list|bullet\s+points?|list\s+form)/i,
    /^(list|number)\s+(them|it|these)/i,
    // Length/brevity constraints
    /^(keep|make)\s+(it|this|them)\s+(short|brief|concise)/i,
    /^(short|brief)\s+(answer|response|version)/i,
    /^(no|don'?t)\s+(explain|elaborate|details?)/i,
    /^(just|only)\s+(the\s+)?(answer|result|list|names?|files?|button)/i,
    // Style constraints
    /^(no|don'?t\s+use|without)\s+(emojis?|icons?)/i,
    /^(use|with)\s+(markdown|plain\s+text)/i,
    /^(simple|plain)\s+(format|text|output)/i,
    // Portuguese equivalents
    /^(mantenha|deixa|faz)\s+(numerado|em\s+lista)/i,
    /^(lista\s+)?numerada/i,
    /^(sem|não\s+use)\s+(emoji|explicação)/i,
    /^(resposta\s+)?(curta|breve)/i,
    // Spanish equivalents
    /^(mantenlo|hazlo|déjalo)\s+(numerado|en\s+lista)/i,
    /^(sin|no\s+uses)\s+(emojis?|explicación)/i,
    /^(respuesta\s+)?(corta|breve)/i,
  ];

  // Delimiters that separate intents - ordered from most specific to least specific
  // to avoid false splits on common conjunctions
  private readonly delimiterPatterns = [
    // Most specific - explicit multi-command patterns
    / and also /i,
    / and then /i,
    / then also /i,
    /, then /i,
    /, and /i,
    // Portuguese specific
    / e também /i,
    / e depois /i,
    / depois também /i,
    /, depois /i,
    /, e /i,
    // Spanish specific
    / y también /i,
    / y luego /i,
    / luego también /i,
    /, después /i,
    /, y /i,
    // Generic - semicolon is a strong separator
    /; /,
    // Less specific - only split on " and " if segments are substantial
    / and (?=\w{4,})/i,
    / e (?=\w{4,})/i,
    / y (?=\w{4,})/i,
  ];

  /**
   * Detect if query contains multiple intents by analyzing delimiters and structure.
   *
   * @param query - The raw user query
   * @returns MultiIntentResult with segments if multi-intent detected
   */
  public detect(query: string): MultiIntentResult {
    if (!query || query.trim().length === 0) {
      return { isMultiIntent: false, segments: [] };
    }

    const normalizedQuery = query.trim();

    // Minimum query length relaxed to 10 chars - allows short multi-commands like "a; b"
    // This handles queries like "list docs; summarize" which are valid multi-intents
    if (normalizedQuery.length < 10) {
      return { isMultiIntent: false, segments: [normalizedQuery] };
    }

    // SKIP multi-intent for comparison/contrast queries
    // "Compare X and Y" should NOT be split - the "and" connects items to compare
    const comparisonPatterns = [
      /^compare\s/i,
      /^contrast\s/i,
      /^difference\s+between\s/i,
      /^what.+difference\s+between\s/i,
      /^how\s+(does?|do|is|are)\s.+compare/i,
      /\bvs\.?\s/i,
      /\bversus\s/i,
    ];
    if (comparisonPatterns.some(p => p.test(normalizedQuery))) {
      return { isMultiIntent: false, segments: [normalizedQuery] };
    }

    // SKIP multi-intent for synthesis/analysis queries
    // "Considering X and Y, how would you..." should NOT be split - it's a single synthesis request
    // These patterns detect compound analysis requests where "and/e/y" connects related concepts
    const synthesisPatterns = [
      // "Considering X and Y" patterns (EN/PT/ES)
      /^(considering|considerando|teniendo\s+en\s+cuenta)\s+\w+\s+(and|e|y)\s+\w+/i,
      // "Tell me X and how you would Y" patterns
      /\b(diga|tell|me\s+d[êia])\s+.{5,50}\s+(and|e|y)\s+(como|how|c[oó]mo)\b/i,
      // "What are X and Y" / "List X and Y" compound list requests
      /^(what\s+are|quais\s+s[aã]o|cuáles\s+son|list|listar)\s+.{3,30}\s+(and|e|y)\s+/i,
      // "X and how to mitigate/resolve/address them" patterns
      /\b(desafios?|challenges?|riscos?|risks?|problemas?|problems?)\s+(and|e|y)\s+(como|how|c[oó]mo)\s+.{0,30}(mitig|resolv|address|trat|soluc)/i,
      // "Based on X and Y" / "Considering X and Y" synthesis
      /^(based\s+on|baseado\s+em|con\s+base\s+en)\s+.{5,40}\s+(and|e|y)\s+/i,
      // "How would you structure/organize X and Y" patterns
      /\b(como\s+(você|voce)|how\s+would\s+you)\s+.{0,20}(estrutur|organiz|structure|organize)/i,
      // "In X lines/bullets" formatting suffix should not split
      /\b(em|in)\s+\d+\s+(linhas?|lines?|bullets?|pontos?|frases?)\b/i,
      // PT: "me diga" + "e como" pattern
      /\bme\s+dig[ao]\s+.{5,40}\s+e\s+como\b/i,
    ];
    if (synthesisPatterns.some(p => p.test(normalizedQuery))) {
      console.log(`[MultiIntent] Synthesis pattern detected, skipping split for: "${normalizedQuery.substring(0, 50)}..."`);
      return { isMultiIntent: false, segments: [normalizedQuery] };
    }

    // Try to split by delimiters
    const segments = this.splitByDelimiters(normalizedQuery);

    // Filter out very short segments - require at least 8 chars OR 2+ words for meaningful intent
    // This prevents splitting compound phrases like "search and rescue"
    const validSegments = segments.filter(s => {
      const trimmed = s.trim();
      const wordCount = trimmed.split(/\s+/).length;
      // Segment must be either: 8+ chars OR have 2+ words
      return trimmed.length >= 8 || wordCount >= 2;
    });

    if (validSegments.length > 1) {
      // CRITICAL FIX: Separate format-only suffixes from actual intents
      // "group by folder and keep it numbered" should NOT be multi-intent
      // "keep it numbered" is a formatting constraint, not a separate intent
      const contentSegments: string[] = [];
      const formatConstraints: string[] = [];

      for (const segment of validSegments) {
        if (this.isFormatOnlySuffix(segment)) {
          formatConstraints.push(segment.trim());
          console.log(`[MultiIntent] Format-only suffix detected: "${segment}" (not a separate intent)`);
        } else {
          contentSegments.push(segment.trim());
        }
      }

      // Only treat as multi-intent if there are 2+ CONTENT segments
      if (contentSegments.length > 1) {
        return {
          isMultiIntent: true,
          segments: contentSegments,
          formatConstraints: formatConstraints.length > 0 ? formatConstraints : undefined,
        };
      }

      // Single content segment with format constraint(s) → NOT multi-intent
      // Merge the format constraint back into the main segment
      if (contentSegments.length === 1 && formatConstraints.length > 0) {
        console.log(`[MultiIntent] Merging format constraints into single segment`);
        return {
          isMultiIntent: false,
          segments: [normalizedQuery], // Return full original query
          formatConstraints,
        };
      }

      // Edge case: all segments are format-only (shouldn't happen, but handle gracefully)
      if (contentSegments.length === 0) {
        return { isMultiIntent: false, segments: [normalizedQuery] };
      }

      return {
        isMultiIntent: true,
        segments: contentSegments,
        formatConstraints: formatConstraints.length > 0 ? formatConstraints : undefined,
      };
    }

    return { isMultiIntent: false, segments: [normalizedQuery] };
  }

  /**
   * Split query by intent delimiters, respecting quotes and parentheses.
   */
  private splitByDelimiters(query: string): string[] {
    let workingQuery = query;

    // Protect quoted strings by replacing them temporarily
    const quotedStrings: string[] = [];
    workingQuery = workingQuery.replace(/["']([^"']+)["']/g, (match) => {
      quotedStrings.push(match);
      return `__QUOTED_${quotedStrings.length - 1}__`;
    });

    // Split by each delimiter pattern
    for (const pattern of this.delimiterPatterns) {
      const parts = workingQuery.split(pattern);
      if (parts.length > 1 && parts.every(p => p.trim().length >= 5)) {
        // Restore quoted strings
        const restored = parts.map(part => {
          return part.replace(/__QUOTED_(\d+)__/g, (_, idx) => quotedStrings[parseInt(idx)]);
        });
        return restored.map(s => s.trim());
      }
    }

    // Restore quoted strings for single segment
    workingQuery = workingQuery.replace(/__QUOTED_(\d+)__/g, (_, idx) => quotedStrings[parseInt(idx)]);

    return [workingQuery.trim()];
  }

  /**
   * Check if a segment is a format-only instruction (not a separate intent).
   * Examples: "keep it numbered", "bullet points", "short answer", "no emojis"
   */
  private isFormatOnlySuffix(segment: string): boolean {
    const trimmed = segment.trim();

    // Check against all format-only patterns
    for (const pattern of this.formatOnlyPatterns) {
      if (pattern.test(trimmed)) {
        return true;
      }
    }

    // Additional heuristics for very short format-like segments
    // that might not match exact patterns
    const lowerTrimmed = trimmed.toLowerCase();

    // Very short format instructions (less than 25 chars)
    if (trimmed.length < 25) {
      const shortFormatPhrases = [
        'numbered', 'in a list', 'as list', 'bullet', 'short', 'brief',
        'no emoji', 'no emojis', 'plain text', 'just names', 'just files',
        'only names', 'only files', 'numerado', 'em lista', 'sem emoji',
        'curto', 'breve', 'solo nombres', 'sin emoji'
      ];

      if (shortFormatPhrases.some(phrase => lowerTrimmed.includes(phrase))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Merge multiple intent results into a coherent multi-intent structure.
   */
  public mergeIntents(intents: IntentClassificationV3[]): MultiIntentResult {
    if (intents.length === 0) {
      return { isMultiIntent: false, segments: [] };
    }

    if (intents.length === 1) {
      return {
        isMultiIntent: false,
        segments: [intents[0].rawQuery || ''],
        intents,
      };
    }

    // Check if all intents are the same primary type
    const primaryTypes = new Set(intents.map(i => i.primaryIntent));

    return {
      isMultiIntent: primaryTypes.size > 1,
      segments: intents.map(i => i.rawQuery || '').filter(s => s.length > 0),
      intents,
    };
  }
}

// Singleton removed - use container.getMultiIntent() instead
export { MultiIntentService };
export default MultiIntentService;
