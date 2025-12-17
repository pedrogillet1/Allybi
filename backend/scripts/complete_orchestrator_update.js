/**
 * Complete orchestrator update for formatting/validation integration
 * Run this ONCE on a clean orchestrator file
 */
const fs = require('fs');
const path = require('path');

const orchestratorPath = path.join(__dirname, '../src/services/core/kodaOrchestratorV3.service.ts');
let content = fs.readFileSync(orchestratorPath, 'utf-8');
let changeCount = 0;

console.log('Starting complete orchestrator update...');

// ============================================================================
// STEP 1: Add import for validation service
// ============================================================================
if (!content.includes('KodaAnswerValidationService')) {
  content = content.replace(
    `import { DocumentSearchService } from '../analytics/documentSearch.service';`,
    `import { DocumentSearchService } from '../analytics/documentSearch.service';
import { KodaAnswerValidationService } from '../validation/kodaAnswerValidation.service';`
  );
  changeCount++;
  console.log('1. Added KodaAnswerValidationService import');
}

// ============================================================================
// STEP 2: Add property declaration
// ============================================================================
if (!content.includes('private readonly validationService: KodaAnswerValidationService')) {
  content = content.replace(
    'private readonly analyticsEngine: AnalyticsEngineService;',
    `private readonly analyticsEngine: AnalyticsEngineService;
  private readonly validationService: KodaAnswerValidationService;`
  );
  changeCount++;
  console.log('2. Added validationService property');
}

// ============================================================================
// STEP 3: Add to constructor parameter type
// ============================================================================
if (!content.includes('validationService: KodaAnswerValidationService;')) {
  content = content.replace(
    `analyticsEngine: AnalyticsEngineService;
    },`,
    `analyticsEngine: AnalyticsEngineService;
      validationService: KodaAnswerValidationService;
    },`
  );
  changeCount++;
  console.log('3. Added validationService to constructor parameter');
}

// ============================================================================
// STEP 4: Add assertion
// ============================================================================
if (!content.includes(`throw new Error('[Orchestrator] validationService is REQUIRED')`)) {
  content = content.replace(
    `if (!services.analyticsEngine) throw new Error('[Orchestrator] analyticsEngine is REQUIRED');`,
    `if (!services.analyticsEngine) throw new Error('[Orchestrator] analyticsEngine is REQUIRED');
    if (!services.validationService) throw new Error('[Orchestrator] validationService is REQUIRED');`
  );
  changeCount++;
  console.log('4. Added validationService assertion');
}

// ============================================================================
// STEP 5: Add assignment
// ============================================================================
if (!content.includes('this.validationService = services.validationService')) {
  content = content.replace(
    'this.analyticsEngine = services.analyticsEngine;',
    `this.analyticsEngine = services.analyticsEngine;
    this.validationService = services.validationService;`
  );
  changeCount++;
  console.log('5. Added validationService assignment');
}

// ============================================================================
// STEP 6: Add helper methods after buildErrorResponse
// ============================================================================
const helperMethods = `

  /**
   * Format simple text responses for non-DOC handlers.
   * Wraps text through formatting pipeline to ensure consistent output.
   */
  private async formatSimple(
    text: string,
    intent: string,
    language: LanguageCode
  ): Promise<string> {
    try {
      const result = await this.formattingPipeline.format({
        text,
        citations: [],
        documents: [],
        intent,
        language,
      });
      return result.markdown || result.text || text;
    } catch (err) {
      this.logger.warn('[Orchestrator] formatSimple error, returning raw text:', err);
      return text;
    }
  }

  /**
   * Apply formatting and validation to a response.
   * Returns formatted fallback if validation fails with error severity.
   */
  private async applyFormatAndValidate(
    response: IntentHandlerResponse,
    intent: string,
    language: LanguageCode,
    skipFormat: boolean = false
  ): Promise<IntentHandlerResponse> {
    let formattedText = response.formatted || response.answer;
    if (!skipFormat && formattedText) {
      formattedText = await this.formatSimple(formattedText, intent, language);
    }

    const validationResult = this.validationService.validate({
      answer: {
        text: formattedText,
        citations: response.citations,
        documentsUsed: response.metadata?.sourceDocumentIds,
      },
      intent: adaptPredictedIntent(
        { primaryIntent: intent as IntentName, confidence: 1, language } as PredictedIntent,
        { text: '', userId: '' }
      ),
      configKeys: {
        styleKey: 'default',
        systemPromptKey: 'default',
        examplesKey: 'default',
        validationPolicyKey: this.getValidationPolicyKey(intent),
      },
    });

    if (!validationResult.passed && validationResult.severity === 'error') {
      this.logger.warn('[Orchestrator] Validation failed:', validationResult.reasons);
      const fallback = this.fallbackConfig.getFallback('LLM_ERROR', 'short_guidance', language);
      const fallbackFormatted = await this.formatSimple(fallback.text, intent, language);
      return {
        answer: fallbackFormatted,
        formatted: fallbackFormatted,
        metadata: {
          ...response.metadata,
          validationFailed: true,
          validationReasons: validationResult.reasons,
        },
      };
    }

    return {
      ...response,
      answer: formattedText,
      formatted: formattedText,
      metadata: {
        ...response.metadata,
        validationPassed: validationResult.passed,
        validationSeverity: validationResult.severity,
      },
    };
  }

  /**
   * Get validation policy key based on intent.
   */
  private getValidationPolicyKey(intent: string): string {
    switch (intent) {
      case 'DOC_QA':
      case 'DOC_ANALYTICS':
        return 'documents.factual';
      case 'DOC_SUMMARIZE':
        return 'documents.summary';
      case 'DOC_SEARCH':
        return 'documents.compare';
      case 'PRODUCT_HELP':
      case 'ONBOARDING_HELP':
        return 'product.help';
      case 'CHITCHAT':
      case 'META_AI':
        return 'chitchat';
      default:
        return 'default';
    }
  }
`;

