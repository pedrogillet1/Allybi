/**
 * Language Engine Service
 *
 * Centralized language detection and configuration for Koda.
 * This service provides a single source of truth for:
 * - Language detection from user queries
 * - Language-specific keywords for intent classification
 * - Language-specific system instructions for LLM
 * - Language-specific formatting and completion patterns
 *
 * Supported languages:
 * - English (en)
 * - Portuguese Brazilian (pt-BR)
 * - Spanish (es)
 *
 * @version 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// Types & Interfaces
// ═══════════════════════════════════════════════════════════════════════════

export type SupportedLanguage = 'en' | 'pt-BR' | 'es';

export interface LanguageConfig {
  code: SupportedLanguage;
  name: string;
  locale: string;
  systemInstructionSuffix: string;
  greetings: string[];
  confirmations: string[];
  negations: string[];
}

export interface NavigationKeywords {
  fileNavigation: string[];
  folderNavigation: string[];
  searchFiles: string[];
  recentFiles: string[];
  fileCount: string[];
  fileList: string[];
}

export interface AppHelpKeywords {
  howTo: string[];
  whatCan: string[];
  help: string[];
  features: string[];
}

export interface CompletionPatterns {
  incompleteListStarters: string[];
  incompleteEndings: string[];
  continuationMarkers: string[];
}

export interface LanguageDetectionResult {
  language: SupportedLanguage;
  confidence: number;
  detectedPatterns: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Language Configurations
// ═══════════════════════════════════════════════════════════════════════════

const LANGUAGE_CONFIGS: Record<SupportedLanguage, LanguageConfig> = {
  'en': {
    code: 'en',
    name: 'English',
    locale: 'en-US',
    systemInstructionSuffix: `
CRITICAL LANGUAGE RULE:
- You MUST respond ONLY in English
- Never mix languages in your response
- Use natural, conversational English`,
    greetings: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'],
    confirmations: ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'right', 'correct'],
    negations: ['no', 'nope', 'not', 'never', 'none'],
  },
  'pt-BR': {
    code: 'pt-BR',
    name: 'Portuguese (Brazil)',
    locale: 'pt-BR',
    systemInstructionSuffix: `
REGRA CRÍTICA DE IDIOMA:
- Você DEVE responder APENAS em português brasileiro
- NUNCA misture idiomas na sua resposta
- Use português natural e conversacional
- Mantenha a consistência do idioma em toda a resposta`,
    greetings: ['olá', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'e aí', 'eae'],
    confirmations: ['sim', 'claro', 'certo', 'ok', 'beleza', 'pode ser', 'isso'],
    negations: ['não', 'nao', 'nunca', 'nenhum', 'nada'],
  },
  'es': {
    code: 'es',
    name: 'Spanish',
    locale: 'es-ES',
    systemInstructionSuffix: `
REGLA CRÍTICA DE IDIOMA:
- DEBES responder SOLO en español
- NUNCA mezcles idiomas en tu respuesta
- Usa español natural y conversacional`,
    greetings: ['hola', 'buenos días', 'buenas tardes', 'buenas noches', 'qué tal'],
    confirmations: ['sí', 'si', 'claro', 'vale', 'ok', 'bueno', 'correcto'],
    negations: ['no', 'nunca', 'ninguno', 'nada'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Navigation Keywords by Language
// ═══════════════════════════════════════════════════════════════════════════

const NAVIGATION_KEYWORDS: Record<SupportedLanguage, NavigationKeywords> = {
  'en': {
    fileNavigation: [
      'where is', 'where\'s', 'find file', 'find the file',
      'which folder', 'in which folder', 'location of',
      'locate', 'search for file', 'look for file',
    ],
    folderNavigation: [
      'open folder', 'go to folder', 'navigate to',
      'show folder', 'folder contents', 'in folder',
    ],
    searchFiles: [
      'search', 'find', 'look for', 'locate',
      'where can I find', 'help me find',
    ],
    recentFiles: [
      'recent files', 'recently uploaded', 'latest files',
      'recent uploads', 'recent documents', 'what did I upload',
      'show recent', 'my recent', 'latest uploads',
    ],
    fileCount: [
      'how many files', 'how many documents', 'file count',
      'document count', 'number of files', 'total files',
      'count my files', 'count documents',
    ],
    fileList: [
      'list my files', 'show my files', 'my files',
      'all my files', 'list files', 'show files',
      'list documents', 'show documents', 'my documents',
    ],
  },
  'pt-BR': {
    fileNavigation: [
      'onde está', 'onde fica', 'onde está o arquivo',
      'em qual pasta', 'qual pasta', 'localização do',
      'localizar', 'procurar arquivo', 'buscar arquivo',
      'achar arquivo', 'encontrar arquivo',
    ],
    folderNavigation: [
      'abrir pasta', 'ir para pasta', 'navegar para',
      'mostrar pasta', 'conteúdo da pasta', 'na pasta',
    ],
    searchFiles: [
      'procurar', 'buscar', 'encontrar', 'localizar',
      'onde posso encontrar', 'me ajude a encontrar',
      'achar', 'pesquisar',
    ],
    recentFiles: [
      'arquivos recentes', 'enviados recentemente', 'últimos arquivos',
      'uploads recentes', 'documentos recentes', 'o que eu enviei',
      'mostrar recentes', 'meus recentes', 'últimos uploads',
      'arquivos mais recentes', 'documentos mais recentes',
    ],
    fileCount: [
      'quantos arquivos', 'quantos documentos', 'contagem de arquivos',
      'contagem de documentos', 'número de arquivos', 'total de arquivos',
      'contar meus arquivos', 'contar documentos', 'quantos eu tenho',
    ],
    fileList: [
      'listar meus arquivos', 'mostrar meus arquivos', 'meus arquivos',
      'todos os meus arquivos', 'listar arquivos', 'mostrar arquivos',
      'listar documentos', 'mostrar documentos', 'meus documentos',
      'listar meus documentos',
    ],
  },
  'es': {
    fileNavigation: [
      'dónde está', 'donde esta', 'encontrar archivo',
      'en qué carpeta', 'cual carpeta', 'ubicación de',
      'localizar', 'buscar archivo',
    ],
    folderNavigation: [
      'abrir carpeta', 'ir a carpeta', 'navegar a',
      'mostrar carpeta', 'contenido de carpeta', 'en carpeta',
    ],
    searchFiles: [
      'buscar', 'encontrar', 'localizar',
      'dónde puedo encontrar', 'ayúdame a encontrar',
    ],
    recentFiles: [
      'archivos recientes', 'subidos recientemente', 'últimos archivos',
      'subidas recientes', 'documentos recientes', 'qué subí',
      'mostrar recientes', 'mis recientes',
    ],
    fileCount: [
      'cuántos archivos', 'cuantos archivos', 'cuántos documentos',
      'conteo de archivos', 'número de archivos', 'total de archivos',
      'contar mis archivos', 'contar documentos',
    ],
    fileList: [
      'listar mis archivos', 'mostrar mis archivos', 'mis archivos',
      'todos mis archivos', 'listar archivos', 'mostrar archivos',
      'listar documentos', 'mostrar documentos', 'mis documentos',
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// App Help Keywords by Language
// ═══════════════════════════════════════════════════════════════════════════

const APP_HELP_KEYWORDS: Record<SupportedLanguage, AppHelpKeywords> = {
  'en': {
    howTo: [
      'how do I', 'how to', 'how can I', 'how should I',
      'what\'s the way to', 'teach me how',
    ],
    whatCan: [
      'what can you do', 'what are you capable of',
      'what features', 'what can koda do', 'your capabilities',
    ],
    help: [
      'help', 'help me', 'I need help', 'can you help',
      'assist me', 'assistance',
    ],
    features: [
      'features', 'functionality', 'abilities',
      'what can I do', 'options', 'commands',
    ],
  },
  'pt-BR': {
    howTo: [
      'como eu', 'como faço', 'como posso', 'como devo',
      'qual a forma de', 'me ensine como', 'como que',
    ],
    whatCan: [
      'o que você pode fazer', 'o que você é capaz',
      'quais recursos', 'o que a koda faz', 'suas capacidades',
      'o que você faz', 'o que voce pode',
    ],
    help: [
      'ajuda', 'me ajuda', 'preciso de ajuda', 'pode me ajudar',
      'me auxilie', 'assistência', 'socorro',
    ],
    features: [
      'recursos', 'funcionalidades', 'habilidades',
      'o que eu posso fazer', 'opções', 'comandos',
    ],
  },
  'es': {
    howTo: [
      'cómo', 'como hago', 'cómo puedo', 'cómo debo',
      'cuál es la forma de', 'enséñame cómo',
    ],
    whatCan: [
      'qué puedes hacer', 'de qué eres capaz',
      'qué funciones', 'qué puede hacer koda', 'tus capacidades',
    ],
    help: [
      'ayuda', 'ayúdame', 'necesito ayuda', 'puedes ayudarme',
      'asistencia',
    ],
    features: [
      'características', 'funcionalidades', 'habilidades',
      'qué puedo hacer', 'opciones', 'comandos',
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Completion/Incomplete Patterns by Language
// ═══════════════════════════════════════════════════════════════════════════

const COMPLETION_PATTERNS: Record<SupportedLanguage, CompletionPatterns> = {
  'en': {
    incompleteListStarters: [
      'such as', 'including', 'like', 'for example',
      'e.g.', 'i.e.', 'namely', 'specifically',
    ],
    incompleteEndings: [
      ':', ',', ';', 'and', 'or', 'but', 'however',
      'therefore', 'thus', 'hence', 'so', 'because',
    ],
    continuationMarkers: [
      '...', '…', 'etc', 'etc.', 'and more', 'among others',
    ],
  },
  'pt-BR': {
    incompleteListStarters: [
      'como', 'incluindo', 'por exemplo', 'tais como',
      'como por exemplo', 'a saber', 'especificamente',
    ],
    incompleteEndings: [
      ':', ',', ';', 'e', 'ou', 'mas', 'porém',
      'portanto', 'assim', 'logo', 'então', 'porque',
    ],
    continuationMarkers: [
      '...', '…', 'etc', 'etc.', 'e mais', 'entre outros',
    ],
  },
  'es': {
    incompleteListStarters: [
      'como', 'incluyendo', 'por ejemplo', 'tales como',
      'a saber', 'específicamente',
    ],
    incompleteEndings: [
      ':', ',', ';', 'y', 'o', 'pero', 'sin embargo',
      'por lo tanto', 'así', 'entonces', 'porque',
    ],
    continuationMarkers: [
      '...', '…', 'etc', 'etc.', 'y más', 'entre otros',
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Language Detection Patterns
// ═══════════════════════════════════════════════════════════════════════════

const LANGUAGE_DETECTION_PATTERNS: Record<SupportedLanguage, RegExp[]> = {
  'pt-BR': [
    // Portuguese-specific words and patterns
    /\b(você|voce|vocês|voces)\b/i,
    /\b(não|nao|sim|obrigado|obrigada)\b/i,
    /\b(onde|como|quando|porque|porquê)\b/i,
    /\b(está|estão|estou|estava)\b/i,
    /\b(tenho|temos|tinha|tinham)\b/i,
    /\b(fazer|faço|faz|fazendo)\b/i,
    /\b(qual|quais|quem|quanto|quantos|quantas)\b/i,
    /\b(meu|meus|minha|minhas|seu|seus|sua|suas)\b/i,
    /\b(arquivo|arquivos|documento|documentos|pasta|pastas)\b/i,
    /\b(olá|oi|bom dia|boa tarde|boa noite)\b/i,
    /\b(por favor|obrigado|obrigada|desculpe|desculpa)\b/i,
    /\b(ajuda|ajudar|ajude|preciso)\b/i,
    /\b(listar|mostrar|exibir|abrir)\b/i,
    /[ãõáéíóúâêîôûàèìòùç]/i, // Portuguese accents
  ],
  'es': [
    // Spanish-specific words and patterns
    /\b(usted|ustedes|tú|vosotros)\b/i,
    /\b(sí|si|gracias|por favor)\b/i,
    /\b(dónde|donde|cómo|como|cuándo|cuando|porqué|porque)\b/i,
    /\b(está|están|estoy|estaba)\b/i,
    /\b(tengo|tenemos|tenía|tenían)\b/i,
    /\b(hacer|hago|hace|haciendo)\b/i,
    /\b(cuál|cuáles|quién|cuánto|cuántos|cuántas)\b/i,
    /\b(mi|mis|tu|tus|su|sus)\b/i,
    /\b(archivo|archivos|documento|documentos|carpeta|carpetas)\b/i,
    /\b(hola|buenos días|buenas tardes|buenas noches)\b/i,
    /\b(ayuda|ayudar|ayúdame|necesito)\b/i,
    /\b(listar|mostrar|abrir)\b/i,
    /[ñ¿¡]/i, // Spanish-specific characters
  ],
  'en': [
    // English-specific words and patterns
    /\b(the|a|an|is|are|was|were)\b/i,
    /\b(you|your|yours|i|me|my|mine)\b/i,
    /\b(what|where|when|why|how|which|who)\b/i,
    /\b(have|has|had|having)\b/i,
    /\b(do|does|did|doing)\b/i,
    /\b(can|could|would|should|will|shall)\b/i,
    /\b(file|files|document|documents|folder|folders)\b/i,
    /\b(hello|hi|hey|good morning|good afternoon)\b/i,
    /\b(please|thank|thanks|sorry|excuse)\b/i,
    /\b(help|assist|find|search|show|list)\b/i,
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect the language of a text query
 * Returns the detected language with confidence score
 *
 * @param text - The text to analyze
 * @param defaultLanguage - Fallback language if detection is uncertain
 * @returns Language detection result with confidence
 */
