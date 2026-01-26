/**
 * PromptConfigService
 *
 * Single service that loads all LLM-related JSON once at startup.
 * Provides typed getters for AnswerEngine, Formatting, Validation, and Retrieval.
 *
 * GUARANTEES:
 * - All JSON loaded once at startup (never per-request)
 * - Schema validation (fail fast on boot)
 * - No default fallbacks unless config missing
 * - Hard-wired into AnswerEngine/Retrieval/Validation
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolveDataDir, assertDataFilesExist, REQUIRED_PROMPT_CONFIG_FILES } from './resolveDataDir';

// ============================================================================
// TYPES
// ============================================================================

export type LanguageCode = 'en' | 'pt' | 'es';

export interface SystemPromptEntry {
  mode: string;
  description: string;
  languages: {
    [lang in LanguageCode]?: {
      systemPrompt: string;
      constraints?: string[];
      examples?: any[];
      citationRules?: string;
    };
  };
}

export interface SystemPromptsConfig {
  version: string;
  lastUpdated: string;
  prompts: SystemPromptEntry[];
}

export interface AnswerStylesConfig {
  [intentKey: string]: {
    [questionType: string]: {
      [lang in LanguageCode]?: {
        structure?: string;
        tone?: string;
        verbosity?: string;
        formatting?: string[];
      };
    };
  };
}

export interface AnswerExamplesConfig {
  [intentKey: string]: {
    [lang in LanguageCode]?: any;
  };
}

export interface MarkdownComponentsConfig {
  version: string;
  components: {
    [componentKey: string]: {
      [lang in LanguageCode]?: string;
    };
  };
}

export interface TablePresetsConfig {
  version: string;
  presets: {
    [presetKey: string]: {
      columns: string[];
      formatting: {
        alignment?: string[];
        width?: string[];
      };
      style?: string;
    };
  };
}

export interface ValidationPolicyEntry {
  category: string;
  name: string;
  description: string;
  rules: {
    [ruleKey: string]: any;
  };
}

export interface ValidationPoliciesConfig {
  version: string;
  policies: ValidationPolicyEntry[];
}

export interface RetrievalPolicyEntry {
  intentType: string;
  questionType?: string;
  retrieval: {
    vectorTopK: number;
    bm25TopK: number;
    mergeWeights: {
      vector: number;
      bm25: number;
    };
    minScore: number;
    diversity?: boolean;
  };
  chunking?: {
    maxChunks: number;
    minChunks?: number;
  };
  filtering?: {
    requireExactMatch?: boolean;
    boostRecentDocs?: boolean;
  };
}

export interface RetrievalPoliciesConfig {
  version: string;
  policies: RetrievalPolicyEntry[];
}

export interface ErrorLocalizationConfig {
  [errorKey: string]: {
    [lang in LanguageCode]?: string;
  };
}

export interface LanguageProfilesConfig {
  [lang: string]: {
    name: string;
    nativeName: string;
    variants?: string[];
  };
}

export interface DebugLabelsConfig {
  [labelKey: string]: string;
}

export interface FallbacksConfig {
  version?: string;
  fallbacks: Array<{
    key: string;
    category: string;
    description?: string;
    defaultStyleId?: string;
    severity?: string;
    styles: Array<{
      id: string;
      maxLength?: number;
      structure?: string[];
      tone?: string;
      languages: {
        [lang in LanguageCode]?: {
          template: string;
          placeholders?: string[];
        };
      };
    }>;
  }>;
}

export interface ProductHelpConfig {
  version?: string;
  topics: Array<{
    id: string;
    category?: string;
    keywords?: {
      [lang in LanguageCode]?: string[];
    };
    content: {
      [lang in LanguageCode]?: {
        title: string;
        body: string;
        examples?: string[];
      };
    };
  }>;
}

export interface CapabilitiesCatalogConfig {
  version?: string;
  capabilities: Array<{
    id: string;
    name: {
      [lang in LanguageCode]?: string;
    };
    description: {
      [lang in LanguageCode]?: string;
    };
    examples?: {
      [lang in LanguageCode]?: string[];
    };
    enabled: boolean;
  }>;
}

export interface IntentPatternsConfig {
  version?: string;
  lastUpdated?: string;
  description?: string;
  [intentKey: string]: any;
}

export interface AnalyticsPhrasesConfig {
  version?: string;
  phrases: {
    [category: string]: {
      [lang in LanguageCode]?: string[];
    };
  };
}

export interface DocAliasesConfig {
  version?: string;
  aliases: {
    [alias: string]: string;
  };
}

export interface DocQuerySynonymsConfig {
  version?: string;
  synonyms: {
    [term: string]: string[];
  };
}

/**
 * Individual intent configuration (loaded from {INTENT_ID}.json files)
 */
