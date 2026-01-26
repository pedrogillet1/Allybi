const fs = require('fs');

const json = JSON.parse(fs.readFileSync('C:/Users/pedro/Downloads/koda_production_orchestration_v2/koda_25_categories_implementation/categories_parsed.json', 'utf-8'));

// Map category names to array names
const categoryToArrayName = {
  DOC_QA: 'DOC_QA_KEYWORDS',
  DOC_ANALYTICS: 'DOC_ANALYTICS_KEYWORDS',
  DOC_MANAGEMENT: 'DOC_MANAGEMENT_KEYWORDS',
  PREFERENCE_UPDATE: 'PREFERENCE_UPDATE_KEYWORDS',
  ANSWER_REWRITE: 'ANSWER_REWRITE_KEYWORDS',
  FEEDBACK_POSITIVE: 'FEEDBACK_POSITIVE_KEYWORDS',
  FEEDBACK_NEGATIVE: 'FEEDBACK_NEGATIVE_KEYWORDS',
  PRODUCT_HELP: 'PRODUCT_HELP_KEYWORDS',
  ONBOARDING_HELP: 'ONBOARDING_HELP_KEYWORDS',
  GENERIC_KNOWLEDGE: 'GENERIC_KNOWLEDGE_KEYWORDS',
  REASONING_TASK: 'REASONING_TASK_KEYWORDS',
  TEXT_TRANSFORM: 'TEXT_TRANSFORM_KEYWORDS',
  CHITCHAT: 'CHITCHAT_KEYWORDS',
  META_AI: 'META_AI_KEYWORDS',
  OUT_OF_SCOPE: 'OUT_OF_SCOPE_KEYWORDS',
  AMBIGUOUS: 'AMBIGUOUS_KEYWORDS'
};

const categoryToPatternArrayName = {
  DOC_QA: 'DOC_QA_PATTERNS',
  DOC_ANALYTICS: 'DOC_ANALYTICS_PATTERNS',
  DOC_MANAGEMENT: 'DOC_MANAGEMENT_PATTERNS',
  PREFERENCE_UPDATE: 'PREFERENCE_UPDATE_PATTERNS',
  ANSWER_REWRITE: 'ANSWER_REWRITE_PATTERNS',
  FEEDBACK_POSITIVE: 'FEEDBACK_POSITIVE_PATTERNS',
  FEEDBACK_NEGATIVE: 'FEEDBACK_NEGATIVE_PATTERNS',
  PRODUCT_HELP: 'PRODUCT_HELP_PATTERNS',
  ONBOARDING_HELP: 'ONBOARDING_HELP_PATTERNS',
  GENERIC_KNOWLEDGE: 'GENERIC_KNOWLEDGE_PATTERNS',
  REASONING_TASK: 'REASONING_TASK_PATTERNS',
  TEXT_TRANSFORM: 'TEXT_TRANSFORM_PATTERNS',
  CHITCHAT: 'CHITCHAT_PATTERNS',
  META_AI: 'META_AI_PATTERNS',
  OUT_OF_SCOPE: 'OUT_OF_SCOPE_PATTERNS',
  AMBIGUOUS: 'AMBIGUOUS_PATTERNS'
};

function extractKeywords(keywordsRaw) {
  return keywordsRaw
    .replace(/```/g, '')
    .replace(/```regex/g, '')
    .split(/[,\n]/)
    .map(k => k.trim().toLowerCase())
    .filter(k => k && k.length > 0 && !k.includes('---') && !k.startsWith('^'))
    .filter((v, i, a) => a.indexOf(v) === i); // Unique
}

function extractPatterns(patternsRaw) {
  return patternsRaw
    .replace(/```regex/g, '')
    .replace(/```/g, '')
    .split('\n')
    .map(p => p.trim())
    .filter(p => p.startsWith('^') && p.length > 3)
    .filter((v, i, a) => a.indexOf(v) === i); // Unique
}