export function detectLanguage(
  text: string,
  defaultLanguage: SupportedLanguage = 'pt-BR'
): LanguageDetectionResult {
  const normalizedText = text.toLowerCase().trim();
  const scores: Record<SupportedLanguage, { count: number; patterns: string[] }> = {
    'en': { count: 0, patterns: [] },
    'pt-BR': { count: 0, patterns: [] },
    'es': { count: 0, patterns: [] },
  };

  // Check each language's patterns
  for (const [lang, patterns] of Object.entries(LANGUAGE_DETECTION_PATTERNS)) {
    for (const pattern of patterns) {
      const match = normalizedText.match(pattern);
      if (match) {
        scores[lang as SupportedLanguage].count++;
        scores[lang as SupportedLanguage].patterns.push(match[0]);
      }
    }
  }

  // Find the language with highest score
  let maxScore = 0;
  let detectedLang: SupportedLanguage = defaultLanguage;
  let detectedPatterns: string[] = [];

  for (const [lang, data] of Object.entries(scores)) {
    if (data.count > maxScore) {
      maxScore = data.count;
      detectedLang = lang as SupportedLanguage;
      detectedPatterns = data.patterns;
    }
  }

  // Calculate confidence (0-1)
  const totalPatterns = Object.values(scores).reduce((sum, d) => sum + d.count, 0);
  const confidence = totalPatterns > 0 ? maxScore / totalPatterns : 0.5;

  // If confidence is too low, use default
  if (confidence < 0.4 || maxScore === 0) {
    return {
      language: defaultLanguage,
      confidence: 0.5,
      detectedPatterns: [],
    };
  }

  return {
    language: detectedLang,
    confidence: Math.min(confidence, 1),
    detectedPatterns,
  };
}

