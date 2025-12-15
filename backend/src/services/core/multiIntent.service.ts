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
}

class MultiIntentService {
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
      return {
        isMultiIntent: true,
        segments: validSegments.map(s => s.trim()),
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