export interface IndividualIntentConfig {
  intent_id: string;
  name: string;
  description: string;
  category: string;
  priority: string;
  keywords: {
    english: string[];
    portuguese: string[];
    spanish: string[];
  };
  patterns: {
    english: string[];
    portuguese: string[];
    spanish: string[];
  };
  examples: {
    english: string[];
    portuguese: string[];
    spanish: string[];
  };
}

/**
 * Map of all 25 individual intent configurations
 */
export interface IntentConfigsMap {
  DOC_QA?: IndividualIntentConfig;
  DOC_ANALYTICS?: IndividualIntentConfig;
  DOC_MANAGEMENT?: IndividualIntentConfig;
  DOC_SEARCH?: IndividualIntentConfig;
  DOC_SUMMARIZE?: IndividualIntentConfig;
  PREFERENCE_UPDATE?: IndividualIntentConfig;
  MEMORY_STORE?: IndividualIntentConfig;
  MEMORY_RECALL?: IndividualIntentConfig;
  ANSWER_REWRITE?: IndividualIntentConfig;
  ANSWER_EXPAND?: IndividualIntentConfig;
  ANSWER_SIMPLIFY?: IndividualIntentConfig;
  FEEDBACK_POSITIVE?: IndividualIntentConfig;
  FEEDBACK_NEGATIVE?: IndividualIntentConfig;
  PRODUCT_HELP?: IndividualIntentConfig;
  ONBOARDING_HELP?: IndividualIntentConfig;
  FEATURE_REQUEST?: IndividualIntentConfig;
  GENERIC_KNOWLEDGE?: IndividualIntentConfig;
  REASONING_TASK?: IndividualIntentConfig;
  TEXT_TRANSFORM?: IndividualIntentConfig;
  CHITCHAT?: IndividualIntentConfig;
  META_AI?: IndividualIntentConfig;
  OUT_OF_SCOPE?: IndividualIntentConfig;
  AMBIGUOUS?: IndividualIntentConfig;
  SAFETY_CONCERN?: IndividualIntentConfig;
  MULTI_INTENT?: IndividualIntentConfig;
}

/**
 * All 25 intent IDs
 */
export const ALL_INTENT_IDS = [
  'DOC_QA',
  'DOC_ANALYTICS',
  'DOC_MANAGEMENT',
  'DOC_SEARCH',
  'DOC_SUMMARIZE',
  'PREFERENCE_UPDATE',
  'MEMORY_STORE',
  'MEMORY_RECALL',
  'ANSWER_REWRITE',
  'ANSWER_EXPAND',
  'ANSWER_SIMPLIFY',
  'FEEDBACK_POSITIVE',
  'FEEDBACK_NEGATIVE',
  'PRODUCT_HELP',
  'ONBOARDING_HELP',
  'FEATURE_REQUEST',
  'GENERIC_KNOWLEDGE',
  'REASONING_TASK',
  'TEXT_TRANSFORM',
  'CHITCHAT',
  'META_AI',
  'OUT_OF_SCOPE',
  'AMBIGUOUS',
  'SAFETY_CONCERN',
  'MULTI_INTENT',
] as const;

export type IntentId = typeof ALL_INTENT_IDS[number];

/**
 * Complete bundle of all prompt configurations
 */
export interface PromptConfigBundle {
  // Core required configs
  systemPrompts: SystemPromptsConfig;
  answerStyles: AnswerStylesConfig;
  answerExamples: AnswerExamplesConfig;
  markdownComponents: MarkdownComponentsConfig;
  tablePresets: TablePresetsConfig;
  validationPolicies: ValidationPoliciesConfig;
  retrievalPolicies: RetrievalPoliciesConfig;
  errorLocalization: ErrorLocalizationConfig;

  // Optional configs
  languageProfiles?: LanguageProfilesConfig;
  debugLabels?: DebugLabelsConfig;

  // Extended configs (loaded as optional)
  fallbacks?: FallbacksConfig;
  productHelp?: ProductHelpConfig;
  capabilitiesCatalog?: CapabilitiesCatalogConfig;
  intentPatterns?: IntentPatternsConfig;
  analyticsPhrases?: AnalyticsPhrasesConfig;
  docAliases?: DocAliasesConfig;
  docQuerySynonyms?: DocQuerySynonymsConfig;

  // Individual intent configs (all 25 intents)
  intentConfigs: IntentConfigsMap;
}

/**
 * Resolved answer style
 */