if (!content.includes('formatSimple')) {
  // Find buildErrorResponse closing brace and insert after
  const buildErrorMatch = content.match(/private buildErrorResponse\(request: OrchestratorRequest, error: any\): IntentHandlerResponse \{[\s\S]*?return \{[\s\S]*?\};\s*\}/);
  if (buildErrorMatch) {
    const insertIdx = buildErrorMatch.index + buildErrorMatch[0].length;
    content = content.slice(0, insertIdx) + helperMethods + content.slice(insertIdx);
    changeCount++;
    console.log('6. Added helper methods (formatSimple, applyFormatAndValidate, getValidationPolicyKey)');
  } else {
    console.error('ERROR: Could not find buildErrorResponse to insert helpers after');
  }
}

// ============================================================================
// STEP 7: Update handleChitchat to use formatter
// ============================================================================
const chitchatOld = `private async handleChitchat(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    // Simple chitchat responses
    const greetingPatterns = ['hello', 'hi', 'hey', 'olá', 'oi', 'hola'];
    const isGreeting = greetingPatterns.some(p => request.text.toLowerCase().includes(p));

    if (isGreeting) {
      const greetings: Record<LanguageCode, string> = {
        en: "Hello! I'm Koda, your document assistant. How can I help you today?",
        pt: "Olá! Sou o Koda, seu assistente de documentos. Como posso ajudá-lo hoje?",
        es: "¡Hola! Soy Koda, tu asistente de documentos. ¿Cómo puedo ayudarte hoy?",
      };

      return {
        answer: greetings[language] || greetings['en'],
        formatted: greetings[language] || greetings['en'],
      };
    }

    // Default chitchat response
    const responses: Record<LanguageCode, string> = {
      en: "I'm here to help with your documents! Feel free to ask me anything about them.",
      pt: "Estou aqui para ajudar com seus documentos! Fique à vontade para me perguntar qualquer coisa sobre eles.",
      es: "¡Estoy aquí para ayudar con tus documentos! No dudes en preguntarme cualquier cosa sobre ellos.",
    };

    return {
      answer: responses[language] || responses['en'],
      formatted: responses[language] || responses['en'],
    };
  }`;

const chitchatNew = `private async handleChitchat(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    // Simple chitchat responses
    const greetingPatterns = ['hello', 'hi', 'hey', 'olá', 'oi', 'hola'];
    const isGreeting = greetingPatterns.some(p => request.text.toLowerCase().includes(p));

    let responseText: string;
    if (isGreeting) {
      const greetings: Record<LanguageCode, string> = {
        en: "Hello! I'm Koda, your document assistant. How can I help you today?",
        pt: "Olá! Sou o Koda, seu assistente de documentos. Como posso ajudá-lo hoje?",
        es: "¡Hola! Soy Koda, tu asistente de documentos. ¿Cómo puedo ayudarte hoy?",
      };
      responseText = greetings[language] || greetings['en'];
    } else {
      const responses: Record<LanguageCode, string> = {
        en: "I'm here to help with your documents! Feel free to ask me anything about them.",
        pt: "Estou aqui para ajudar com seus documentos! Fique à vontade para me perguntar qualquer coisa sobre eles.",
        es: "¡Estoy aquí para ayudar con tus documentos! No dudes en preguntarme cualquier cosa sobre ellos.",
      };
      responseText = responses[language] || responses['en'];
    }

    const formatted = await this.formatSimple(responseText, 'CHITCHAT', language);
    return { answer: formatted, formatted, metadata: { _formatted: true } };
  }`;