let output = `/**
 * KODA PATTERN CLASSIFICATION ENGINE V2 - ENHANCED
 * Production-Ready Pattern-Based Intent Classification
 *
 * This is Layer 0 of the intent classification system.
 * It uses keywords and regex patterns to classify intents WITHOUT calling LLM.
 *
 * ENHANCED VERSION with ALL keywords from categories_parsed.json
 *
 * Generated: ${new Date().toISOString()}
 * Languages: EN, PT-BR, ES
 */

import {
  PrimaryIntent,
  KnowledgeSource,
  RAGMode,
  AnswerStyle,
  TargetDocumentScope,
  TemporalExpressionType,
  ContextPatternType,
  FallbackType,
  IntentClassification,
  ReasoningFlags,
  INTENT_REQUIRES_RAG,
  INTENT_REQUIRES_LLM,
  INTENT_KNOWLEDGE_SOURCE
} from '../types/intent.types';

// ============================================================================
// PATTERN MATCHING UTILITIES
// ============================================================================

/**
 * Normalize query for pattern matching
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/\\s+/g, ' ')
    .replace(/[\\u2018\\u2019]/g, "'")  // Smart quotes
    .replace(/[\\u201C\\u201D]/g, '"');
}

/**
 * Check if query contains any of the keywords
 */
function containsKeywords(query: string, keywords: string[]): boolean {
  const normalized = normalizeQuery(query);
  return keywords.some(keyword => {
    // Handle multi-word keywords (phrases)
    if (keyword.includes(' ')) {
      return normalized.includes(keyword.toLowerCase());
    }
    // Single word - use word boundary
    const pattern = new RegExp(\`\\\\b\${keyword.toLowerCase().replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')}\\\\b\`, 'i');
    return pattern.test(normalized);
  });
}

/**
 * Check if query matches any of the regex patterns
 */
function matchesPatterns(query: string, patterns: RegExp[]): RegExp | null {
  const normalized = normalizeQuery(query);
  for (const pattern of patterns) {
    if (pattern.test(normalized)) {
      return pattern;
    }
  }
  return null;
}

/**
 * Extract document name from query
 */
function extractDocumentName(query: string): string | null {
  const patterns = [
    /(?:no|do|from|in|en|del)\\s+(?:documento|arquivo|file|document|pdf|docx)\\s+["']?([^"'\\n]+)["']?/i,
    /(?:documento|arquivo|file|document)\\s+["']([^"']+)["']/i,
    /["']([^"']+\\.(?:pdf|docx|xlsx|pptx|txt|csv))["']?/i
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Extract folder name from query
 */
function extractFolderName(query: string): string | null {
  const patterns = [
    /(?:na|da|from|in|en|de la)\\s+(?:pasta|folder|carpeta)\\s+["']?([^"'\\n]+)["']?/i,
    /(?:pasta|folder|carpeta)\\s+["']([^"']+)["']/i
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

// ============================================================================
// KEYWORD DATABASES (Generated from categories_parsed.json - COMPLETE)
// ============================================================================

`;

// Generate keyword arrays
Object.keys(json).forEach(key => {
  const category = json[key];
  const name = category.name.split(' ')[0];
  const arrayName = categoryToArrayName[name];

  if (!arrayName) return;

  const keywords = extractKeywords(category.keywords || '');

  output += `const ${arrayName} = [\n`;
  // Format as 8 keywords per line
  for (let i = 0; i < keywords.length; i += 8) {
    const chunk = keywords.slice(i, i + 8).map(k => `'${k.replace(/'/g, "\\'")}'`);
    output += `  ${chunk.join(', ')}${i + 8 < keywords.length ? ',' : ''}\n`;
  }
  output += `];\n\n`;
});

output += `// ============================================================================
// REGEX PATTERN DATABASES (Generated from categories_parsed.json - COMPLETE)
// ============================================================================

`;