export interface AnswerStyleResolved {
  structure?: string;
  tone?: string;
  verbosity?: string;
  formatting?: string[];
}

/**
 * Few-shot example
 */
export interface FewShotExample {
  query: string;
  answer: string;
  context?: string;
}

/**
 * Validation policy
 */
export interface ValidationPolicy {
  category: string;
  name: string;
  description: string;
  rules: Record<string, any>;
}

/**
 * Retrieval policy
 */
export interface RetrievalPolicy {
  intentType: string;
  questionType?: string;
  retrieval: {
    vectorTopK: number;
    bm25TopK: number;
    mergeWeights: {
      vector: number;
      bm25: number;
    };
    minScore: number;
    diversity?: boolean;
  };
  chunking?: {
    maxChunks: number;
    minChunks?: number;
  };
  filtering?: {
    requireExactMatch?: boolean;
    boostRecentDocs?: boolean;
  };
}

// ============================================================================
// LOGGER INTERFACE
// ============================================================================

export interface LoggerLike {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  debug?(message: string, ...args: any[]): void;
}

// ============================================================================
// PROMPT CONFIG SERVICE
// ============================================================================

export class PromptConfigService {
  private bundle: PromptConfigBundle | null = null;
  private dataDir: string;
  private env: 'dev' | 'prod' | 'test';
  private logger: LoggerLike;
  private loadedAt: number = 0;
  private fileMetadata: Array<{ name: string; bytes: number; sha256?: string }> = [];

  constructor(opts: {
    dataDir?: string;
    env: 'dev' | 'prod' | 'test';
    logger?: LoggerLike;
    enableHotReload?: boolean;
  }) {
    this.dataDir = opts.dataDir || resolveDataDir();
    this.env = opts.env;
    this.logger = opts.logger || console;

    if (opts.enableHotReload) {
      this.logger.warn('[PromptConfig] Hot reload requested but not implemented in MVP');
    }
  }

  /**
   * Initialize: Load and validate all JSON files
   * MUST be called once at startup before any requests
   */
  public init(): void {
    const startTime = Date.now();
    this.logger.info(`[PromptConfig] Initializing from ${this.dataDir}`);

    try {
      // Step 1: Assert required files exist
      assertDataFilesExist(this.dataDir, REQUIRED_PROMPT_CONFIG_FILES);

      // Step 2: Load all JSON files
      const systemPrompts = this.loadJSON<SystemPromptsConfig>('system_prompts.json');
      const answerStyles = this.loadJSON<AnswerStylesConfig>('answer_styles.json');
      const answerExamples = this.loadJSON<AnswerExamplesConfig>('answer_examples.json');
      const markdownComponents = this.loadJSON<MarkdownComponentsConfig>('markdown_components.json');
      const tablePresets = this.loadJSON<TablePresetsConfig>('table_presets.json');
      const validationPolicies = this.loadJSON<ValidationPoliciesConfig>('validation_policies.json');
      const retrievalPolicies = this.loadJSON<RetrievalPoliciesConfig>('retrieval_policies.json');
      const errorLocalization = this.loadJSON<ErrorLocalizationConfig>('error_localization.json');

      // Optional files (basic)
      const languageProfiles = this.loadJSONOptional<LanguageProfilesConfig>('language_profiles.json');
      const debugLabels = this.loadJSONOptional<DebugLabelsConfig>('debug_labels.json');

      // Extended optional files
      const fallbacks = this.loadJSONOptional<FallbacksConfig>('fallbacks.json');
      const productHelp = this.loadJSONOptional<ProductHelpConfig>('koda_product_help.json');
      const capabilitiesCatalog = this.loadJSONOptional<CapabilitiesCatalogConfig>('capabilities_catalog.json');
      const intentPatterns = this.loadJSONOptional<IntentPatternsConfig>('intent_patterns.json');
      const analyticsPhrases = this.loadJSONOptional<AnalyticsPhrasesConfig>('analytics_phrases.json');
      const docAliases = this.loadJSONOptional<DocAliasesConfig>('doc_aliases.json');
      const docQuerySynonyms = this.loadJSONOptional<DocQuerySynonymsConfig>('doc_query_synonyms.json');

      // Load all 25 individual intent configs
      const intentConfigs: IntentConfigsMap = {};
      let loadedIntentCount = 0;
      for (const intentId of ALL_INTENT_IDS) {
        const intentConfig = this.loadJSONOptional<IndividualIntentConfig>(`${intentId}.json`);
        if (intentConfig) {
          intentConfigs[intentId] = intentConfig;
          loadedIntentCount++;
        }
      }
      this.logger.info(`[PromptConfig] Loaded ${loadedIntentCount}/${ALL_INTENT_IDS.length} individual intent configs`);

      // Step 3: Validate schemas
      this.validateSystemPrompts(systemPrompts);
      this.validateAnswerStyles(answerStyles);
      this.validateValidationPolicies(validationPolicies);
      this.validateRetrievalPolicies(retrievalPolicies);

      // Step 4: Build bundle
      this.bundle = {
        // Core required
        systemPrompts,
        answerStyles,
        answerExamples,
        markdownComponents,
        tablePresets,
        validationPolicies,
        retrievalPolicies,
        errorLocalization,
        // Basic optional
        languageProfiles,
        debugLabels,
        // Extended optional
        fallbacks,
        productHelp,
        capabilitiesCatalog,
        intentPatterns,
        analyticsPhrases,
        docAliases,
        docQuerySynonyms,
        // Individual intent configs (all 25)
        intentConfigs,
      };

      this.loadedAt = Date.now();
      const duration = this.loadedAt - startTime;

      this.logger.info(
        `[PromptConfig] Loaded ${this.fileMetadata.length} files in ${duration}ms`
      );
    } catch (error: any) {
      this.logger.error(`[PromptConfig] Initialization failed: ${error.message}`);
      throw new Error(`PromptConfig initialization failed: ${error.message}`);
    }
  }

