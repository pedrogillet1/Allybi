/**
 * Coherence Gate Service
 *
 * POST-GENERATION VALIDATION: Ensures answer quality and consistency.
 *
 * ChatGPT-quality requires that:
 * 1. Answers directly address the question (no topic drift)
 * 2. No internal contradictions in the answer
 * 3. No mixing of unrelated document topics
 * 4. Consistent with prior turn context
 *
 * This gate runs AFTER answer generation as a quality check.
 */

export interface CoherenceCheckResult {
  isCoherent: boolean;
  issues: CoherenceIssue[];
  overallScore: number;              // 0-1 overall coherence score
  shouldRegenerate: boolean;         // If true, answer is too broken to use
  suggestedFixes: string[];          // Specific things to fix in regeneration
}

export interface CoherenceIssue {
  type: 'topic_drift' | 'contradiction' | 'doc_mixing' | 'context_mismatch' | 'format_mismatch';
  severity: 'low' | 'medium' | 'high';
  description: string;
  location?: string;                 // Where in the answer the issue occurs
}

interface CoherenceGateConfig {
  logger?: Pick<Console, 'info' | 'warn' | 'debug'>;
}

/**
 * Patterns that indicate topic drift (answer not about the question)
 */
const TOPIC_DRIFT_INDICATORS = {
  // Answer starts with unrelated topic
  unrelatedOpeners: [
    /^(As an? (AI|assistant|language model)|I('m| am) (a|an) AI)/i,
    /^(Here('s| is) (a|an) (general|broad) overview)/i,
    /^(In general,|Generally speaking,|Broadly,)/i,
  ],
  // Answer discusses topics not in the question
  tangentialPhrases: [
    /\b(by the way|incidentally|speaking of which)\b/i,
    /\b(on a related note|this reminds me)\b/i,
    /\b(while we're (at it|on the topic))\b/i,
  ],
};

/**
 * Patterns that indicate internal contradictions
 */
const CONTRADICTION_PATTERNS = [
  // Direct contradictions
  { pattern: /\byes\b.*\bno\b.*\bactually\b/i, type: 'yes_no_flip' },
  { pattern: /\bis (\w+)\b.*\bis not \1\b/i, type: 'is_not' },
  { pattern: /\b(\d+(?:[.,]\d+)?)\s*(percent|%).*\b(?!\1)(\d+(?:[.,]\d+)?)\s*(percent|%)/i, type: 'number_mismatch' },
  // Hedging then asserting
  { pattern: /\b(might be|could be|possibly)\b.*\b(definitely|certainly|absolutely)\b/i, type: 'hedge_assert' },
];

/**
 * Patterns that indicate document mixing (cross-contamination)
 */
const DOC_MIXING_INDICATORS = [
  // Multiple document references without clear separation
  /\b(document|file|arquivo)\s+\w+\b.*\band\s+(another|the other)\s+(document|file|arquivo)\b/i,
  // Mixing topics from different domains without transition
  /\b(contract|contrato)\b.*\b(medical|médico|diagnosis|diagnóstico)\b/i,
  /\b(financial|financeiro)\b.*\b(legal|jurídico)\b(?!.*\b(implications|implicações)\b)/i,
];

/**
 * Format expectations based on question type
 */
const FORMAT_EXPECTATIONS: { pattern: RegExp; expectedFormat: string; checkFn: (answer: string) => boolean }[] = [
  {
    pattern: /\b(list|liste|enumere|enumerate)\b.*\b(\d+)\s*(items?|itens?|things?|coisas?|points?|pontos?)\b/i,
    expectedFormat: 'numbered_list',
    checkFn: (answer) => /^\s*\d+[\.\)]/m.test(answer),
  },
  {
    pattern: /\b(bullet|bullets?|pontos?)\s*(points?|list)\b/i,
    expectedFormat: 'bullet_list',
    checkFn: (answer) => /^\s*[-•*]/m.test(answer),
  },
  {
    pattern: /\b(yes or no|sim ou não|true or false|verdadeiro ou falso)\b/i,
    expectedFormat: 'boolean_answer',
    checkFn: (answer) => /^(yes|no|sim|não|true|false|verdadeiro|falso)\b/i.test(answer.trim()),
  },
  {
    pattern: /\b(how (much|many)|quanto|quantos?)\b/i,
    expectedFormat: 'numeric_answer',
    checkFn: (answer) => /\b\d+(?:[.,]\d+)?\b/.test(answer),
  },
];

export class CoherenceGateService {
  private logger: Pick<Console, 'info' | 'warn' | 'debug'>;

  constructor(config: CoherenceGateConfig = {}) {
    this.logger = config.logger || console;
  }

  /**
   * Main entry point: Check if the generated answer is coherent
   */
  checkCoherence(
    query: string,
    answer: string,
    language: string,
    priorContext?: { lastQuestion?: string; lastAnswer?: string }
  ): CoherenceCheckResult {
    const issues: CoherenceIssue[] = [];

    // Step 1: Check for topic drift
    const driftIssues = this.checkTopicDrift(query, answer);
    issues.push(...driftIssues);

    // Step 2: Check for internal contradictions
    const contradictionIssues = this.checkContradictions(answer);
    issues.push(...contradictionIssues);

    // Step 3: Check for document mixing
    const mixingIssues = this.checkDocumentMixing(answer);
    issues.push(...mixingIssues);

    // Step 4: Check format expectations
    const formatIssues = this.checkFormatExpectations(query, answer);
    issues.push(...formatIssues);

    // Step 5: Check context consistency (if prior context provided)
    if (priorContext) {
      const contextIssues = this.checkContextConsistency(query, answer, priorContext);
      issues.push(...contextIssues);
    }

    // Calculate overall score
    const overallScore = this.calculateScore(issues);
    const shouldRegenerate = overallScore < 0.3 || issues.some(i => i.severity === 'high');

    // Generate suggested fixes
    const suggestedFixes = this.generateSuggestedFixes(issues, language);

    const result: CoherenceCheckResult = {
      isCoherent: issues.filter(i => i.severity !== 'low').length === 0,
      issues,
      overallScore,
      shouldRegenerate,
      suggestedFixes,
    };

    this.logger.debug('[CoherenceGate] Check result', {
      query: query.substring(0, 50),
      issueCount: issues.length,
      overallScore,
      shouldRegenerate,
    });

    return result;
  }

  /**
   * Check for topic drift - answer not addressing the question
   */
  private checkTopicDrift(query: string, answer: string): CoherenceIssue[] {
    const issues: CoherenceIssue[] = [];

    // Check for generic AI opener
    for (const pattern of TOPIC_DRIFT_INDICATORS.unrelatedOpeners) {
      if (pattern.test(answer)) {
        issues.push({
          type: 'topic_drift',
          severity: 'medium',
          description: 'Answer starts with generic AI-style opener instead of addressing the question directly',
          location: 'opening',
        });
        break;
      }
    }

    // Check for tangential phrases
    for (const pattern of TOPIC_DRIFT_INDICATORS.tangentialPhrases) {
      if (pattern.test(answer)) {
        issues.push({
          type: 'topic_drift',
          severity: 'low',
          description: 'Answer contains tangential content',
          location: 'body',
        });
        break;
      }
    }

    // Check if key query terms are addressed in answer
    const queryKeywords = this.extractKeywords(query);
    const answerLower = answer.toLowerCase();
    const missingKeywords = queryKeywords.filter(kw => !answerLower.includes(kw.toLowerCase()));

    if (missingKeywords.length > queryKeywords.length * 0.5 && queryKeywords.length > 2) {
      issues.push({
        type: 'topic_drift',
        severity: 'medium',
        description: `Answer may not address the question - missing key terms: ${missingKeywords.slice(0, 3).join(', ')}`,
        location: 'content',
      });
    }

    return issues;
  }

  /**
   * Check for internal contradictions
   */
  private checkContradictions(answer: string): CoherenceIssue[] {
    const issues: CoherenceIssue[] = [];

    for (const { pattern, type } of CONTRADICTION_PATTERNS) {
      if (pattern.test(answer)) {
        issues.push({
          type: 'contradiction',
          severity: 'medium',
          description: `Potential internal contradiction detected: ${type}`,
          location: 'body',
        });
      }
    }

    return issues;
  }

  /**
   * Check for document mixing / cross-contamination
   */
  private checkDocumentMixing(answer: string): CoherenceIssue[] {
    const issues: CoherenceIssue[] = [];

    for (const pattern of DOC_MIXING_INDICATORS) {
      if (pattern.test(answer)) {
        issues.push({
          type: 'doc_mixing',
          severity: 'high',
          description: 'Answer may be mixing content from unrelated documents',
          location: 'body',
        });
        break; // One is enough
      }
    }

    return issues;
  }

  /**
   * Check format expectations (lists, yes/no, numbers)
   */
  private checkFormatExpectations(query: string, answer: string): CoherenceIssue[] {
    const issues: CoherenceIssue[] = [];

    for (const { pattern, expectedFormat, checkFn } of FORMAT_EXPECTATIONS) {
      if (pattern.test(query) && !checkFn(answer)) {
        issues.push({
          type: 'format_mismatch',
          severity: 'low',
          description: `Question expects ${expectedFormat} but answer may not match`,
          location: 'format',
        });
      }
    }

    return issues;
  }

  /**
   * Check consistency with prior context
   */
  private checkContextConsistency(
    query: string,
    answer: string,
    priorContext: { lastQuestion?: string; lastAnswer?: string }
  ): CoherenceIssue[] {
    const issues: CoherenceIssue[] = [];

    // Check if this is a follow-up that references "it" or "that"
    const hasReference = /\b(it|this|that|the same|esse|este|isso|aquele)\b/i.test(query);

    if (hasReference && priorContext.lastAnswer) {
      // Extract key entities from prior answer
      const priorEntities = this.extractEntities(priorContext.lastAnswer);
      const currentEntities = this.extractEntities(answer);

      // If completely different entities, might be context mismatch
      const overlap = priorEntities.filter(e => currentEntities.includes(e));
      if (priorEntities.length > 0 && overlap.length === 0) {
        issues.push({
          type: 'context_mismatch',
          severity: 'medium',
          description: 'Follow-up answer may not be consistent with prior context',
          location: 'context',
        });
      }
    }

    return issues;
  }

  /**
   * Extract keywords from text (simple implementation)
   */
  private extractKeywords(text: string): string[] {
    // Remove common words and extract significant terms
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'shall', 'need', 'dare',
      'o', 'a', 'os', 'as', 'um', 'uma', 'é', 'são', 'foi', 'foram',
      'what', 'where', 'when', 'who', 'how', 'why', 'which',
      'que', 'onde', 'quando', 'quem', 'como', 'por que', 'qual',
      'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
      'em', 'no', 'na', 'de', 'da', 'do', 'com', 'por', 'para',
      'and', 'or', 'but', 'if', 'then', 'e', 'ou', 'mas', 'se',
      'my', 'your', 'his', 'her', 'its', 'our', 'their',
      'meu', 'minha', 'seu', 'sua', 'nosso', 'nossa',
      'this', 'that', 'these', 'those', 'esse', 'esta', 'esses', 'essas',
      'i', 'you', 'he', 'she', 'it', 'we', 'they',
      'eu', 'você', 'ele', 'ela', 'nós', 'eles', 'elas',
      'me', 'about', 'sobre',
    ]);

    const words = text.toLowerCase().match(/\b[a-záéíóúàèìòùâêîôûãõç]{3,}\b/gi) || [];
    return words.filter(w => !stopWords.has(w.toLowerCase()));
  }

  /**
   * Extract entities (proper nouns, numbers, etc.)
   */
  private extractEntities(text: string): string[] {
    const entities: string[] = [];

    // Proper nouns (capitalized words)
    const properNouns = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    entities.push(...properNouns.map(n => n.toLowerCase()));

    // Numbers with context
    const numbers = text.match(/\b\d+(?:[.,]\d+)?(?:\s*%|R\$|\$|€|£)?\b/g) || [];
    entities.push(...numbers);

    // Quoted text
    const quotes = text.match(/"[^"]+"/g) || [];
    entities.push(...quotes.map(q => q.toLowerCase()));

    return [...new Set(entities)];
  }

  /**
   * Calculate overall coherence score
   */
  private calculateScore(issues: CoherenceIssue[]): number {
    if (issues.length === 0) return 1.0;

    let score = 1.0;
    for (const issue of issues) {
      switch (issue.severity) {
        case 'high':
          score -= 0.3;
          break;
        case 'medium':
          score -= 0.15;
          break;
        case 'low':
          score -= 0.05;
          break;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Generate suggested fixes for regeneration
   */
  private generateSuggestedFixes(issues: CoherenceIssue[], language: string): string[] {
    const fixes: string[] = [];

    for (const issue of issues) {
      switch (issue.type) {
        case 'topic_drift':
          fixes.push(language === 'pt'
            ? 'Responda diretamente à pergunta sem introduções genéricas'
            : 'Answer the question directly without generic introductions');
          break;
        case 'contradiction':
          fixes.push(language === 'pt'
            ? 'Evite afirmações contraditórias na resposta'
            : 'Avoid contradictory statements in the answer');
          break;
        case 'doc_mixing':
          fixes.push(language === 'pt'
            ? 'Foque em um documento por vez ou separe claramente as informações por fonte'
            : 'Focus on one document at a time or clearly separate information by source');
          break;
        case 'format_mismatch':
          fixes.push(language === 'pt'
            ? 'Responda no formato solicitado (lista, número, sim/não)'
            : 'Answer in the requested format (list, number, yes/no)');
          break;
        case 'context_mismatch':
          fixes.push(language === 'pt'
            ? 'Mantenha consistência com o contexto da conversa anterior'
            : 'Maintain consistency with the previous conversation context');
          break;
      }
    }

    return [...new Set(fixes)];
  }

  /**
   * Get prompt modification for regeneration (if needed)
   */
  getRegenerationPrompt(result: CoherenceCheckResult, language: string): string {
    if (!result.shouldRegenerate) return '';

    const fixes = result.suggestedFixes.join('. ');
    return language === 'pt'
      ? `\n\nIMPORTANTE: A resposta anterior teve problemas de coerência. ${fixes}. Por favor, responda novamente com mais cuidado.`
      : `\n\nIMPORTANT: The previous response had coherence issues. ${fixes}. Please answer again more carefully.`;
  }
}

// Singleton instance
let coherenceGateInstance: CoherenceGateService | null = null;

export function getCoherenceGate(): CoherenceGateService {
  if (!coherenceGateInstance) {
    coherenceGateInstance = new CoherenceGateService();
  }
  return coherenceGateInstance;
}