/**
 * Simple synchronous language detection (for backward compatibility)
 * Returns just the language code
 */
export function detectLanguageSimple(
  text: string,
  defaultLanguage: SupportedLanguage = 'pt-BR'
): SupportedLanguage {
  return detectLanguage(text, defaultLanguage).language;
}

/**
 * Get the full configuration for a language
 */
export function getLanguageConfig(language: SupportedLanguage): LanguageConfig {
  return LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS['pt-BR'];
}

/**
 * Get the system instruction suffix for a language
 * This should be appended to system prompts for LLM calls
 */
export function getSystemInstructionSuffix(language: SupportedLanguage): string {
  const config = getLanguageConfig(language);
  return config.systemInstructionSuffix;
}

/**
 * Get navigation keywords for a language
 */
export function getNavigationKeywords(language: SupportedLanguage): NavigationKeywords {
  return NAVIGATION_KEYWORDS[language] || NAVIGATION_KEYWORDS['pt-BR'];
}

/**
 * Get app help keywords for a language
 */
export function getAppHelpKeywords(language: SupportedLanguage): AppHelpKeywords {
  return APP_HELP_KEYWORDS[language] || APP_HELP_KEYWORDS['pt-BR'];
}

/**
 * Get completion/incomplete patterns for a language
 */