  /**
   * Get the complete configuration bundle
   */
  public getBundle(): PromptConfigBundle {
    this.assertInitialized();
    return this.bundle!;
  }

  /**
   * Get system prompt for intent and language
   */
  public getSystemPrompt(args: {
    intentKey: string;
    language: LanguageCode;
    variant?: string;
  }): string {
    this.assertInitialized();

    const { intentKey, language } = args;

    // Find prompt by mode (intentKey)
    const promptEntry = this.bundle!.systemPrompts.prompts.find(
      (p) => p.mode === intentKey || p.mode.toUpperCase() === intentKey.toUpperCase()
    );

    if (!promptEntry) {
      const error = `System prompt not found for intent: ${intentKey}`;
      if (this.env === 'prod') {
        throw new Error(error);
      } else {
        this.logger.warn(`[PromptConfig] ${error} (using fallback)`);
        return this.getFallbackSystemPrompt(intentKey, language);
      }
    }

    const langData = promptEntry.languages[language];
    if (!langData) {
      const error = `System prompt not found for language: ${language} (intent: ${intentKey})`;
      if (this.env === 'prod') {
        throw new Error(error);
      } else {
        this.logger.warn(`[PromptConfig] ${error} (trying 'en')`);
        return promptEntry.languages['en']?.systemPrompt || this.getFallbackSystemPrompt(intentKey, language);
      }
    }

    return langData.systemPrompt;
  }

  /**
   * Get answer style for intent and language
   */
  public getAnswerStyle(args: {
    styleId: string;
    language: LanguageCode;
    questionType?: string;
  }): AnswerStyleResolved {
    this.assertInitialized();

    const { styleId, language, questionType = 'DEFAULT' } = args;

    const intentStyles = this.bundle!.answerStyles[styleId];
    if (!intentStyles) {
      const error = `Answer style not found for styleId: ${styleId}`;
      if (this.env === 'prod') {
        throw new Error(error);
      } else {
        this.logger.warn(`[PromptConfig] ${error} (using default)`);
        return this.getDefaultAnswerStyle();
      }
    }

    const questionTypeStyles = intentStyles[questionType] || intentStyles['DEFAULT'] || intentStyles[Object.keys(intentStyles)[0]];
    if (!questionTypeStyles) {
      return this.getDefaultAnswerStyle();
    }

    const langStyle = questionTypeStyles[language] || questionTypeStyles['en'];
    return langStyle || this.getDefaultAnswerStyle();
  }

  /**
   * Get few-shot examples
   */
  public getFewShotExamples(args: {
    intentKey: string;
    language: LanguageCode;
    questionType?: string;
    maxExamples: number;
  }): FewShotExample[] {
    this.assertInitialized();

    const { intentKey, language, maxExamples } = args;

    const intentExamples = this.bundle!.answerExamples[intentKey];
    if (!intentExamples) {
      return [];
    }

    const langExamples = intentExamples[language] || intentExamples['en'];
    if (!langExamples || !Array.isArray(langExamples)) {
      return [];
    }

    return langExamples.slice(0, maxExamples);
  }