// Generate pattern arrays
Object.keys(json).forEach(key => {
  const category = json[key];
  const name = category.name.split(' ')[0];
  const patternArrayName = categoryToPatternArrayName[name];

  if (!patternArrayName) return;

  const patterns = extractPatterns(category.patterns || '');

  if (patterns.length > 0) {
    output += `const ${patternArrayName} = [\n`;
    patterns.forEach((p, i) => {
      // Escape backslashes for JS
      const escapedPattern = p.replace(/\\/g, '\\\\');
      output += `  /${escapedPattern}/i${i < patterns.length - 1 ? ',' : ''}\n`;
    });
    output += `];\n\n`;
  } else {
    output += `const ${patternArrayName}: RegExp[] = [];\n\n`;
  }
});

// Add the classification engine class
output += `// ============================================================================
// PATTERN CLASSIFICATION ENGINE
// ============================================================================

export class KodaPatternClassificationEngine {

  /**
   * Classify intent using pattern matching ONLY (no LLM)
   * Returns null if no confident pattern match found
   */
  public classifyByPatterns(
    query: string,
    conversationContext?: any
  ): IntentClassification | null {

    const startTime = Date.now();
    const normalized = normalizeQuery(query);

    // Try each intent category in priority order

    // 1. OUT_OF_SCOPE (highest priority for safety)
    if (this.matchesOutOfScope(normalized)) {
      return this.buildClassification(
        PrimaryIntent.OUT_OF_SCOPE,
        1.0,
        true,
        ['OUT_OF_SCOPE patterns'],
        this.getMatchedKeywords(normalized, OUT_OF_SCOPE_KEYWORDS),
        startTime
      );
    }

    // 2. CHITCHAT (greetings have high priority)
    if (this.matchesChitchat(normalized)) {
      return this.buildClassification(
        PrimaryIntent.CHITCHAT,
        0.95,
        true,
        ['CHITCHAT patterns'],
        this.getMatchedKeywords(normalized, CHITCHAT_KEYWORDS),
        startTime
      );
    }

    // 3. META_AI (questions about the AI)
    if (this.matchesMetaAI(normalized)) {
      return this.buildClassification(
        PrimaryIntent.META_AI,
        0.9,
        true,
        ['META_AI patterns'],
        this.getMatchedKeywords(normalized, META_AI_KEYWORDS),
        startTime
      );
    }

    // 4. FEEDBACK_POSITIVE
    if (this.matchesFeedbackPositive(normalized)) {
      return this.buildClassification(
        PrimaryIntent.FEEDBACK_POSITIVE,
        0.9,
        true,
        ['FEEDBACK_POSITIVE patterns'],
        this.getMatchedKeywords(normalized, FEEDBACK_POSITIVE_KEYWORDS),
        startTime
      );
    }

    // 5. FEEDBACK_NEGATIVE
    if (this.matchesFeedbackNegative(normalized)) {
      return this.buildClassification(
        PrimaryIntent.FEEDBACK_NEGATIVE,
        0.9,
        true,
        ['FEEDBACK_NEGATIVE patterns'],
        this.getMatchedKeywords(normalized, FEEDBACK_NEGATIVE_KEYWORDS),
        startTime
      );
    }

    // 6. PRODUCT_HELP (how to use Koda)
    if (this.matchesProductHelp(normalized)) {
      return this.buildClassification(
        PrimaryIntent.PRODUCT_HELP,
        0.9,
        true,
        ['PRODUCT_HELP patterns'],
        this.getMatchedKeywords(normalized, PRODUCT_HELP_KEYWORDS),
        startTime
      );
    }

    // 7. ONBOARDING_HELP (getting started)
    if (this.matchesOnboardingHelp(normalized)) {
      return this.buildClassification(
        PrimaryIntent.ONBOARDING_HELP,
        0.9,
        true,
        ['ONBOARDING_HELP patterns'],
        this.getMatchedKeywords(normalized, ONBOARDING_HELP_KEYWORDS),
        startTime
      );
    }

    // 8. DOC_ANALYTICS (counts and lists)
    if (this.matchesDocAnalytics(normalized)) {
      return this.buildClassification(
        PrimaryIntent.DOC_ANALYTICS,
        0.9,
        true,
        ['DOC_ANALYTICS patterns'],
        this.getMatchedKeywords(normalized, DOC_ANALYTICS_KEYWORDS),
        startTime
      );
    }

    // 9. DOC_MANAGEMENT (document actions)
    if (this.matchesDocManagement(normalized)) {
      return this.buildClassification(
        PrimaryIntent.DOC_MANAGEMENT,
        0.85,
        true,
        ['DOC_MANAGEMENT patterns'],
        this.getMatchedKeywords(normalized, DOC_MANAGEMENT_KEYWORDS),
        startTime
      );
    }

    // 10. PREFERENCE_UPDATE
    if (this.matchesPreferenceUpdate(normalized)) {
      return this.buildClassification(
        PrimaryIntent.PREFERENCE_UPDATE,
        0.85,
        true,
        ['PREFERENCE_UPDATE patterns'],
        this.getMatchedKeywords(normalized, PREFERENCE_UPDATE_KEYWORDS),
        startTime
      );
    }

    // 11. ANSWER_REWRITE
    if (this.matchesAnswerRewrite(normalized)) {
      return this.buildClassification(
        PrimaryIntent.ANSWER_REWRITE,
        0.85,
        true,
        ['ANSWER_REWRITE patterns'],
        this.getMatchedKeywords(normalized, ANSWER_REWRITE_KEYWORDS),
        startTime
      );
    }

    // 12. TEXT_TRANSFORM
    if (this.matchesTextTransform(normalized)) {
      return this.buildClassification(
        PrimaryIntent.TEXT_TRANSFORM,
        0.8,
        true,
        ['TEXT_TRANSFORM patterns'],
        this.getMatchedKeywords(normalized, TEXT_TRANSFORM_KEYWORDS),
        startTime
      );
    }

    // 13. REASONING_TASK
    if (this.matchesReasoningTask(normalized)) {
      return this.buildClassification(
        PrimaryIntent.REASONING_TASK,
        0.8,
        true,
        ['REASONING_TASK patterns'],
        this.getMatchedKeywords(normalized, REASONING_TASK_KEYWORDS),
        startTime
      );
    }

    // 14. GENERIC_KNOWLEDGE (world facts - check before DOC_QA)
    if (this.matchesGenericKnowledge(normalized)) {
      return this.buildClassification(
        PrimaryIntent.GENERIC_KNOWLEDGE,
        0.75,
        true,
        ['GENERIC_KNOWLEDGE patterns'],
        this.getMatchedKeywords(normalized, GENERIC_KNOWLEDGE_KEYWORDS),
        startTime
      );
    }

    // 15. DOC_QA (default for document questions)
    if (this.matchesDocQA(normalized)) {
      return this.buildClassification(
        PrimaryIntent.DOC_QA,
        0.7,
        true,
        ['DOC_QA patterns'],
        this.getMatchedKeywords(normalized, DOC_QA_KEYWORDS),
        startTime
      );
    }

    // 16. AMBIGUOUS (too short or vague)
    if (this.matchesAmbiguous(normalized)) {
      return this.buildClassification(
        PrimaryIntent.AMBIGUOUS,
        0.9,
        true,
        ['AMBIGUOUS patterns'],
        this.getMatchedKeywords(normalized, AMBIGUOUS_KEYWORDS),
        startTime
      );
    }

    // No pattern matched - return null to trigger LLM classification
    return null;
  }

  // ============================================================================
  // HELPER: Get matched keywords
  // ============================================================================

  private getMatchedKeywords(query: string, keywords: string[]): string[] {
    const normalized = normalizeQuery(query);
    return keywords.filter(keyword => {
      if (keyword.includes(' ')) {
        return normalized.includes(keyword.toLowerCase());
      }
      const pattern = new RegExp(\`\\\\b\${keyword.toLowerCase().replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')}\\\\b\`, 'i');
      return pattern.test(normalized);
    }).slice(0, 10); // Return max 10 matched keywords
  }

  // ============================================================================
  // PATTERN MATCHING METHODS
  // ============================================================================

  private matchesOutOfScope(query: string): boolean {
    return containsKeywords(query, OUT_OF_SCOPE_KEYWORDS) ||
           matchesPatterns(query, OUT_OF_SCOPE_PATTERNS) !== null;
  }

  private matchesChitchat(query: string): boolean {
    // Short greetings need exact match
    if (query.length < 15) {
      return containsKeywords(query, CHITCHAT_KEYWORDS) ||
             matchesPatterns(query, CHITCHAT_PATTERNS) !== null;
    }
    return matchesPatterns(query, CHITCHAT_PATTERNS) !== null;
  }

  private matchesMetaAI(query: string): boolean {
    return containsKeywords(query, META_AI_KEYWORDS) ||
           matchesPatterns(query, META_AI_PATTERNS) !== null;
  }

  private matchesFeedbackPositive(query: string): boolean {
    return containsKeywords(query, FEEDBACK_POSITIVE_KEYWORDS) ||
           (FEEDBACK_POSITIVE_PATTERNS.length > 0 && matchesPatterns(query, FEEDBACK_POSITIVE_PATTERNS) !== null);
  }

  private matchesFeedbackNegative(query: string): boolean {
    return containsKeywords(query, FEEDBACK_NEGATIVE_KEYWORDS) ||
           (FEEDBACK_NEGATIVE_PATTERNS.length > 0 && matchesPatterns(query, FEEDBACK_NEGATIVE_PATTERNS) !== null);
  }

  private matchesProductHelp(query: string): boolean {
    return containsKeywords(query, PRODUCT_HELP_KEYWORDS) ||
           matchesPatterns(query, PRODUCT_HELP_PATTERNS) !== null;
  }

  private matchesOnboardingHelp(query: string): boolean {
    return containsKeywords(query, ONBOARDING_HELP_KEYWORDS) ||
           (ONBOARDING_HELP_PATTERNS.length > 0 && matchesPatterns(query, ONBOARDING_HELP_PATTERNS) !== null);
  }

  private matchesDocAnalytics(query: string): boolean {
    return containsKeywords(query, DOC_ANALYTICS_KEYWORDS) ||
           matchesPatterns(query, DOC_ANALYTICS_PATTERNS) !== null;
  }

  private matchesDocManagement(query: string): boolean {
    return containsKeywords(query, DOC_MANAGEMENT_KEYWORDS) ||
           matchesPatterns(query, DOC_MANAGEMENT_PATTERNS) !== null;
  }

  private matchesPreferenceUpdate(query: string): boolean {
    return containsKeywords(query, PREFERENCE_UPDATE_KEYWORDS) ||
           matchesPatterns(query, PREFERENCE_UPDATE_PATTERNS) !== null;
  }

  private matchesAnswerRewrite(query: string): boolean {
    return containsKeywords(query, ANSWER_REWRITE_KEYWORDS) ||
           matchesPatterns(query, ANSWER_REWRITE_PATTERNS) !== null;
  }

  private matchesTextTransform(query: string): boolean {
    return containsKeywords(query, TEXT_TRANSFORM_KEYWORDS) ||
           matchesPatterns(query, TEXT_TRANSFORM_PATTERNS) !== null;
  }

  private matchesReasoningTask(query: string): boolean {
    return containsKeywords(query, REASONING_TASK_KEYWORDS) ||
           matchesPatterns(query, REASONING_TASK_PATTERNS) !== null;
  }

  private matchesGenericKnowledge(query: string): boolean {
    // Generic knowledge needs stronger signals - check for "who is" patterns without doc context
    const hasDocContext = /document|arquivo|archivo|file|pdf|my files|meus arquivos|mis archivos/i.test(query);
    if (hasDocContext) return false;

    return containsKeywords(query, GENERIC_KNOWLEDGE_KEYWORDS) ||
           matchesPatterns(query, GENERIC_KNOWLEDGE_PATTERNS) !== null;
  }

  private matchesDocQA(query: string): boolean {
    return containsKeywords(query, DOC_QA_KEYWORDS) ||
           matchesPatterns(query, DOC_QA_PATTERNS) !== null;
  }

  private matchesAmbiguous(query: string): boolean {
    return query.length < 6 ||
           (containsKeywords(query, AMBIGUOUS_KEYWORDS) && query.length < 20);
  }

  // ============================================================================
  // CLASSIFICATION BUILDER
  // ============================================================================

  private buildClassification(
    intent: PrimaryIntent,
    confidence: number,
    wasClassifiedByRules: boolean,
    matchedPatterns: string[],
    matchedKeywords: string[],
    startTime: number
  ): IntentClassification {

    const requiresRAG = INTENT_REQUIRES_RAG[intent];
    const requiresLLM = INTENT_REQUIRES_LLM[intent];
    const knowledgeSource = INTENT_KNOWLEDGE_SOURCE[intent];

    return {
      primaryIntent: intent,
      confidence,
      wasClassifiedByRules,
      requiresLLMIntent: false,  // Pattern matched, no LLM needed for intent
      requiresRAG,
      requiresLLM,
      knowledgeSource,
      ragMode: requiresRAG ? RAGMode.FULL_RAG : RAGMode.NO_RAG,
      targetDocumentScope: TargetDocumentScope.ALL_DOCUMENTS,
      answerStyle: this.determineAnswerStyle(intent),
      reasoningFlags: this.determineReasoningFlags(intent),
      entities: {
        keywords: matchedKeywords
      },
      matchedPatterns,
      matchedKeywords,
      classificationTimeMs: Date.now() - startTime
    };
  }

  private determineAnswerStyle(intent: PrimaryIntent): AnswerStyle {
    switch (intent) {
      case PrimaryIntent.DOC_QA:
        return AnswerStyle.FACTUAL_SHORT;
      case PrimaryIntent.DOC_ANALYTICS:
        return AnswerStyle.STRUCTURED_LIST;
      case PrimaryIntent.PRODUCT_HELP:
      case PrimaryIntent.ONBOARDING_HELP:
        return AnswerStyle.INSTRUCTIONAL_STEPS;
      case PrimaryIntent.CHITCHAT:
        return AnswerStyle.DIALOGUE_CHITCHAT;
      default:
        return AnswerStyle.EXPLANATORY_PARAGRAPH;
    }
  }

  private determineReasoningFlags(intent: PrimaryIntent): ReasoningFlags {
    return {
      requiresNumericReasoning: intent === PrimaryIntent.REASONING_TASK || intent === PrimaryIntent.DOC_ANALYTICS,
      requiresComparison: false,
      requiresTimeline: false,
      requiresExtraction: intent === PrimaryIntent.DOC_QA,
      requiresMemoryWrite: intent === PrimaryIntent.PREFERENCE_UPDATE
    };
  }
}

// Export singleton instance
export const kodaPatternEngine = new KodaPatternClassificationEngine();
`;

// Write the output
fs.writeFileSync('C:/Users/pedro/Downloads/koda-implementation-v2-FOUNDATION/koda-new-implementation/services/kodaPatternClassification.service.ENHANCED.ts', output);

console.log('Generated ENHANCED pattern classification service!');
console.log(`Output: C:/Users/pedro/Downloads/koda-implementation-v2-FOUNDATION/koda-new-implementation/services/kodaPatternClassification.service.ENHANCED.ts`);