export function getCompletionPatterns(language: SupportedLanguage): CompletionPatterns {
  return COMPLETION_PATTERNS[language] || COMPLETION_PATTERNS['pt-BR'];
}

/**
 * Check if text ends with an incomplete pattern
 */
export function isIncompleteText(text: string, language: SupportedLanguage): boolean {
  const patterns = getCompletionPatterns(language);
  const trimmedText = text.trim().toLowerCase();

  // Check incomplete endings
  for (const ending of patterns.incompleteEndings) {
    if (trimmedText.endsWith(ending)) {
      return true;
    }
  }

  // Check continuation markers
  for (const marker of patterns.continuationMarkers) {
    if (trimmedText.endsWith(marker)) {
      return true;
    }
  }

  // Check if ends with incomplete list starter
  for (const starter of patterns.incompleteListStarters) {
    if (trimmedText.endsWith(starter)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a query matches any navigation keyword
 */
export function matchesNavigationKeyword(
  query: string,
  language: SupportedLanguage,
  category?: keyof NavigationKeywords
): boolean {
  const keywords = getNavigationKeywords(language);
  const normalizedQuery = query.toLowerCase();

  if (category) {
    return keywords[category].some(kw => normalizedQuery.includes(kw));
  }

  // Check all categories
  return Object.values(keywords).some(
    categoryKeywords => categoryKeywords.some((kw: string) => normalizedQuery.includes(kw))
  );
}

/**
 * Check if a query matches any app help keyword
 */
export function matchesAppHelpKeyword(
  query: string,
  language: SupportedLanguage,
  category?: keyof AppHelpKeywords
): boolean {
  const keywords = getAppHelpKeywords(language);
  const normalizedQuery = query.toLowerCase();

  if (category) {
    return keywords[category].some(kw => normalizedQuery.includes(kw));
  }

  // Check all categories
  return Object.values(keywords).some(
    categoryKeywords => categoryKeywords.some((kw: string) => normalizedQuery.includes(kw))
  );
}

/**
 * Get greetings for a language
 */
export function getGreetings(language: SupportedLanguage): string[] {
  return LANGUAGE_CONFIGS[language]?.greetings || LANGUAGE_CONFIGS['pt-BR'].greetings;
}

/**
 * Check if text is a greeting
 */
export function isGreeting(text: string, language?: SupportedLanguage): boolean {
  const normalizedText = text.toLowerCase().trim();

  if (language) {
    const greetings = getGreetings(language);
    return greetings.some(g => normalizedText.startsWith(g) || normalizedText === g);
  }

  // Check all languages
  for (const lang of Object.keys(LANGUAGE_CONFIGS) as SupportedLanguage[]) {
    const greetings = getGreetings(lang);
    if (greetings.some(g => normalizedText.startsWith(g) || normalizedText === g)) {
      return true;
    }
  }

  return false;
}

/**
 * Format a date according to language locale
 */
export function formatDate(date: Date, language: SupportedLanguage): string {
  const config = getLanguageConfig(language);
  return date.toLocaleDateString(config.locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get all supported languages
 */
export function getSupportedLanguages(): SupportedLanguage[] {
  return Object.keys(LANGUAGE_CONFIGS) as SupportedLanguage[];
}

/**
 * Check if a language code is supported
 */
export function isLanguageSupported(code: string): code is SupportedLanguage {
  return code in LANGUAGE_CONFIGS;
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

export default {
  detectLanguage,
  detectLanguageSimple,
  getLanguageConfig,
  getSystemInstructionSuffix,
  getNavigationKeywords,
  getAppHelpKeywords,
  getCompletionPatterns,
  isIncompleteText,
  matchesNavigationKeyword,
  matchesAppHelpKeyword,
  getGreetings,
  isGreeting,
  formatDate,
  getSupportedLanguages,
  isLanguageSupported,
};