  /**
   * Get markdown component
   */
  public getMarkdownComponent(args: {
    componentKey: string;
    language: LanguageCode;
  }): string {
    this.assertInitialized();

    const { componentKey, language } = args;

    const component = this.bundle!.markdownComponents.components[componentKey];
    if (!component) {
      this.logger.warn(`[PromptConfig] Markdown component not found: ${componentKey}`);
      return '';
    }

    return component[language] || component['en'] || '';
  }

  /**
   * Get table preset
   */
  public getTablePreset(args: { presetKey: string }): any {
    this.assertInitialized();

    const { presetKey } = args;

    const preset = this.bundle!.tablePresets.presets[presetKey];
    if (!preset) {
      this.logger.warn(`[PromptConfig] Table preset not found: ${presetKey}`);
      return null;
    }

    return preset;
  }

  /**
   * Get validation policy
   */
  public getValidationPolicy(args: { intentKey: string }): ValidationPolicy | null {
    this.assertInitialized();

    const { intentKey } = args;

    const policy = this.bundle!.validationPolicies.policies.find(
      (p) => p.category === intentKey || p.name === intentKey
    );

    if (!policy) {
      this.logger.warn(`[PromptConfig] Validation policy not found: ${intentKey}`);
      return null;
    }

    return policy;
  }

  /**
   * Get retrieval policy
   */
  public getRetrievalPolicy(args: {
    intentKey: string;
    scope?: string;
  }): RetrievalPolicy | null {
    this.assertInitialized();

    const { intentKey } = args;

    const policy = this.bundle!.retrievalPolicies.policies.find(
      (p) => p.intentType === intentKey || p.intentType.toUpperCase() === intentKey.toUpperCase()
    );

    if (!policy) {
      this.logger.warn(`[PromptConfig] Retrieval policy not found: ${intentKey}`);
      return null;
    }

    return policy;
  }

  /**
   * Get localized error message
   */
  public getErrorMessage(args: {
    errorKey: string;
    language: LanguageCode;
  }): string {
    this.assertInitialized();

    const { errorKey, language } = args;

    const errorMessages = this.bundle!.errorLocalization[errorKey];
    if (!errorMessages) {
      return `Error: ${errorKey}`;
    }

    return errorMessages[language] || errorMessages['en'] || `Error: ${errorKey}`;
  }

  /**
   * Get configuration metadata
   */
  public getConfigMeta(): {
    loadedAt: number;
    dataDir: string;
    files: Array<{ name: string; bytes: number; sha256?: string }>;
    version?: string;
  } {
    return {
      loadedAt: this.loadedAt,
      dataDir: this.dataDir,
      files: this.fileMetadata,
      version: this.bundle?.systemPrompts.version,
    };
  }

  // ============================================================================
  // EXTENDED CONFIG GETTERS
  // ============================================================================

  /**
   * Get fallback response by key
   */
  public getFallback(args: {
    fallbackKey: string;
    language: LanguageCode;
    styleId?: string;
  }): string | null {
    this.assertInitialized();

    const { fallbackKey, language, styleId } = args;

    if (!this.bundle!.fallbacks) {
      this.logger.warn('[PromptConfig] Fallbacks config not loaded');
      return null;
    }

    const fallback = this.bundle!.fallbacks.fallbacks.find(f => f.key === fallbackKey);
    if (!fallback) {
      this.logger.warn(`[PromptConfig] Fallback not found: ${fallbackKey}`);
      return null;
    }

    // Find the style (use specified, default, or first available)
    const targetStyleId = styleId || fallback.defaultStyleId || fallback.styles[0]?.id;
    const style = fallback.styles.find(s => s.id === targetStyleId) || fallback.styles[0];

    if (!style) {
      return null;
    }

    const langTemplate = style.languages[language] || style.languages['en'];
    return langTemplate?.template || null;
  }

  /**
   * Get all fallbacks config
   */
  public getFallbacksConfig(): FallbacksConfig | undefined {
    this.assertInitialized();
    return this.bundle!.fallbacks;
  }

  /**
   * Get product help topic
   */
  public getProductHelpTopic(args: {
    topicId: string;
    language: LanguageCode;
  }): { title: string; body: string; examples?: string[] } | null {
    this.assertInitialized();

    const { topicId, language } = args;

    if (!this.bundle!.productHelp) {
      this.logger.warn('[PromptConfig] Product help config not loaded');
      return null;
    }

    const topic = this.bundle!.productHelp.topics.find(t => t.id === topicId);
    if (!topic) {
      this.logger.warn(`[PromptConfig] Product help topic not found: ${topicId}`);
      return null;
    }

    const content = topic.content[language] || topic.content['en'];
    return content || null;
  }

