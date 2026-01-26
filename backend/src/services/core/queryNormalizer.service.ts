/**
 * Query Normalizer Service
 *
 * Provides normalization, fuzzy matching, and synonym normalization.
 * Must be applied BEFORE pattern matching in:
 * - languageDetector
 * - contentGuard
 * - operator/intent matching
 *
 * Pipeline order:
 * 1. Lowercase + whitespace collapse
 * 2. Punctuation normalization
 * 3. Typo correction (dictionary + fuzzy)
 * 4. Synonym normalization (phrase + word)
 */

import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// SYNONYM BANK LOADING
// ═══════════════════════════════════════════════════════════════════════════

interface SynonymBank {
  en: { phrases: Record<string, string>; words: Record<string, string> };
  pt: { phrases: Record<string, string>; words: Record<string, string> };
}

let synonymBank: SynonymBank | null = null;

function loadSynonymBank(): SynonymBank {
  if (synonymBank) return synonymBank;

  const bankPath = path.join(__dirname, '../../data/normalizers/synonyms.json');
  try {
    if (fs.existsSync(bankPath)) {
      const raw = fs.readFileSync(bankPath, 'utf-8');
      const data = JSON.parse(raw);
      synonymBank = {
        en: data.en || { phrases: {}, words: {} },
        pt: data.pt || { phrases: {}, words: {} },
      };
      console.log('[QueryNormalizer] Loaded synonym bank');
    } else {
      synonymBank = {
        en: { phrases: {}, words: {} },
        pt: { phrases: {}, words: {} },
      };
    }
  } catch (e) {
    console.warn('[QueryNormalizer] Failed to load synonym bank:', e);
    synonymBank = {
      en: { phrases: {}, words: {} },
      pt: { phrases: {}, words: {} },
    };
  }
  return synonymBank;
}

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL TOKENS - High-value words for fuzzy matching
// ═══════════════════════════════════════════════════════════════════════════

const CANONICAL_TOKENS: Record<string, string[]> = {
  // Operators (EN) - includes base forms and common inflections to avoid false corrections
  verbs_en: [
    'summarize', 'summarise', 'summarized', 'summarised', 'summarizing',
    'extract', 'extracted', 'extracting',
    'compare', 'compared', 'comparing',
    'compute', 'computed', 'computing',
    'calculate', 'calculated', 'calculating',
    'locate', 'located', 'locating',
    'find', 'found', 'finding',
    'open', 'opened', 'opening',
    'show', 'showed', 'showing', 'shown',
    'list', 'listed', 'listing',
    'display', 'displayed', 'displaying',
    'filter', 'filtered', 'filtering',
    'sort', 'sorted', 'sorting',
    'group', 'grouped', 'grouping',
    'explain', 'explained', 'explaining',
    'analyze', 'analyse', 'analyzed', 'analysed', 'analyzing', 'analysing',
    'review', 'reviewed', 'reviewing',
    'highlight', 'highlighted', 'highlighting',
  ],
  // Operators (PT) - includes base forms and common inflections
  verbs_pt: [
    'resumir', 'resumido', 'resumindo',
    'extrair', 'extraído', 'extraindo',
    'comparar', 'comparado', 'comparando',
    'calcular', 'calculado', 'calculando',
    'localizar', 'localizado', 'localizando',
    'encontrar', 'encontrado', 'encontrando',
    'abrir', 'aberto', 'abrindo',
    'mostrar', 'mostrado', 'mostrando',
    'listar', 'listado', 'listando',
    'exibir', 'exibido', 'exibindo',
    'filtrar', 'filtrado', 'filtrando',
    'ordenar', 'ordenado', 'ordenando',
    'agrupar', 'agrupado', 'agrupando',
    'explicar', 'explicado', 'explicando',
    'analisar', 'analisado', 'analisando',
    'revisar', 'revisado', 'revisando',
    'destacar', 'destacado', 'destacando',
  ],
  // Document types (EN)
  doc_types_en: [
    'document', 'documents', 'file', 'files', 'pdf', 'spreadsheet',
    'presentation', 'report', 'contract', 'invoice', 'statement',
  ],
  // Document types (PT)
  doc_types_pt: [
    'documento', 'documentos', 'arquivo', 'arquivos', 'planilha',
    'apresentação', 'relatório', 'contrato', 'fatura', 'extrato',
  ],
  // Content nouns (EN)
  content_en: [
    'topics', 'summary', 'overview', 'conclusion', 'findings', 'points',
    'revenue', 'expenses', 'profit', 'margin', 'total', 'average',
  ],
  // Content nouns (PT)
  content_pt: [
    'tópicos', 'resumo', 'visão', 'conclusão', 'achados', 'pontos',
    'receita', 'despesas', 'lucro', 'margem', 'total', 'média',
  ],
  // Question words (EN)
  questions_en: ['what', 'where', 'which', 'how', 'when', 'why'],
  // Question words (PT)
  questions_pt: ['qual', 'onde', 'como', 'quando', 'porque', 'quais'],
};

