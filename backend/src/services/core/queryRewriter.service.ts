/**
 * QueryRewriter Service - ChatGPT Parity
 *
 * Rewrites queries for regeneration to produce varied but semantically equivalent results.
 * When user clicks "regenerate", we don't just replay with same query - we paraphrase
 * slightly to get different retrieval results and LLM completions.
 *
 * Strategies:
 * 1. Synonym substitution (deterministic, fast)
 * 2. Word order variation (deterministic, fast)
 * 3. LLM paraphrase (optional, slower but better variation)
 */

import type { LanguageCode } from '../../types/intents.types';

// ============================================================================
// TYPES
// ============================================================================

interface RewriteResult {
  original: string;
  rewritten: string;
  strategy: 'synonym' | 'reorder' | 'llm' | 'none';
  confidence: number;
}

interface RewriteConfig {
  enableSynonymSubstitution: boolean;
  enableWordReorder: boolean;
  enableLLMParaphrase: boolean;
  maxSubstitutions: number;
}

// ============================================================================
// SYNONYM MAPS (domain-aware)
// ============================================================================

const SYNONYM_MAPS: Record<string, Record<string, string[]>> = {
  en: {
    // Question words
    'what': ['which', 'what'],
    'how': ['in what way', 'how'],
    'show': ['display', 'present', 'show'],
    'list': ['enumerate', 'show', 'list'],
    'find': ['locate', 'search for', 'find'],
    'get': ['retrieve', 'fetch', 'get'],
    'tell': ['explain', 'describe', 'tell'],
    // Domain terms
    'total': ['sum', 'aggregate', 'total'],
    'revenue': ['income', 'sales', 'revenue'],
    'cost': ['expense', 'expenditure', 'cost'],
    'profit': ['earnings', 'net income', 'profit'],
    'change': ['difference', 'variation', 'change'],
    'increase': ['growth', 'rise', 'increase'],
    'decrease': ['decline', 'drop', 'decrease'],
    // Document terms
    'document': ['file', 'doc', 'document'],
    'spreadsheet': ['excel file', 'worksheet', 'spreadsheet'],
    'report': ['analysis', 'summary', 'report'],
  },
  pt: {
    // Question words
    'qual': ['que', 'qual'],
    'como': ['de que forma', 'como'],
    'mostre': ['apresente', 'exiba', 'mostre'],
    'liste': ['enumere', 'mostre', 'liste'],
    'encontre': ['localize', 'busque', 'encontre'],
    // Domain terms
    'total': ['soma', 'agregado', 'total'],
    'receita': ['faturamento', 'vendas', 'receita'],
    'custo': ['despesa', 'gasto', 'custo'],
    'lucro': ['ganho', 'resultado', 'lucro'],
  },
  es: {
    // Question words
    'cual': ['qué', 'cual'],
    'como': ['de qué manera', 'como'],
    'muestra': ['presenta', 'exhibe', 'muestra'],
    'lista': ['enumera', 'muestra', 'lista'],
    // Domain terms
    'total': ['suma', 'agregado', 'total'],
    'ingresos': ['ventas', 'facturación', 'ingresos'],
    'costo': ['gasto', 'egreso', 'costo'],
    'ganancia': ['beneficio', 'utilidad', 'ganancia'],
  },
};

// Words to never substitute (preserve exact meaning)
const PROTECTED_WORDS = new Set([
  // Numbers
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  // Specific terms that should stay exact
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
  'q1', 'q2', 'q3', 'q4',
  '2024', '2025', '2026',
  // Portuguese months
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]);

// ============================================================================
// REWRITE STRATEGIES
// ============================================================================

/**
 * Strategy 1: Synonym substitution (deterministic based on regenCount)
 */
function applySynonymSubstitution(
  query: string,
  language: LanguageCode,
  regenCount: number,
  maxSubstitutions: number = 2
): { text: string; substitutions: number } {
  const synonymMap = SYNONYM_MAPS[language] || SYNONYM_MAPS.en;
  const words = query.split(/\s+/);
  let substitutions = 0;

  const rewritten = words.map((word, idx) => {
    if (substitutions >= maxSubstitutions) return word;

    const lowerWord = word.toLowerCase();
    if (PROTECTED_WORDS.has(lowerWord)) return word;

    // Check if word has synonyms
    const synonyms = synonymMap[lowerWord];
    if (synonyms && synonyms.length > 1) {
      // Use regenCount + word index to deterministically pick a different synonym
      const synonymIdx = (regenCount + idx) % synonyms.length;
      const newWord = synonyms[synonymIdx];

      // Only substitute if it's different
      if (newWord.toLowerCase() !== lowerWord) {
        substitutions++;
        // Preserve original casing
        if (word[0] === word[0].toUpperCase()) {
          return newWord.charAt(0).toUpperCase() + newWord.slice(1);
        }
        return newWord;
      }
    }

    return word;
  });

  return {
    text: rewritten.join(' '),
    substitutions,
  };
}

/**
 * Strategy 2: Word order variation for compound phrases
 * "revenue and cost" -> "cost and revenue"
 */
function applyWordReorder(
  query: string,
  regenCount: number
): { text: string; reordered: boolean } {
  // Only apply on even regenCounts to alternate
  if (regenCount % 2 === 0) {
    return { text: query, reordered: false };
  }

  // Pattern: X and Y -> Y and X
  const andPattern = /\b(\w+)\s+(and|e|y)\s+(\w+)\b/gi;
  let reordered = false;

  const text = query.replace(andPattern, (match, word1, connector, word2) => {
    // Don't reorder if it would change meaning significantly
    if (PROTECTED_WORDS.has(word1.toLowerCase()) || PROTECTED_WORDS.has(word2.toLowerCase())) {
      return match;
    }
    reordered = true;
    return `${word2} ${connector} ${word1}`;
  });

  return { text, reordered };
}