if (content.includes(chitchatOld)) {
  content = content.replace(chitchatOld, chitchatNew);
  changeCount++;
  console.log('7. Updated handleChitchat to use formatter');
}

// ============================================================================
// STEP 8: Update handleMetaAI to use formatter
// ============================================================================
const metaAIOld = `private async handleMetaAI(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { language } = context;

    const responses: Record<LanguageCode, string> = {
      en: "I'm Koda, an AI assistant specialized in helping you work with your documents. I use advanced language models to understand your questions and find answers in your uploaded files.",
      pt: "Sou Koda, um assistente de IA especializado em ajudá-lo a trabalhar com seus documentos. Uso modelos de linguagem avançados para entender suas perguntas e encontrar respostas em seus arquivos enviados.",
      es: "Soy Koda, un asistente de IA especializado en ayudarte a trabajar con tus documentos. Utilizo modelos de lenguaje avanzados para entender tus preguntas y encontrar respuestas en tus archivos subidos.",
    };

    return {
      answer: responses[language] || responses['en'],
      formatted: responses[language] || responses['en'],
    };
  }`;

const metaAINew = `private async handleMetaAI(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { language } = context;

    const responses: Record<LanguageCode, string> = {
      en: "I'm Koda, an AI assistant specialized in helping you work with your documents. I use advanced language models to understand your questions and find answers in your uploaded files.",
      pt: "Sou Koda, um assistente de IA especializado em ajudá-lo a trabalhar com seus documentos. Uso modelos de linguagem avançados para entender suas perguntas e encontrar respostas em seus arquivos enviados.",
      es: "Soy Koda, un asistente de IA especializado en ayudarte a trabajar con tus documentos. Utilizo modelos de lenguaje avanzados para entender tus preguntas y encontrar respuestas en tus archivos subidos.",
    };

    const responseText = responses[language] || responses['en'];
    const formatted = await this.formatSimple(responseText, 'META_AI', language);
    return { answer: formatted, formatted, metadata: { _formatted: true } };
  }`;

if (content.includes(metaAIOld)) {
  content = content.replace(metaAIOld, metaAINew);
  changeCount++;
  console.log('8. Updated handleMetaAI to use formatter');
}

// ============================================================================
// STEP 9: Update handlePreferenceUpdate to use formatter
// ============================================================================
const prefOld = `private async handlePreferenceUpdate(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { language } = context;

    const confirmationMessages: Record<LanguageCode, string> = {
      en: "I've noted your preference. Settings will be updated in a future release.",
      pt: "Anotei sua preferência. As configurações serão atualizadas em uma versão futura.",
      es: "He anotado tu preferencia. La configuración se actualizará en una versión futura.",
    };

    return {
      answer: confirmationMessages[language] || confirmationMessages['en'],
      formatted: confirmationMessages[language] || confirmationMessages['en'],
    };
  }`;

const prefNew = `private async handlePreferenceUpdate(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { language } = context;

    const confirmationMessages: Record<LanguageCode, string> = {
      en: "I've noted your preference. Settings will be updated in a future release.",
      pt: "Anotei sua preferência. As configurações serão atualizadas em uma versão futura.",
      es: "He anotado tu preferencia. La configuración se actualizará en una versión futura.",
    };

    const responseText = confirmationMessages[language] || confirmationMessages['en'];
    const formatted = await this.formatSimple(responseText, 'PREFERENCE_UPDATE', language);
    return { answer: formatted, formatted, metadata: { _formatted: true } };
  }`;

if (content.includes(prefOld)) {
  content = content.replace(prefOld, prefNew);
  changeCount++;
  console.log('9. Updated handlePreferenceUpdate to use formatter');
}

// ============================================================================
// STEP 10: Update handleMemoryStore to use formatter
// ============================================================================
const memStoreOld = `private async handleMemoryStore(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    // Add to conversation memory via addMessage (if conversation exists)
    if (request.conversationId) {
      await this.conversationMemory.addMessage(
        request.conversationId,
        'user',
        request.text
      );
    }

    const confirmationMessages: Record<LanguageCode, string> = {
      en: "I'll remember that!",
      pt: "Vou me lembrar disso!",
      es: "¡Lo recordaré!",
    };

    return {
      answer: confirmationMessages[language] || confirmationMessages['en'],
      formatted: confirmationMessages[language] || confirmationMessages['en'],
    };
  }`;

const memStoreNew = `private async handleMemoryStore(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    // Add to conversation memory via addMessage (if conversation exists)
    if (request.conversationId) {
      await this.conversationMemory.addMessage(
        request.conversationId,
        'user',
        request.text
      );
    }

    const confirmationMessages: Record<LanguageCode, string> = {
      en: "I'll remember that!",
      pt: "Vou me lembrar disso!",
      es: "¡Lo recordaré!",
    };

    const responseText = confirmationMessages[language] || confirmationMessages['en'];
    const formatted = await this.formatSimple(responseText, 'MEMORY_STORE', language);
    return { answer: formatted, formatted, metadata: { _formatted: true } };
  }`;