// Flatten all canonical tokens
const ALL_CANONICAL_TOKENS = new Set(
  Object.values(CANONICAL_TOKENS).flat().map(t => t.toLowerCase())
);

// ═══════════════════════════════════════════════════════════════════════════
// COMMON TYPO CORRECTIONS - Direct mappings for frequent typos
// ═══════════════════════════════════════════════════════════════════════════

const COMMON_TYPO_CORRECTIONS: Record<string, string> = {
  // Question words (important for routing!)
  'waht': 'what',
  'whta': 'what',
  'wht': 'what',
  'hwat': 'what',
  'wat': 'what',
  'hwo': 'how',
  'hw': 'how',
  'whre': 'where',
  'wher': 'where',
  'wehre': 'where',
  'here': 'where',  // common deletion typo
  'hwere': 'where',
  'wheer': 'where',
  'whihc': 'which',
  'wihch': 'which',
  'wich': 'which',

  // Prepositions/context words (important for routing!)
  'frm': 'from',
  'rom': 'from',
  'fom': 'from',
  'fron': 'from',
  'frim': 'from',
  'grom': 'from',  // g instead of f
  'ffrom': 'from', // double f
  'ind': 'find',   // common deletion typo for "find"

  // EN verbs
  'summerize': 'summarize',
  'sumarize': 'summarize',
  'summrize': 'summarize',
  'summarzie': 'summarize',
  'sumamrize': 'summarize',
  'summarie': 'summarize',
  'sumarrise': 'summarise',
  'extarct': 'extract',
  'exract': 'extract',
  'extrat': 'extract',
  'compre': 'compare',
  'compar': 'compare',
  'comprae': 'compare',
  'calcualte': 'calculate',
  'claculate': 'calculate',
  'locat': 'locate',
  'locaet': 'locate',
  'lcate': 'locate',
  'locte': 'locate',
  'fnd': 'find',
  'fid': 'find',
  'ifnd': 'find',
  'fidn': 'find',
  'fnid': 'find',
  'opne': 'open',
  'oepn': 'open',
  'oen': 'open',
  'poen': 'open',
  'ope': 'open',
  'opn': 'open',
  'pen': 'open',   // deletion of 'o'
  'oopen': 'open', // double 'o'
  'opeen': 'open', // double 'e'
  'shwo': 'show',
  'hsow': 'show',
  'sow': 'show',
  'shw': 'show',
  'sho': 'show',
  'hshow': 'show',
  'sshow': 'show',
  'shoow': 'show',
  'howw': 'show',
  'litst': 'list',
  'lsit': 'list',
  'lst': 'list',
  'lis': 'list',
  'ilist': 'list',
  'displya': 'display',
  'diplay': 'display',
  'fitler': 'filter',
  'filer': 'filter',
  'srot': 'sort',
  'sotr': 'sort',
  'srt': 'sort',
  'sor': 'sort',
  'osrt': 'sort',
  'gruop': 'group',
  'gropu': 'group',
  'grop': 'group',
  'gorup': 'group',
  'grup': 'group',
  'expain': 'explain',
  'expalin': 'explain',
  'anaylze': 'analyze',
  'analize': 'analyze',

  // EN nouns
  'docuemnt': 'document',
  'documnet': 'document',
  'docment': 'document',
  'fiel': 'file',
  'flie': 'file',
  'spredsheet': 'spreadsheet',
  'spreadhseet': 'spreadsheet',
  'presnetation': 'presentation',
  'presenation': 'presentation',
  'repotr': 'report',
  'reprot': 'report',
  'revnue': 'revenue',
  'reveune': 'revenue',
  'expesnes': 'expenses',
  'expneses': 'expenses',
  'toatl': 'total',
  'totla': 'total',
  'summray': 'summary',
  'sumary': 'summary',
  'overveiw': 'overview',
  'overivew': 'overview',

  // PT verbs
  'resumri': 'resumir',
  'resmuir': 'resumir',
  'extrari': 'extrair',
  'extarri': 'extrair',
  'comparar': 'comparar',
  'comaprar': 'comparar',

  // PT nouns
  'documetno': 'documento',
  'docuemnto': 'documento',
  'arquvio': 'arquivo',
  'arqiuvo': 'arquivo',
  'planilah': 'planilha',
  'palinhla': 'planilha',
  'relatrorio': 'relatório',
  'realtório': 'relatório',
};