  /**
   * Search product help topics by keyword
   */
  public searchProductHelp(args: {
    keyword: string;
    language: LanguageCode;
  }): Array<{ id: string; title: string }> {
    this.assertInitialized();

    const { keyword, language } = args;

    if (!this.bundle!.productHelp) {
      return [];
    }

    const keywordLower = keyword.toLowerCase();
    const results: Array<{ id: string; title: string }> = [];

    for (const topic of this.bundle!.productHelp.topics) {
      // Check keywords
      const keywords = topic.keywords?.[language] || topic.keywords?.['en'] || [];
      const matchesKeyword = keywords.some(k => k.toLowerCase().includes(keywordLower));

      // Check title/body
      const content = topic.content[language] || topic.content['en'];
      const matchesContent = content && (
        content.title.toLowerCase().includes(keywordLower) ||
        content.body.toLowerCase().includes(keywordLower)
      );

      if (matchesKeyword || matchesContent) {
        results.push({
          id: topic.id,
          title: content?.title || topic.id,
        });
      }
    }

    return results;
  }

  /**
   * Get all product help config
   */
  public getProductHelpConfig(): ProductHelpConfig | undefined {
    this.assertInitialized();
    return this.bundle!.productHelp;
  }

  /**
   * Get capability by ID
   */
  public getCapability(args: {
    capabilityId: string;
    language: LanguageCode;
  }): { name: string; description: string; examples?: string[]; enabled: boolean } | null {
    this.assertInitialized();

    const { capabilityId, language } = args;

    if (!this.bundle!.capabilitiesCatalog) {
      this.logger.warn('[PromptConfig] Capabilities catalog not loaded');
      return null;
    }

    const capability = this.bundle!.capabilitiesCatalog.capabilities.find(c => c.id === capabilityId);
    if (!capability) {
      this.logger.warn(`[PromptConfig] Capability not found: ${capabilityId}`);
      return null;
    }

    return {
      name: capability.name[language] || capability.name['en'] || capabilityId,
      description: capability.description[language] || capability.description['en'] || '',
      examples: capability.examples?.[language] || capability.examples?.['en'],
      enabled: capability.enabled,
    };
  }

  /**
   * Get all enabled capabilities
   */
  public getEnabledCapabilities(language: LanguageCode): Array<{ id: string; name: string; description: string }> {
    this.assertInitialized();

    if (!this.bundle!.capabilitiesCatalog) {
      return [];
    }

    return this.bundle!.capabilitiesCatalog.capabilities
      .filter(c => c.enabled)
      .map(c => ({
        id: c.id,
        name: c.name[language] || c.name['en'] || c.id,
        description: c.description[language] || c.description['en'] || '',
      }));
  }

  /**
   * Get all capabilities catalog config
   */
  public getCapabilitiesCatalogConfig(): CapabilitiesCatalogConfig | undefined {
    this.assertInitialized();
    return this.bundle!.capabilitiesCatalog;
  }

  /**
   * Get intent patterns config
   */
  public getIntentPatternsConfig(): IntentPatternsConfig | undefined {
    this.assertInitialized();
    return this.bundle!.intentPatterns;
  }

  /**
   * Get intent pattern by key
   */
  public getIntentPattern(intentKey: string): any | null {
    this.assertInitialized();

    if (!this.bundle!.intentPatterns) {
      return null;
    }

    return this.bundle!.intentPatterns[intentKey] || null;
  }

  /**
   * Get analytics phrases for a category
   */
  public getAnalyticsPhrases(args: {
    category: string;
    language: LanguageCode;
  }): string[] {
    this.assertInitialized();

    const { category, language } = args;

    if (!this.bundle!.analyticsPhrases?.phrases) {
      return [];
    }

    const categoryPhrases = this.bundle!.analyticsPhrases.phrases[category];
    if (!categoryPhrases) {
      return [];
    }

    return categoryPhrases[language] || categoryPhrases['en'] || [];
  }

  /**
   * Get all analytics phrases config
   */
  public getAnalyticsPhrasesConfig(): AnalyticsPhrasesConfig | undefined {
    this.assertInitialized();
    return this.bundle!.analyticsPhrases;
  }

  /**
   * Resolve document alias to actual document ID/name
   */
  public resolveDocAlias(alias: string): string | null {
    this.assertInitialized();

    if (!this.bundle!.docAliases?.aliases) {
      return null;
    }

    const aliasLower = alias.toLowerCase();

    // Try exact match first
    if (this.bundle!.docAliases.aliases[alias]) {
      return this.bundle!.docAliases.aliases[alias];
    }

    // Try case-insensitive match
    for (const [key, value] of Object.entries(this.bundle!.docAliases.aliases)) {
      if (key.toLowerCase() === aliasLower) {
        return value;
      }
    }

    return null;
  }