if (content.includes(memStoreOld)) {
  content = content.replace(memStoreOld, memStoreNew);
  changeCount++;
  console.log('10. Updated handleMemoryStore to use formatter');
}

// ============================================================================
// STEP 11: Update buildFallbackResponse to be async and use formatter
// ============================================================================
const fallbackOld = `private buildFallbackResponse(
    context: HandlerContext,
    scenarioKey: string,
    customMessage?: string
  ): IntentHandlerResponse {
    const language = context.language || context.intent?.language || 'en';

    if (customMessage) {
      return {
        answer: customMessage,
        formatted: customMessage,
      };
    }

    const fallback = this.fallbackConfig.getFallback(
      scenarioKey as any,
      'short_guidance',
      language
    );

    return {
      answer: fallback.text,
      formatted: fallback.text,
      metadata: fallback.metadata as any,
    };
  }`;

const fallbackNew = `private async buildFallbackResponse(
    context: HandlerContext,
    scenarioKey: string,
    customMessage?: string
  ): Promise<IntentHandlerResponse> {
    const language = context.language || context.intent?.language || 'en';
    const intent = context.intent?.primaryIntent || 'UNKNOWN';

    let responseText: string;
    if (customMessage) {
      responseText = customMessage;
    } else {
      const fallback = this.fallbackConfig.getFallback(
        scenarioKey as any,
        'short_guidance',
        language
      );
      responseText = fallback.text;
    }

    const formatted = await this.formatSimple(responseText, intent, language);
    return {
      answer: formatted,
      formatted,
      metadata: { _formatted: true, fallbackScenario: scenarioKey },
    };
  }`;

if (content.includes(fallbackOld)) {
  content = content.replace(fallbackOld, fallbackNew);
  changeCount++;
  console.log('11. Updated buildFallbackResponse to async with formatter');
}

// ============================================================================
// STEP 12: Update buildErrorResponse to be async and use formatter
// ============================================================================
const errorOld = `private buildErrorResponse(request: OrchestratorRequest, error: any): IntentHandlerResponse {
    this.logger.error('[Orchestrator] Error:', error);

    const fallback = this.fallbackConfig.getFallback(
      'LLM_ERROR',
      'one_liner',
      request.language || 'en'
    );

    return {
      answer: fallback.text,
      formatted: fallback.text,
    };
  }`;

const errorNew = `private async buildErrorResponse(request: OrchestratorRequest, error: any): Promise<IntentHandlerResponse> {
    this.logger.error('[Orchestrator] Error:', error);

    const language = request.language || 'en';
    const fallback = this.fallbackConfig.getFallback(
      'LLM_ERROR',
      'one_liner',
      language
    );

    const formatted = await this.formatSimple(fallback.text, 'UNKNOWN', language);
    return {
      answer: formatted,
      formatted,
      metadata: { _formatted: true, error: true },
    };
  }`;

if (content.includes(errorOld)) {
  content = content.replace(errorOld, errorNew);
  changeCount++;
  console.log('12. Updated buildErrorResponse to async with formatter');
}

// ============================================================================
// STEP 13: Update calls to buildFallbackResponse to use await
// ============================================================================
// handleOutOfScope
content = content.replace(
  'return this.buildFallbackResponse(context, \'OUT_OF_SCOPE\');',
  'return await this.buildFallbackResponse(context, \'OUT_OF_SCOPE\');'
);
// handleAmbiguous
content = content.replace(
  'return this.buildFallbackResponse(context, \'AMBIGUOUS_QUESTION\');',
  'return await this.buildFallbackResponse(context, \'AMBIGUOUS_QUESTION\');'
);
// handleSafetyConcern - already uses OUT_OF_SCOPE
// handleDocSummarize fallback
content = content.replace(
  /return this\.buildFallbackResponse\(context, 'AMBIGUOUS_QUESTION', 'Which document/g,
  'return await this.buildFallbackResponse(context, \'AMBIGUOUS_QUESTION\', \'Which document'
);
console.log('13. Updated fallback response calls to use await');

// ============================================================================
// STEP 14: Update catch blocks to use await on buildErrorResponse
// ============================================================================
content = content.replace(
  /return this\.buildErrorResponse\(request, error\);/g,
  'return await this.buildErrorResponse(request, error);'
);
console.log('14. Updated error response calls to use await');

// ============================================================================
// Write the updated file
// ============================================================================
fs.writeFileSync(orchestratorPath, content);
console.log(`\nDone! Made ${changeCount} major changes to orchestrator.`);