// ═══════════════════════════════════════════════════════════════════════════
// DAMERAU-LEVENSHTEIN DISTANCE
// ═══════════════════════════════════════════════════════════════════════════

function damerauLevenshteinDistance(a: string, b: string): number {
  const lenA = a.length;
  const lenB = b.length;

  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  // Create distance matrix
  const d: number[][] = Array.from({ length: lenA + 1 }, () =>
    Array.from({ length: lenB + 1 }, () => 0)
  );

  for (let i = 0; i <= lenA; i++) d[i][0] = i;
  for (let j = 0; j <= lenB; j++) d[0][j] = j;

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + cost // substitution
      );

      // Transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }

  return d[lenA][lenB];
}

// ═══════════════════════════════════════════════════════════════════════════
// FUZZY MATCHING
// ═══════════════════════════════════════════════════════════════════════════

interface FuzzyMatch {
  original: string;
  corrected: string;
  distance: number;
  confidence: number;
}

function findBestFuzzyMatch(word: string, maxDistance: number = 1, aggressive: boolean = false): FuzzyMatch | null {
  const lower = word.toLowerCase();

  // Skip if already canonical
  if (ALL_CANONICAL_TOKENS.has(lower)) {
    return null;
  }

  // Check common typo corrections first (these are safe, curated)
  if (COMMON_TYPO_CORRECTIONS[lower]) {
    return {
      original: word,
      corrected: COMMON_TYPO_CORRECTIONS[lower],
      distance: 1,
      confidence: 0.95,
    };
  }

  // Aggressive mode: allow words 4-15 chars and distance of 2
  // Conservative mode: only words 5-12 chars and distance of 1
  const minLen = aggressive ? 4 : 5;
  const maxLen = aggressive ? 15 : 12;
  const allowedDistance = aggressive ? 2 : 1;
  const confidenceThreshold = aggressive ? 0.7 : 0.85;
  const maxLengthDiff = aggressive ? 2 : 1;

  if (word.length < minLen || word.length > maxLen) {
    return null;
  }

  let bestMatch: FuzzyMatch | null = null;
  let bestDistance = Math.max(maxDistance, allowedDistance) + 1;

  for (const canonical of ALL_CANONICAL_TOKENS) {
    // Skip if length difference is too large
    if (Math.abs(canonical.length - lower.length) > maxLengthDiff) {
      continue;
    }

    const distance = damerauLevenshteinDistance(lower, canonical);

    // Accept up to allowedDistance
    if (distance <= allowedDistance && distance < bestDistance) {
      bestDistance = distance;
      bestMatch = {
        original: word,
        corrected: canonical,
        distance,
        confidence: 1 - (distance / Math.max(word.length, canonical.length)),
      };
    }
  }

  // Only return if confidence meets threshold
  if (bestMatch && bestMatch.confidence > confidenceThreshold) {
    return bestMatch;
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNONYM NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════

interface SynonymMatch {
  original: string;
  normalized: string;
  type: 'phrase' | 'word';
}

/**
 * Apply synonym normalization to a text.
 * Phrases are matched first (longer matches take precedence), then words.
 */
function applySynonymNormalization(
  text: string,
  lang: 'en' | 'pt' = 'en'
): { text: string; matches: SynonymMatch[] } {
  const bank = loadSynonymBank();
  const langBank = bank[lang] || bank.en;
  const matches: SynonymMatch[] = [];
  let result = text.toLowerCase();

  // Sort phrases by length (longer first) to match greedily
  const phrases = Object.entries(langBank.phrases).sort(
    ([a], [b]) => b.length - a.length
  );

  // Apply phrase replacements first
  for (const [phrase, replacement] of phrases) {
    const phraseLower = phrase.toLowerCase();
    if (result.includes(phraseLower)) {
      result = result.replace(new RegExp(escapeRegexForSynonyms(phraseLower), 'gi'), replacement);
      matches.push({ original: phrase, normalized: replacement, type: 'phrase' });
    }
  }

  // Apply word replacements (only for whole words)
  for (const [word, replacement] of Object.entries(langBank.words)) {
    const wordLower = word.toLowerCase();
    const regex = new RegExp(`\\b${escapeRegexForSynonyms(wordLower)}\\b`, 'gi');
    if (regex.test(result)) {
      result = result.replace(regex, replacement);
      matches.push({ original: word, normalized: replacement, type: 'word' });
    }
  }

  return { text: result, matches };
}

function escapeRegexForSynonyms(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════

export interface NormalizedQuery {
  original: string;
  normalized: string;
  tokens: string[];
  corrections: FuzzyMatch[];
  synonymMatches: SynonymMatch[];
  language?: 'en' | 'pt' | 'es';
}

export interface NormalizeOptions {
  /** Apply fuzzy typo correction (default: true) */
  applyFuzzy?: boolean;
  /** Language hint for synonym normalization (default: 'en') */
  langHint?: 'en' | 'pt';
  /**
   * Aggressive mode - used when routing confidence is low.
   * Loosens constraints:
   * - Allows Damerau-Levenshtein distance of 2 (not just 1)
   * - Accepts lower confidence threshold (0.7 instead of 0.85)
   * - Allows words 4-15 chars (not just 5-12)
   */
  aggressive?: boolean;
}

/**
 * Normalize a query for routing:
 * 1. Lowercase + collapse whitespace
 * 2. Normalize punctuation
 * 3. Apply typo corrections (dictionary + fuzzy)
 * 4. Apply synonym normalization (phrase + word)
 *
 * @param text - Raw query text
 * @param applyFuzzyOrOptions - Boolean for backward compat, or NormalizeOptions
 * @param langHint - Language hint (ignored if options object provided)
 */
export function normalizeQuery(
  text: string,
  applyFuzzyOrOptions: boolean | NormalizeOptions = true,
  langHint: 'en' | 'pt' = 'en'
): NormalizedQuery {
  // Handle both old and new API
  const opts: NormalizeOptions =
    typeof applyFuzzyOrOptions === 'boolean'
      ? { applyFuzzy: applyFuzzyOrOptions, langHint }
      : applyFuzzyOrOptions;

  const applyFuzzy = opts.applyFuzzy ?? true;
  const lang = opts.langHint ?? langHint;
  const aggressive = opts.aggressive ?? false;

  const original = text;

  // Step 1: Lowercase + collapse whitespace
  let normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();

  // Step 2: Normalize punctuation (but preserve important ones)
  normalized = normalized
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/…/g, '...');

  // Step 3: Tokenize for typo correction
  const tokens = normalized
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);

  // Step 4: Apply fuzzy typo corrections
  const corrections: FuzzyMatch[] = [];
  const confidenceThreshold = aggressive ? 0.6 : 0.7;

  if (applyFuzzy) {
    for (const token of tokens) {
      const match = findBestFuzzyMatch(token, 1, aggressive);
      if (match && match.confidence >= confidenceThreshold) {
        corrections.push(match);
      }
    }

    // Rebuild normalized string with typo corrections
    if (corrections.length > 0) {
      let correctedText = normalized;
      for (const corr of corrections) {
        correctedText = correctedText.replace(
          new RegExp(`\\b${escapeRegexForSynonyms(corr.original)}\\b`, 'gi'),
          corr.corrected
        );
      }
      normalized = correctedText;
    }
  }

  // Step 5: Apply synonym normalization
  const { text: synonymNormalized, matches: synonymMatches } = applySynonymNormalization(
    normalized,
    lang
  );
  normalized = synonymNormalized;

  return {
    original,
    normalized,
    tokens,
    corrections,
    synonymMatches,
  };
}

/**
 * Quick check if a query has potential typos
 */
export function hasLikelyTypos(text: string): boolean {
  const { corrections } = normalizeQuery(text, true);
  return corrections.length > 0;
}

/**
 * Get all corrections for a query
 */
export function getTypoCorrections(text: string): FuzzyMatch[] {
  const { corrections } = normalizeQuery(text, true);
  return corrections;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  CANONICAL_TOKENS,
  COMMON_TYPO_CORRECTIONS,
  damerauLevenshteinDistance,
  findBestFuzzyMatch,
  ALL_CANONICAL_TOKENS,
  applySynonymNormalization,
  loadSynonymBank,
};