  /**
   * Get all doc aliases config
   */
  public getDocAliasesConfig(): DocAliasesConfig | undefined {
    this.assertInitialized();
    return this.bundle!.docAliases;
  }

  /**
   * Get synonyms for a query term
   */
  public getQuerySynonyms(term: string): string[] {
    this.assertInitialized();

    if (!this.bundle!.docQuerySynonyms?.synonyms) {
      return [];
    }

    const termLower = term.toLowerCase();

    // Try exact match
    if (this.bundle!.docQuerySynonyms.synonyms[term]) {
      return this.bundle!.docQuerySynonyms.synonyms[term];
    }

    // Try case-insensitive match
    for (const [key, value] of Object.entries(this.bundle!.docQuerySynonyms.synonyms)) {
      if (key.toLowerCase() === termLower) {
        return value;
      }
    }

    return [];
  }

  /**
   * Expand query with synonyms
   */
  public expandQueryWithSynonyms(query: string): string[] {
    this.assertInitialized();

    if (!this.bundle!.docQuerySynonyms?.synonyms) {
      return [query];
    }

    const words = query.split(/\s+/);
    const expanded: string[] = [query];

    for (const word of words) {
      const synonyms = this.getQuerySynonyms(word);
      for (const synonym of synonyms) {
        const expandedQuery = query.replace(new RegExp(`\\b${word}\\b`, 'gi'), synonym);
        if (!expanded.includes(expandedQuery)) {
          expanded.push(expandedQuery);
        }
      }
    }

    return expanded;
  }

  /**
   * Get all doc query synonyms config
   */
  public getDocQuerySynonymsConfig(): DocQuerySynonymsConfig | undefined {
    this.assertInitialized();
    return this.bundle!.docQuerySynonyms;
  }

  // ============================================================================
  // INDIVIDUAL INTENT CONFIG GETTERS
  // ============================================================================

  /**
   * Get all loaded intent configs
   */
  public getIntentConfigs(): IntentConfigsMap {
    this.assertInitialized();
    return this.bundle!.intentConfigs;
  }

  /**
   * Get individual intent config by ID
   */
  public getIntentConfig(intentId: IntentId): IndividualIntentConfig | undefined {
    this.assertInitialized();
    return this.bundle!.intentConfigs[intentId];
  }

  /**
   * Get keywords for an intent and language
   */
  public getIntentKeywords(intentId: IntentId, language: LanguageCode): string[] {
    this.assertInitialized();

    const config = this.bundle!.intentConfigs[intentId];
    if (!config) {
      return [];
    }

    const langMap: { [key in LanguageCode]: 'english' | 'portuguese' | 'spanish' } = {
      en: 'english',
      pt: 'portuguese',
      es: 'spanish',
    };

    return config.keywords[langMap[language]] || config.keywords.english || [];
  }

  /**
   * Get patterns for an intent and language
   */
  public getIntentPatterns(intentId: IntentId, language: LanguageCode): string[] {
    this.assertInitialized();

    const config = this.bundle!.intentConfigs[intentId];
    if (!config) {
      return [];
    }

    const langMap: { [key in LanguageCode]: 'english' | 'portuguese' | 'spanish' } = {
      en: 'english',
      pt: 'portuguese',
      es: 'spanish',
    };

    return config.patterns[langMap[language]] || config.patterns.english || [];
  }

  /**
   * Get examples for an intent and language
   */
  public getIntentExamples(intentId: IntentId, language: LanguageCode): string[] {
    this.assertInitialized();

    const config = this.bundle!.intentConfigs[intentId];
    if (!config) {
      return [];
    }

    const langMap: { [key in LanguageCode]: 'english' | 'portuguese' | 'spanish' } = {
      en: 'english',
      pt: 'portuguese',
      es: 'spanish',
    };

    return config.examples[langMap[language]] || config.examples.english || [];
  }

  /**
   * Get all intents for a category
   */
  public getIntentsByCategory(category: string): IndividualIntentConfig[] {
    this.assertInitialized();

    const configs = this.bundle!.intentConfigs;
    const results: IndividualIntentConfig[] = [];

    for (const intentId of ALL_INTENT_IDS) {
      const config = configs[intentId];
      if (config && config.category === category) {
        results.push(config);
      }
    }

    return results;
  }

  /**
   * Get all loaded intent IDs
   */
  public getLoadedIntentIds(): IntentId[] {
    this.assertInitialized();

    const configs = this.bundle!.intentConfigs;
    return ALL_INTENT_IDS.filter(id => configs[id] !== undefined);
  }