/**
 * Strategy 3: Add slight emphasis variations
 * "What is the total?" -> "What's the total?"
 */
function applyContractionVariation(
  query: string,
  regenCount: number
): { text: string; varied: boolean } {
  let varied = false;

  // Alternate between contractions and expansions
  if (regenCount % 2 === 1) {
    // Expand contractions
    const expansions: Record<string, string> = {
      "what's": 'what is',
      "how's": 'how is',
      "where's": 'where is',
      "who's": 'who is',
      "it's": 'it is',
      "that's": 'that is',
      "there's": 'there is',
      "don't": 'do not',
      "doesn't": 'does not',
      "didn't": 'did not',
      "can't": 'cannot',
      "won't": 'will not',
      "isn't": 'is not',
      "aren't": 'are not',
    };

    let text = query;
    for (const [contraction, expansion] of Object.entries(expansions)) {
      const regex = new RegExp(`\\b${contraction}\\b`, 'gi');
      if (regex.test(text)) {
        text = text.replace(regex, expansion);
        varied = true;
      }
    }
    return { text, varied };
  } else {
    // Contract expanded forms
    const contractions: Record<string, string> = {
      'what is': "what's",
      'how is': "how's",
      'where is': "where's",
      'it is': "it's",
      'that is': "that's",
      'there is': "there's",
      'do not': "don't",
      'does not': "doesn't",
      'did not': "didn't",
      'can not': "can't",
      'cannot': "can't",
      'will not': "won't",
      'is not': "isn't",
      'are not': "aren't",
    };

    let text = query;
    for (const [expanded, contraction] of Object.entries(contractions)) {
      const regex = new RegExp(`\\b${expanded}\\b`, 'gi');
      if (regex.test(text)) {
        text = text.replace(regex, contraction);
        varied = true;
      }
    }
    return { text, varied };
  }
}

// ============================================================================
// MAIN REWRITE FUNCTION
// ============================================================================

/**
 * Rewrite query for regeneration
 *
 * @param query - Original query
 * @param language - Language code
 * @param regenCount - Regeneration count (1 = first regen, 2 = second, etc.)
 * @param config - Optional configuration
 * @returns RewriteResult with original and rewritten query
 */
export function rewriteQueryForRegeneration(
  query: string,
  language: LanguageCode = 'en',
  regenCount: number,
  config?: Partial<RewriteConfig>
): RewriteResult {
  // Don't rewrite on first generation
  if (regenCount < 1) {
    return {
      original: query,
      rewritten: query,
      strategy: 'none',
      confidence: 1.0,
    };
  }

  const effectiveConfig: RewriteConfig = {
    enableSynonymSubstitution: true,
    enableWordReorder: true,
    enableLLMParaphrase: false, // Disabled by default - too slow
    maxSubstitutions: 2,
    ...config,
  };

  let rewritten = query;
  let strategy: RewriteResult['strategy'] = 'none';
  let totalChanges = 0;

  // Apply strategies in order

  // 1. Synonym substitution
  if (effectiveConfig.enableSynonymSubstitution) {
    const synonymResult = applySynonymSubstitution(
      rewritten,
      language,
      regenCount,
      effectiveConfig.maxSubstitutions
    );
    if (synonymResult.substitutions > 0) {
      rewritten = synonymResult.text;
      strategy = 'synonym';
      totalChanges += synonymResult.substitutions;
    }
  }

  // 2. Word reorder (only if no synonyms were substituted)
  if (effectiveConfig.enableWordReorder && totalChanges === 0) {
    const reorderResult = applyWordReorder(rewritten, regenCount);
    if (reorderResult.reordered) {
      rewritten = reorderResult.text;
      strategy = 'reorder';
      totalChanges += 1;
    }
  }

  // 3. Contraction variation (always apply as subtle variation)
  const contractionResult = applyContractionVariation(rewritten, regenCount);
  if (contractionResult.varied) {
    rewritten = contractionResult.text;
    if (strategy === 'none') strategy = 'synonym'; // Group with synonym
    totalChanges += 1;
  }

  // If no changes made, the query might be too specific - return as-is
  if (rewritten === query) {
    return {
      original: query,
      rewritten: query,
      strategy: 'none',
      confidence: 1.0,
    };
  }

  // Calculate confidence based on how much was changed
  const originalWords = query.split(/\s+/).length;
  const changeRatio = totalChanges / originalWords;
  const confidence = Math.max(0.7, 1 - changeRatio * 0.3);

  return {
    original: query,
    rewritten,
    strategy,
    confidence,
  };
}

/**
 * Check if query should be rewritten (some queries should never be rewritten)
 */
export function shouldRewriteQuery(query: string): boolean {
  // Don't rewrite very short queries (< 3 words)
  const wordCount = query.split(/\s+/).length;
  if (wordCount < 3) return false;

  // Don't rewrite queries that are mostly numbers/dates
  const numericRatio = (query.match(/\d/g) || []).length / query.length;
  if (numericRatio > 0.3) return false;

  // Don't rewrite queries with explicit filenames (preserve exact reference)
  const hasFilename = /\.\w{2,4}\b/.test(query);
  if (hasFilename) return false;

  // Don't rewrite queries in quotes (user wants exact match)
  const hasQuotes = /"[^"]+"/.test(query);
  if (hasQuotes) return false;

  return true;
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  rewriteQueryForRegeneration,
  shouldRewriteQuery,
};