  /**
   * Check if an intent config is loaded
   */
  public hasIntentConfig(intentId: IntentId): boolean {
    this.assertInitialized();
    return this.bundle!.intentConfigs[intentId] !== undefined;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private assertInitialized(): void {
    if (!this.bundle) {
      throw new Error('PromptConfigService not initialized. Call init() first.');
    }
  }

  private loadJSON<T>(filename: string): T {
    const filePath = path.join(this.dataDir, filename);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);

      this.fileMetadata.push({
        name: filename,
        bytes: Buffer.byteLength(content, 'utf-8'),
      });

      return data as T;
    } catch (error: any) {
      throw new Error(`Failed to load ${filename}: ${error.message}`);
    }
  }

  private loadJSONOptional<T>(filename: string): T | undefined {
    const filePath = path.join(this.dataDir, filename);

    if (!fs.existsSync(filePath)) {
      this.logger.info(`[PromptConfig] Optional file not found: ${filename}`);
      return undefined;
    }

    try {
      return this.loadJSON<T>(filename);
    } catch (error: any) {
      this.logger.warn(`[PromptConfig] Failed to load optional file ${filename}: ${error.message}`);
      return undefined;
    }
  }

  private validateSystemPrompts(config: SystemPromptsConfig): void {
    if (!config.prompts || !Array.isArray(config.prompts)) {
      throw new Error('system_prompts.json: missing or invalid "prompts" array');
    }

    for (const prompt of config.prompts) {
      if (!prompt.mode) {
        throw new Error('system_prompts.json: prompt missing "mode" field');
      }
      if (!prompt.languages || typeof prompt.languages !== 'object') {
        throw new Error(`system_prompts.json: prompt "${prompt.mode}" missing "languages" object`);
      }
    }

    this.logger.info(`[PromptConfig] Validated ${config.prompts.length} system prompts`);
  }

  private validateAnswerStyles(config: AnswerStylesConfig): void {
    const intentKeys = Object.keys(config).filter(k => k !== '_comment');

    if (intentKeys.length === 0) {
      throw new Error('answer_styles.json: no intent keys found');
    }

    this.logger.info(`[PromptConfig] Validated ${intentKeys.length} answer style intents`);
  }

  private validateValidationPolicies(config: ValidationPoliciesConfig): void {
    if (!config.policies || !Array.isArray(config.policies)) {
      throw new Error('validation_policies.json: missing or invalid "policies" array');
    }

    this.logger.info(`[PromptConfig] Validated ${config.policies.length} validation policies`);
  }

  private validateRetrievalPolicies(config: RetrievalPoliciesConfig): void {
    if (!config.policies || !Array.isArray(config.policies)) {
      throw new Error('retrieval_policies.json: missing or invalid "policies" array');
    }

    for (const policy of config.policies) {
      if (!policy.intentType) {
        throw new Error('retrieval_policies.json: policy missing "intentType" field');
      }
      if (!policy.retrieval) {
        throw new Error(`retrieval_policies.json: policy "${policy.intentType}" missing "retrieval" field`);
      }
    }

    this.logger.info(`[PromptConfig] Validated ${config.policies.length} retrieval policies`);
  }

  private getFallbackSystemPrompt(intentKey: string, language: LanguageCode): string {
    return `You are Koda, an AI assistant. Answer the user's question helpfully and accurately.`;
  }

  private getDefaultAnswerStyle(): AnswerStyleResolved {
    return {
      structure: 'paragraph',
      tone: 'professional',
      verbosity: 'balanced',
      formatting: ['markdown'],
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let promptConfigInstance: PromptConfigService | null = null;

/**
 * Get singleton instance of PromptConfigService
 * Must call initPromptConfig() first
 */
export function getPromptConfig(): PromptConfigService {
  if (!promptConfigInstance) {
    throw new Error('PromptConfig not initialized. Call initPromptConfig() at startup.');
  }
  return promptConfigInstance;
}

/**
 * Initialize PromptConfig singleton
 * Call this once at application startup
 */
export function initPromptConfig(opts: {
  dataDir?: string;
  env: 'dev' | 'prod' | 'test';
  logger?: LoggerLike;
}): void {
  if (promptConfigInstance) {
    console.warn('[PromptConfig] Already initialized, skipping');
    return;
  }

  promptConfigInstance = new PromptConfigService(opts);
  promptConfigInstance.init();
}

/**
 * Reset PromptConfig singleton (for testing)
 */
export function resetPromptConfig(): void {
  promptConfigInstance = null;
}
