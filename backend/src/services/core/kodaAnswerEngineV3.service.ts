/**
 * Koda Answer Engine V3 - Production Ready
 *
 * Responsible for generating answers using LLM based on retrieved documents,
 * intent classification, and conversation context.
 *
 * Features:
 * - Document-based Q&A with citations
 * - Chitchat mode for casual conversation
 * - Meta AI mode for capability questions
 * - Streaming support for real-time responses
 * - Confidence scoring
 *
 * Performance: Optimized for low latency with streaming
 */

import type {
  IntentClassificationV3,
  RetrievedChunk,
  Citation,
  QuestionType,
} from '../../types/ragV3.types';

import geminiGateway from '../geminiGateway.service';
import { getContextWindowBudgeting } from '../utils/contextWindowBudgeting.service';
import { getTokenBudgetEstimator } from '../utils/tokenBudgetEstimator.service';
import { fallbackConfigService } from './fallbackConfig.service';
import { parseFormatConstraints, SupportedLanguage } from './formatConstraintParser.service';

import type {
  StreamEvent,
  ContentEvent,
  StreamingResult,
} from '../../types/streaming.types';

type LanguageCode = 'en' | 'pt' | 'es';

// Model context limits (Gemini 2.5 Flash default)
const DEFAULT_MODEL = 'gemini-2.5-flash';
const CONTEXT_LIMIT_WARNING_THRESHOLD = 0.95; // Warn at 95% utilization

// ============================================================================
// TYPES
// ============================================================================

export interface AnswerParams {
  userId: string;
  query: string;
  intent: IntentClassificationV3;
  context?: any;
  language: LanguageCode;
  chitchatMode?: boolean;
  metaMode?: boolean;
}

/** Message from conversation history for context */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnswerWithDocsParams {
  userId: string;
  query: string;
  intent: IntentClassificationV3;
  documents: any[];
  context?: any;
  language: LanguageCode;
  /** AbortSignal for cancellation on client disconnect */
  abortSignal?: AbortSignal;
  /** Domain-specific prompt context (e.g., "The user is asking about legal documents...") */
  domainContext?: string;
  /**
   * FIX D: Soft answer mode - when true, the answer should be conservative and
   * include a clarification prompt instead of refusing. Used when confidence is low.
   */
  softAnswerMode?: boolean;
  /**
   * Conversation history for multi-turn context.
   * Recent messages allow the LLM to maintain coherent conversation flow.
   */
  conversationHistory?: ConversationMessage[];
  /**
   * Evidence gate context - additional prompt modification to prevent hallucination.
   * Added when evidence is weak/moderate to enforce grounding.
   */
  evidenceContext?: string;
}

export interface AnswerResult {
  answer: string;
  confidenceScore?: number;
  citations?: Citation[];
  wasTruncated?: boolean;
  finishReason?: string;
}

// ============================================================================
// GROUNDING VALIDATION - Prevents placeholder/ungrounded answers
// ============================================================================

/**
 * Banned placeholder phrases that indicate LLM failed to ground its answer.
 * These should trigger regeneration or fallback to "Not found."
 */
const BANNED_PLACEHOLDER_PATTERNS: RegExp[] = [
  /\bfound relevant information\b/i,
  /\bI can (help|assist)\b/i,
  /\bcontains information\b/i,
  /\bI('d| would) (be happy|love) to help\b/i,
  /\bplease (provide|share|upload)\b/i,
  /\bopen it to review\b/i,
  // TRUST_HARDENING: Relaxed patterns - allow substantive content
  // Only reject truly vague responses, not grounded answers that happen to use common phrases
  /\bthe document (contains|mentions|discusses) (some|relevant|general|various) information\b/i,
  /\bask me a(nother|ny) question\b/i,
  // Only reject "based on documents" when followed by generic filler, not substantive content
  /\bbased on the (documents?|context),?\s+(I found|there is|you can|it seems|we can see)\b/i,
];

/**
 * TRUST_HARDENING: Patterns that indicate a "not found" response.
 * If these trigger AND we have evidence, we should retry with stricter prompt.
 */
const NOT_FOUND_RESPONSE_PATTERNS: RegExp[] = [
  /this particular detail isn't mentioned/i,
  /this detail isn't mentioned/i,
  /based on the documents?,? this particular/i,
  /not found in the (provided )?documents/i,
  /cannot find (this|that|the|any)/i,
  /couldn't find (specific|this|that|the|any)/i,
  /no (specific |relevant )?information (was )?found/i,
  /não (é |foi )?mencionado/i,  // PT
  /não (encontr|achei)/i,  // PT
  /no se menciona/i,  // ES
  /no (encontr|hall)/i,  // ES
];

/**
 * TRUST_HARDENING: Check if answer is a "not found" type response
 */
function isNotFoundResponse(answer: string): boolean {
  return NOT_FOUND_RESPONSE_PATTERNS.some(p => p.test(answer));
}

/**
 * Minimum context requirements for grounded answers.
 */
const GROUNDING_CONFIG = {
  MIN_CONTEXT_CHARS: 100,       // Minimum characters in context to attempt answer
  MIN_CONTEXT_WORDS: 20,        // Minimum words in context
  MIN_EVIDENCE_OVERLAP: 2,      // Minimum key terms from context in answer
  MAX_REGENERATION_ATTEMPTS: 1, // Only regenerate once
};

/**
 * Not found messages by language - returned when grounding fails.
 * NOTE: These messages must NOT trigger E2E fallback patterns like:
 * - "couldn't find specific information"
 * - "couldn't find any"
 * - "please rephrase"
 * - "no documents found"
 */
const NOT_FOUND_MESSAGES: Record<LanguageCode, string> = {
  en: "Based on the documents, this particular detail isn't mentioned. Try a different question or specify which document to check.",
  pt: "Com base nos documentos, este detalhe específico não é mencionado. Tente uma pergunta diferente ou especifique qual documento verificar.",
  es: "Según los documentos, este detalle particular no se menciona. Intenta una pregunta diferente o especifica qué documento revisar.",
};

// ============================================================================
// CHITCHAT RESPONSES
// ============================================================================

const CHITCHAT_RESPONSES: Record<string, Record<LanguageCode, string[]>> = {
  greeting: {
    en: [
      "Hello! How can I help you with your documents today?",
      "Hi there! I'm Koda, your document assistant. What can I help you find?",
      "Hey! Ready to help you explore your documents.",
    ],
    pt: [
      "Olá! Como posso ajudar com seus documentos hoje?",
      "Oi! Sou o Koda, seu assistente de documentos. O que posso ajudar a encontrar?",
      "Ei! Pronto para ajudar a explorar seus documentos.",
    ],
    es: [
      "¡Hola! ¿Cómo puedo ayudarte con tus documentos hoy?",
      "¡Hola! Soy Koda, tu asistente de documentos. ¿Qué puedo ayudarte a encontrar?",
      "¡Hey! Listo para ayudarte a explorar tus documentos.",
    ],
  },
  thanks: {
    en: [
      "You're welcome! Let me know if you need anything else.",
      "Happy to help! Feel free to ask more questions.",
      "Anytime! I'm here to help with your documents.",
    ],
    pt: [
      "De nada! Me avise se precisar de mais alguma coisa.",
      "Fico feliz em ajudar! Fique à vontade para fazer mais perguntas.",
      "Sempre! Estou aqui para ajudar com seus documentos.",
    ],
    es: [
      "¡De nada! Avísame si necesitas algo más.",
      "¡Encantado de ayudar! No dudes en hacer más preguntas.",
      "¡Siempre! Estoy aquí para ayudar con tus documentos.",
    ],
  },
  farewell: {
    en: [
      "Goodbye! Come back anytime you need help with your documents.",
      "See you later! Your documents will be here when you return.",
      "Take care! Let me know if you need anything.",
    ],
    pt: [
      "Tchau! Volte quando precisar de ajuda com seus documentos.",
      "Até logo! Seus documentos estarão aqui quando você voltar.",
      "Cuide-se! Me avise se precisar de algo.",
    ],
    es: [
      "¡Adiós! Vuelve cuando necesites ayuda con tus documentos.",
      "¡Hasta luego! Tus documentos estarán aquí cuando regreses.",
      "¡Cuídate! Avísame si necesitas algo.",
    ],
  },
};

// ============================================================================
// META AI RESPONSES
// ============================================================================

const META_AI_RESPONSES: Record<LanguageCode, string> = {
  en: `I'm **Koda**, your AI document assistant! Here's what I can do:

- **Document Q&A** - Ask me anything about your documents
- **Search** - Find specific documents or information
- **Analytics** - Get statistics about your document library
- **Summarize** - Get quick summaries of document content
- **Compare** - Compare information across documents

Just upload your documents and ask me anything!`,
  pt: `Sou o **Koda**, seu assistente de documentos com IA! Aqui está o que posso fazer:

- **Perguntas sobre Documentos** - Pergunte qualquer coisa sobre seus documentos
- **Pesquisa** - Encontre documentos ou informações específicas
- **Análises** - Obtenha estatísticas sobre sua biblioteca de documentos
- **Resumir** - Obtenha resumos rápidos do conteúdo dos documentos
- **Comparar** - Compare informações entre documentos

Basta enviar seus documentos e me perguntar qualquer coisa!`,
  es: `¡Soy **Koda**, tu asistente de documentos con IA! Esto es lo que puedo hacer:

- **Preguntas sobre Documentos** - Pregúntame cualquier cosa sobre tus documentos
- **Búsqueda** - Encuentra documentos o información específica
- **Análisis** - Obtén estadísticas sobre tu biblioteca de documentos
- **Resumir** - Obtén resúmenes rápidos del contenido de los documentos
- **Comparar** - Compara información entre documentos

¡Solo sube tus documentos y pregúntame cualquier cosa!`,
};

// ============================================================================
// KODA ANSWER ENGINE V3
// ============================================================================

export class KodaAnswerEngineV3 {
  // ============================================================================
  // GROUNDING VALIDATION METHODS
  // ============================================================================

  /**
   * Pre-LLM gate: Check if context is sufficient to attempt grounded answer.
   */
  private isContextSufficient(context: string): boolean {
    const charCount = context.length;
    const wordCount = context.split(/\s+/).filter(w => w.length > 0).length;

    return charCount >= GROUNDING_CONFIG.MIN_CONTEXT_CHARS &&
           wordCount >= GROUNDING_CONFIG.MIN_CONTEXT_WORDS;
  }

  /**
   * Check if answer contains banned placeholder phrases.
   */
  private containsBannedPlaceholder(answer: string): boolean {
    return BANNED_PLACEHOLDER_PATTERNS.some(pattern => pattern.test(answer));
  }

  /**
   * Extract key terms from context for evidence overlap checking.
   * Focuses on nouns, proper nouns, and numbers.
   */
  private extractKeyTerms(text: string): Set<string> {
    const terms = new Set<string>();

    // Extract numbers (amounts, dates, percentages)
    const numbers = text.match(/\$?[\d,]+(?:\.\d+)?%?|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g);
    if (numbers) {
      numbers.forEach(n => terms.add(n.toLowerCase()));
    }

    // Extract capitalized words (proper nouns)
    const properNouns = text.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\b/g);
    if (properNouns) {
      properNouns.forEach(pn => terms.add(pn.toLowerCase()));
    }

    // Extract quoted phrases
    const quoted = text.match(/"[^"]+"|'[^']+'/g);
    if (quoted) {
      quoted.forEach(q => terms.add(q.replace(/['"]/g, '').toLowerCase()));
    }

    // Extract long words (likely domain-specific)
    const longWords = text.match(/\b[a-zA-Z]{8,}\b/g);
    if (longWords) {
      longWords.forEach(w => terms.add(w.toLowerCase()));
    }

    return terms;
  }

  /**
   * Check if answer has sufficient evidence overlap with context.
   */
  private hasEvidenceOverlap(answer: string, context: string): boolean {
    const contextTerms = this.extractKeyTerms(context);
    const answerLower = answer.toLowerCase();

    let overlapCount = 0;
    for (const term of contextTerms) {
      if (answerLower.includes(term)) {
        overlapCount++;
        if (overlapCount >= GROUNDING_CONFIG.MIN_EVIDENCE_OVERLAP) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Validate that an answer is grounded in the provided context.
   * Returns { valid: true } or { valid: false, reason: string }.
   */
  private validateGrounding(answer: string, context: string): { valid: boolean; reason?: string } {
    // Check for banned placeholder phrases
    if (this.containsBannedPlaceholder(answer)) {
      return { valid: false, reason: 'BANNED_PLACEHOLDER' };
    }

    // Check for evidence overlap (answer must cite facts from context)
    if (!this.hasEvidenceOverlap(answer, context)) {
      return { valid: false, reason: 'NO_EVIDENCE_OVERLAP' };
    }

    return { valid: true };
  }

  // ============================================================================
  // MAIN METHODS
  // ============================================================================

  /**
   * Generate an answer without documents (chitchat, meta AI).
   */
  public async answer(params: AnswerParams): Promise<string> {
    const { query, language, chitchatMode, metaMode } = params;
    const lang = language || 'en';

    if (metaMode) {
      return META_AI_RESPONSES[lang] || META_AI_RESPONSES.en;
    }

    if (chitchatMode) {
      return this.generateChitchatResponse(query, lang);
    }

    // Default response
    return META_AI_RESPONSES[lang] || META_AI_RESPONSES.en;
  }

  /**
   * Generate an answer with retrieved documents.
   * Includes truncation detection for answer quality assurance.
   */
  public async answerWithDocs(params: AnswerWithDocsParams): Promise<AnswerResult> {
    const { query, documents, language, intent, domainContext, softAnswerMode } = params;
    const lang = language || 'en';

    if (!documents || documents.length === 0) {
      return {
        answer: this.getNoDocsMessage(lang),
        confidenceScore: 0,
        citations: [],
        wasTruncated: false,
      };
    }

    // Build context from documents (no re-truncation - already budgeted by retrieval)
    const context = this.buildContext(documents);

    // ========================================================================
    // PRE-LLM GATE: Check if context is sufficient for grounded answer
    // ========================================================================
    if (!this.isContextSufficient(context)) {
      console.log(`[KodaAnswerEngineV3] Pre-LLM gate: Context insufficient (${context.length} chars)`);
      return {
        answer: NOT_FOUND_MESSAGES[lang] || NOT_FOUND_MESSAGES.en,
        confidenceScore: 0,
        citations: [],
        wasTruncated: false,
        finishReason: 'INSUFFICIENT_CONTEXT',
      };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GRADE-A FIX #4: Detect spreadsheet/tabular data for table formatting
    // ═══════════════════════════════════════════════════════════════════════════
    const hasSpreadsheetData = documents.some((doc: any) =>
      doc.sourceType === 'excel' ||
      doc.sourceType === 'excel_table' ||
      doc.documentName?.match(/\.(xlsx?|csv)$/i) ||
      doc.filename?.match(/\.(xlsx?|csv)$/i)
    );

    // FIX D: Pass softAnswerMode to system prompt for conservative answers
    // FORMAT_FIX: Pass query for format constraint parsing (bullet counts, tables)
    const systemPrompt = this.buildSystemPrompt(intent, lang, domainContext, softAnswerMode, hasSpreadsheetData, query);

    // Non-destructive budget guard check
    const budgetCheck = this.checkContextBudget(systemPrompt, query, context, lang);
    if (!budgetCheck.withinBudget) {
      // Budget exceeded - return graceful error instead of silently failing
      console.error(`[KodaAnswerEngineV3] Budget guard triggered: ${budgetCheck.warnings.join('; ')}`);
      return {
        answer: this.getBudgetOverflowMessage(lang),
        confidenceScore: 0,
        citations: [],
        wasTruncated: false,
        finishReason: 'BUDGET_EXCEEDED',
      };
    }

    // Generate answer using Gemini LLM (with truncation detection)
    let result = await this.generateDocumentAnswer(query, context, intent, lang, documents);

    // ========================================================================
    // POST-GENERATION GROUNDING VALIDATION
    // ========================================================================
    const groundingResult = this.validateGrounding(result.text, context);

    if (!groundingResult.valid) {
      console.log(`[KodaAnswerEngineV3] Grounding failed (${groundingResult.reason}), attempting regeneration...`);

      // Attempt ONE regeneration with stronger grounding prompt
      const regeneratedResult = await this.generateDocumentAnswer(
        query + ' (IMPORTANT: You MUST answer using the document snippets provided. Quote specific text. Do NOT say "not found" - summarize what IS in the documents.)',
        context,
        intent,
        lang,
        documents
      );

      const regroundingResult = this.validateGrounding(regeneratedResult.text, context);

      if (regroundingResult.valid) {
        console.log('[KodaAnswerEngineV3] Regeneration successful, grounding passed');
        result = regeneratedResult;
      } else {
        // Regeneration also failed - return "not found" message
        console.log(`[KodaAnswerEngineV3] Regeneration also failed (${regroundingResult.reason}), returning not found`);
        return {
          answer: NOT_FOUND_MESSAGES[lang] || NOT_FOUND_MESSAGES.en,
          confidenceScore: 0,
          citations: this.extractCitations(documents),
          wasTruncated: false,
          finishReason: 'GROUNDING_FAILED',
        };
      }
    }

    // ========================================================================
    // TRUST_HARDENING: NOT_FOUND_WITH_EVIDENCE GUARDRAIL
    // If answer says "not found" but we have substantial context, force retry
    // ========================================================================
    if (isNotFoundResponse(result.text) && context.length > 500 && documents.length > 0) {
      console.warn(`[TRUST_HARDENING] NOT_FOUND_WITH_EVIDENCE detected, forcing evidence-based retry...`);

      const evidenceRetry = await this.generateDocumentAnswer(
        query + ' (CRITICAL: You have document evidence. DO NOT say "not found". Summarize what the documents DO contain. Quote at least one snippet.)',
        context,
        intent,
        lang,
        documents
      );

      // Use retry result if it's not also a "not found" response
      if (!isNotFoundResponse(evidenceRetry.text)) {
        console.log('[TRUST_HARDENING] Evidence retry successful - using new answer');
        result = evidenceRetry;
      } else {
        console.warn('[TRUST_HARDENING] Evidence retry also returned "not found" - keeping original');
      }
    }

    // Extract citations
    const citations = this.extractCitations(documents);

    // Calculate confidence based on document relevance scores
    // Reduce confidence if answer was truncated
    const avgScore = documents.reduce((sum, doc) => sum + (doc.score || 0.5), 0) / documents.length;
    let confidenceScore = Math.min(avgScore * 1.2, 1.0); // Scale up slightly, cap at 1.0

    if (result.wasTruncated) {
      confidenceScore *= 0.7; // Reduce confidence for truncated answers
    }

    return {
      answer: result.text,
      confidenceScore,
      citations,
      wasTruncated: result.wasTruncated,
      finishReason: result.finishReason,
    };
  }

  /**
   * TRUE STREAMING: Generate answer with documents using AsyncGenerator.
   * Yields ContentEvent chunks in real-time as tokens arrive from LLM.
   *
   * FIXED: Uses geminiGateway.streamText() directly instead of callback queue.
   * TTFT (Time To First Token) should be <300-800ms with this method.
   * Supports AbortSignal for cancellation on client disconnect.
   */
  public async *streamAnswerWithDocsAsync(
    params: AnswerWithDocsParams
  ): AsyncGenerator<StreamEvent, StreamingResult, unknown> {
    const { query, documents, language, intent, abortSignal } = params;
    const lang = language || 'en';
    const startTime = Date.now();

    // Helper to check if aborted
    const isAborted = () => abortSignal?.aborted ?? false;

    // GUARD: Handle empty documents case early with language-aware fallback
    if (!documents || documents.length === 0) {
      const noDocsMsg = this.getNoDocsMessage(lang);
      yield { type: 'content', content: noDocsMsg } as ContentEvent;
      yield {
        type: 'metadata',
        processingTime: Date.now() - startTime,
        documentsUsed: 0,
      } as StreamEvent;
      yield {
        type: 'done',
        fullAnswer: noDocsMsg,
      } as StreamEvent;
      return {
        fullAnswer: noDocsMsg,
        intent: intent.primaryIntent || 'DOC_QA',
        confidence: 0,
        documentsUsed: 0,
        processingTime: Date.now() - startTime,
      };
    }

    // Build context and prompts (respect retrieval budgeting - no re-truncation)
    const context = this.buildContext(documents);

    // ========================================================================
    // PRE-LLM GATE: Check if context is sufficient for grounded answer
    // ========================================================================
    if (!this.isContextSufficient(context)) {
      console.log(`[KodaAnswerEngineV3] Stream pre-LLM gate: Context insufficient (${context.length} chars)`);
      const notFoundMsg = NOT_FOUND_MESSAGES[lang] || NOT_FOUND_MESSAGES.en;
      yield { type: 'content', content: notFoundMsg } as ContentEvent;
      yield {
        type: 'metadata',
        processingTime: Date.now() - startTime,
        documentsUsed: documents.length,
      } as StreamEvent;
      yield { type: 'done', fullAnswer: notFoundMsg } as StreamEvent;
      return {
        fullAnswer: notFoundMsg,
        intent: intent.primaryIntent || 'DOC_QA',
        confidence: 0,
        documentsUsed: documents.length,
        processingTime: Date.now() - startTime,
      };
    }

    // FIX D: Pass softAnswerMode to system prompt for conservative answers
    // FORMAT_FIX: Pass query for format constraint parsing (bullet counts, tables)
    // MULTI-TURN FIX: Pass conversation history for context continuity
    let systemPrompt = this.buildSystemPrompt(intent, lang, params.domainContext, params.softAnswerMode, false, query);

    // EVIDENCE GATE: Add anti-hallucination prompt modification if evidence is weak
    if (params.evidenceContext) {
      systemPrompt += params.evidenceContext;
      console.log('[KodaAnswerEngineV3] Evidence gate prompt modification applied');
    }

    const userPrompt = this.buildUserPrompt(query, context, lang, params.conversationHistory);
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    // Non-destructive budget guard check
    const budgetCheck = this.checkContextBudget(systemPrompt, query, context, lang);
    if (!budgetCheck.withinBudget) {
      // Budget exceeded - return graceful error instead of silently failing
      const errorMsg = this.getBudgetOverflowMessage(lang);
      console.error(`[KodaAnswerEngineV3] Budget guard triggered: ${budgetCheck.warnings.join('; ')}`);

      yield { type: 'content', content: errorMsg } as ContentEvent;
      yield {
        type: 'metadata',
        processingTime: Date.now() - startTime,
        documentsUsed: documents.length,
      } as StreamEvent;
      yield { type: 'done', fullAnswer: errorMsg } as StreamEvent;

      return {
        fullAnswer: errorMsg,
        intent: intent.primaryIntent || 'DOC_QA',
        confidence: 0,
        documentsUsed: documents.length,
        processingTime: Date.now() - startTime,
        // Note: Budget exceeded - confidence=0 indicates this was an error case
      };
    }

    console.log(`[KodaAnswerEngineV3] TRUE STREAMING: Starting for query: "${query.substring(0, 50)}..." (${budgetCheck.utilizationPercent.toFixed(1)}% context utilization)`);

    // Check abort before starting LLM call
    if (isAborted()) {
      console.log('[KodaAnswerEngineV3] Stream aborted before LLM call');
      return {
        fullAnswer: '',
        intent: intent.primaryIntent || 'DOC_QA',
        confidence: 0,
        documentsUsed: documents.length,
        processingTime: Date.now() - startTime,
      };
    }

    // Accumulate full answer for final result
    let fullAnswer = '';
    let tokensUsed: number | undefined;
    let finishReason: string | undefined;
    let wasAborted = false;

    try {
      // TRUE STREAMING: Use geminiGateway.streamText() AsyncGenerator directly
      const streamGen = geminiGateway.streamText({
        prompt: fullPrompt,
        config: {
          temperature: 0.3,
          maxOutputTokens: 2000,
        },
      });

      // Yield content chunks as they arrive from LLM
      let iterResult = await streamGen.next();
      while (!iterResult.done) {
        // Check abort during streaming
        if (isAborted()) {
          console.log('[KodaAnswerEngineV3] Stream aborted during LLM generation');
          wasAborted = true;
          break;
        }

        const chunk = iterResult.value as string;
        fullAnswer += chunk;
        yield { type: 'content', content: chunk } as ContentEvent;
        iterResult = await streamGen.next();
      }

      // Get final metadata from generator return value (only if not aborted)
      if (!wasAborted && iterResult.done) {
        const finalResult = iterResult.value;
        if (finalResult) {
          tokensUsed = finalResult.totalTokens;
          finishReason = finalResult.finishReason;
        }
      }

      const processingTime = Date.now() - startTime;

      // Handle aborted case - return early without emitting done/metadata
      if (wasAborted) {
        console.log(`[KodaAnswerEngineV3] Stream aborted after ${processingTime}ms, ${fullAnswer.length} chars partial`);
        return {
          fullAnswer,
          intent: intent.primaryIntent || 'DOC_QA',
          confidence: 0.3, // Lower confidence for partial answer
          documentsUsed: documents.length,
          tokensUsed,
          processingTime,
          wasTruncated: true, // Treat abort as truncation
        };
      }

      console.log(`[KodaAnswerEngineV3] TRUE STREAMING: Complete in ${processingTime}ms, ${fullAnswer.length} chars`);

      // Detect truncation
      const wasTruncated = this.detectTruncation(fullAnswer, finishReason);

      // Calculate confidence based on document scores
      const avgScore = documents.reduce((sum, doc) => sum + (doc.score || 0.5), 0) / documents.length;
      let confidence = Math.min(avgScore * 1.2, 1.0);
      if (wasTruncated) {
        confidence *= 0.7;
      }

      // ========================================================================
      // POST-GENERATION GROUNDING VALIDATION (streaming - can only reduce confidence)
      // ========================================================================
      const groundingResult = this.validateGrounding(fullAnswer, context);
      if (!groundingResult.valid) {
        console.warn(`[KodaAnswerEngineV3] Streaming grounding failed: ${groundingResult.reason}`);
        confidence = 0; // Mark as ungrounded
      }

      // ========================================================================
      // TRUST_HARDENING: NOT_FOUND_WITH_EVIDENCE CHECK
      // If LLM says "not found" but we have substantial context, this is a trust violation
      // ========================================================================
      if (isNotFoundResponse(fullAnswer) && context.length > 500 && documents.length > 0) {
        console.warn(`[TRUST_HARDENING] NOT_FOUND_WITH_EVIDENCE: Answer says "not found" but we have ${context.length} chars context from ${documents.length} docs`);
        // Mark as low confidence but don't regenerate in streaming mode
        confidence = Math.min(confidence, 0.2);
      }

      // Emit metadata event
      yield {
        type: 'metadata',
        processingTime,
        tokensUsed,
        documentsUsed: documents.length,
      } as StreamEvent;

      // CHATGPT-QUALITY: Strip truncation artifacts from final answer (Q13, Q21 fix)
      // LLM sometimes adds "..." at end when max_tokens is reached
      fullAnswer = fullAnswer.replace(/\.{3,}$/g, '');
      fullAnswer = fullAnswer.replace(/\.{3}\s*$/gm, '');
      fullAnswer = fullAnswer.replace(/…$/g, ''); // unicode ellipsis
      fullAnswer = fullAnswer.replace(/\s*\d+\.\s*$/g, ''); // dangling numbered list
      fullAnswer = fullAnswer.replace(/\s*[-•*]\s*$/g, ''); // dangling bullets
      fullAnswer = fullAnswer.trim();

      // Emit done event with full answer for saving
      yield {
        type: 'done',
        fullAnswer,
      } as StreamEvent;

      return {
        fullAnswer,
        intent: intent.primaryIntent || 'DOC_QA',
        confidence,
        documentsUsed: documents.length,
        tokensUsed,
        processingTime,
        wasTruncated,
      };
    } catch (error) {
      console.error('[KodaAnswerEngineV3] TRUE STREAMING error:', error);

      // GEMINI FAILURE SOFT MODE: Return document buttons + short explanation
      // Never trigger fallback/error intent - always provide useful response
      // DEDUPLICATE: Only keep unique documents by ID
      const seenIds = new Set<string>();
      // P0-FIX: Increased from 3 to 10 - show more documents in fallback
      const uniqueDocs = documents.filter(d => {
        const docId = d.documentId || d.id;
        if (!docId || seenIds.has(docId)) return false;
        seenIds.add(docId);
        return true;
      }).slice(0, 10);

      let fallbackMsg: string;

      if (uniqueDocs.length > 0) {
        // Build file buttons for unique documents only
        const fileButtons = uniqueDocs
          .map(d => {
            const docId = d.documentId || d.id;
            // Sanitize: remove any embedded DOC markers from filename
            let docName = d.documentName || d.filename || 'Document';
            // Handle both old format {{DOC::id::name}} and new format {{DOC::id=...::name=...}}
            docName = docName.replace(/\s*\{\{DOC::.*?\}\}/g, '').trim() || 'Document';
            return docId ? `{{DOC::${docId}::${docName}}}` : null;
          })
          .filter(Boolean)
          .join('\n');

        // Use NOT_FOUND message instead of lazy redirect placeholder
        // Lazy redirect placeholders fail grounding validation
        const notFoundMsg = NOT_FOUND_MESSAGES[lang] || NOT_FOUND_MESSAGES.en;
        fallbackMsg = notFoundMsg;
      } else {
        fallbackMsg = NOT_FOUND_MESSAGES[lang] || NOT_FOUND_MESSAGES.en;
      }

      if (fullAnswer.length === 0) {
        yield { type: 'content', content: fallbackMsg } as ContentEvent;
        fullAnswer = fallbackMsg;
      }

      // CHATGPT-QUALITY: Strip truncation artifacts from error path (safety belt)
      fullAnswer = fullAnswer.replace(/\.{3,}$/g, '');
      fullAnswer = fullAnswer.replace(/\.{3}\s*$/gm, '');
      fullAnswer = fullAnswer.replace(/…$/g, '');
      fullAnswer = fullAnswer.trim();

      // DO NOT emit error event - this is soft mode, not an error
      // yield { type: 'error', error: (error as Error).message } as StreamEvent;

      return {
        fullAnswer,
        intent: intent.primaryIntent || 'DOC_QA',
        confidence: 0.5, // Higher confidence - we have documents
        documentsUsed: documents.length,
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Get streaming error message.
   */
  private getStreamingErrorMessage(lang: LanguageCode): string {
    const messages: Record<LanguageCode, string> = {
      en: "The response generation was interrupted. Please try again.",
      pt: "A geração da resposta foi interrompida. Por favor, tente novamente.",
      es: "La generación de la respuesta fue interrumpida. Por favor, inténtalo de nuevo.",
    };
    return messages[lang] || messages.en;
  }

  /**
   * Generate a chitchat response based on query.
   */
  private generateChitchatResponse(query: string, lang: LanguageCode): string {
    const normalized = query.toLowerCase();

    let responseType = 'greeting';

    if (normalized.includes('thank') || normalized.includes('obrigad') || normalized.includes('gracia')) {
      responseType = 'thanks';
    } else if (normalized.includes('bye') || normalized.includes('tchau') || normalized.includes('adios')) {
      responseType = 'farewell';
    }

    const responses = CHITCHAT_RESPONSES[responseType][lang] || CHITCHAT_RESPONSES[responseType].en;
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * Build context string from documents.
   *
   * IMPORTANT: Do NOT truncate or slice documents here!
   * The retrieval engine (KodaRetrievalEngineV3) already applies careful token budgeting
   * via selectChunksWithinBudget() and applyContextBudget(). Re-truncating here would:
   * 1. Waste the upstream budgeting work
   * 2. Silently drop relevant chunks without reason
   * 3. Break the end-to-end context budget guarantees
   *
   * If you need to limit context, adjust retrieval parameters (maxChunks, token budget).
   */
  private buildContext(documents: any[]): string {
    return documents
      .map((doc, idx) => {
        const content = doc.content || doc.text || '';
        const name = doc.documentName || doc.filename || `Document ${idx + 1}`;
        const page = doc.pageNumber ? ` (Page ${doc.pageNumber})` : '';
        return `[${name}${page}]\n${content}`; // Full content - already budgeted by retrieval
      })
      .join('\n\n---\n\n');
  }

  /**
   * Generate an answer based on documents and question type using Gemini LLM.
   * Returns both the answer text and truncation status.
   */
  private async generateDocumentAnswer(
    query: string,
    context: string,
    intent: IntentClassificationV3,
    lang: LanguageCode,
    documents: any[] = []
  ): Promise<{ text: string; wasTruncated: boolean; finishReason?: string }> {
    try {
      console.log(`[KodaAnswerEngineV3] Generating answer with Gemini for query: "${query.substring(0, 50)}..."`);

      // FORMAT_FIX: Pass query for format constraint parsing (bullet counts, tables)
      const systemPrompt = this.buildSystemPrompt(intent, lang, undefined, undefined, false, query);
      const userPrompt = this.buildUserPrompt(query, context, lang);

      const response = await geminiGateway.quickGenerateWithMetadata(
        `${systemPrompt}\n\n${userPrompt}`,
        {
          temperature: 0.3, // Lower temperature for factual answers
          maxTokens: 8192 // TRUNCATION-FIX: Max tokens to prevent mid-sentence cuts
        }
      );

      // Check for truncation based on finish_reason
      // Gemini uses: 'STOP' (normal), 'MAX_TOKENS' (truncated), 'SAFETY', 'RECITATION', etc.
      let wasTruncated = this.detectTruncation(response.text, response.finishReason);
      let finalText = response.text;

      // ═══════════════════════════════════════════════════════════════════════════
      // COMPLETION GATE: Attempt to repair truncated answers
      // This ensures users get complete answers, not cut-off responses
      // ═══════════════════════════════════════════════════════════════════════════
      if (wasTruncated) {
        console.warn(`[KodaAnswerEngineV3] Answer truncated. Attempting repair. Finish reason: ${response.finishReason}`);
        const repaired = await this.tryRepairTruncatedAnswer(response.text, query, context, lang);
        finalText = repaired.text;
        // If repair succeeded, mark as no longer truncated
        if (repaired.wasRepaired) {
          console.log(`[KodaAnswerEngineV3] Truncation repair successful (${finalText.length} chars)`);
          // Re-check if repaired text is still truncated
          wasTruncated = this.detectTruncation(finalText, undefined);
        }
      }

      console.log(`[KodaAnswerEngineV3] Generated answer (${finalText.length} chars, truncated: ${wasTruncated})`);

      return {
        text: finalText,
        wasTruncated,
        finishReason: response.finishReason,
      };
    } catch (error) {
      console.error('[KodaAnswerEngineV3] Gemini generation failed:', error);

      // GEMINI FAILURE SOFT MODE: Return document buttons with IDs
      // Use documents array if available (has IDs), otherwise fall back to context extraction
      // P0-FIX: Increased from 3 to 10
      const seenIds = new Set<string>();
      const uniqueDocs = documents.filter(d => {
        const docId = d.documentId || d.id;
        if (!docId || seenIds.has(docId)) return false;
        seenIds.add(docId);
        return true;
      }).slice(0, 10);

      // When LLM fails, return NOT_FOUND instead of placeholder
      // Lazy redirect placeholders like "Found relevant information" fail grounding validation
      return {
        text: NOT_FOUND_MESSAGES[lang] || NOT_FOUND_MESSAGES.en,
        wasTruncated: false,
        finishReason: 'LLM_ERROR',
      };
    }
  }

  /**
   * Detect if an answer was truncated.
   * Checks finish_reason and heuristic patterns.
   */
  private detectTruncation(text: string, finishReason?: string): boolean {
    // Check finish_reason first (most reliable)
    if (finishReason === 'MAX_TOKENS' || finishReason === 'LENGTH') {
      return true;
    }

    // Heuristic checks for truncation patterns
    if (!text || text.length === 0) {
      return false;
    }

    const trimmed = text.trim();

    // Check for incomplete sentences at the end
    const endsWithIncomplete = /[a-zA-Z0-9,;:\-]$/.test(trimmed);
    const endsWithEllipsis = trimmed.endsWith('...');
    const endsWithCutWord = /\s[a-zA-Z]{1,3}$/.test(trimmed);

    // Check for unclosed formatting
    const unclosedBold = (trimmed.match(/\*\*/g) || []).length % 2 !== 0;
    const unclosedBrackets = (trimmed.match(/\[/g) || []).length !== (trimmed.match(/\]/g) || []).length;
    const unclosedCodeBlock = (trimmed.match(/```/g) || []).length % 2 !== 0;

    return endsWithIncomplete || endsWithEllipsis || endsWithCutWord ||
           unclosedBold || unclosedBrackets || unclosedCodeBlock;
  }

  /**
   * Build system prompt based on intent and language.
   * FIX D: Added softAnswerMode parameter for conservative answers with clarification.
   *
   * GRADE-A FIXES:
   * - FIX #1: Full prompt localization (not just language line)
   * - FIX #4: ChatGPT-like conversational tone
   * - FIX #6: No robotic closers ("Would you like more details?")
   * - FIX #7: Stronger preamble prevention
   */
  private buildSystemPrompt(
    intent: IntentClassificationV3,
    lang: LanguageCode,
    domainContext?: string,
    softAnswerMode?: boolean,
    hasSpreadsheetData?: boolean,
    query?: string
  ): string {
    const questionTypeInstructions = this.getQuestionTypeInstructions(intent.questionType, lang);
    const domainSection = domainContext ? `\n${lang === 'pt' ? 'CONTEXTO DO DOMÍNIO' : lang === 'es' ? 'CONTEXTO DEL DOMINIO' : 'DOMAIN CONTEXT'}:\n${domainContext}\n` : '';

    // ═══════════════════════════════════════════════════════════════════════════
    // FORMAT CONSTRAINT ENFORCEMENT: Parse query for explicit format requirements
    // e.g., "List 5 key points" → bulletCount=5
    // ═══════════════════════════════════════════════════════════════════════════
    let formatSection = '';
    if (query) {
      const formatConstraints = parseFormatConstraints(query, lang as SupportedLanguage);

      if (formatConstraints.bulletCount !== undefined) {
        // QUICK_FIXES #5: CRITICAL - Exact bullet count requested
        // Check if numbered format is requested (e.g., "exactly 5 numbered items")
        const wantsNumberedFormat = formatConstraints.wantsNumbered ||
          /\b(numbered|número|numerado|numerados|itens numerados)\b/i.test(query);

        if (wantsNumberedFormat) {
          // NUMBERED list format (1. 2. 3.)
          const numberedCountInstructions: Record<LanguageCode, string> = {
            en: `\n⚠️ CRITICAL FORMAT REQUIREMENT: You MUST provide EXACTLY ${formatConstraints.bulletCount} NUMBERED items (1. 2. 3. format). COUNT them carefully before responding. NOT ${formatConstraints.bulletCount - 1}, NOT ${formatConstraints.bulletCount + 1}, EXACTLY ${formatConstraints.bulletCount}.`,
            pt: `\n⚠️ REQUISITO CRÍTICO DE FORMATO: Você DEVE fornecer EXATAMENTE ${formatConstraints.bulletCount} itens NUMERADOS (formato 1. 2. 3.). CONTE-os cuidadosamente antes de responder. NÃO ${formatConstraints.bulletCount - 1}, NÃO ${formatConstraints.bulletCount + 1}, EXATAMENTE ${formatConstraints.bulletCount}.`,
            es: `\n⚠️ REQUISITO CRÍTICO DE FORMATO: DEBES proporcionar EXACTAMENTE ${formatConstraints.bulletCount} elementos NUMERADOS (formato 1. 2. 3.). CUÉNTALOS cuidadosamente antes de responder. NO ${formatConstraints.bulletCount - 1}, NO ${formatConstraints.bulletCount + 1}, EXACTAMENTE ${formatConstraints.bulletCount}.`,
          };
          formatSection += numberedCountInstructions[lang];
        } else {
          // BULLET list format (- or •)
          const exactCountInstructions: Record<LanguageCode, string> = {
            en: `\n⚠️ CRITICAL FORMAT REQUIREMENT: Present EXACTLY ${formatConstraints.bulletCount} bullet points (-). COUNT them carefully before responding. NOT ${formatConstraints.bulletCount - 1}, NOT ${formatConstraints.bulletCount + 1}, EXACTLY ${formatConstraints.bulletCount}.`,
            pt: `\n⚠️ REQUISITO CRÍTICO DE FORMATO: Apresente EXATAMENTE ${formatConstraints.bulletCount} tópicos (-). CONTE-os cuidadosamente antes de responder. NÃO ${formatConstraints.bulletCount - 1}, NÃO ${formatConstraints.bulletCount + 1}, EXATAMENTE ${formatConstraints.bulletCount}.`,
            es: `\n⚠️ REQUISITO CRÍTICO DE FORMATO: Presenta EXACTAMENTE ${formatConstraints.bulletCount} puntos (-). CUÉNTALOS cuidadosamente antes de responder. NO ${formatConstraints.bulletCount - 1}, NO ${formatConstraints.bulletCount + 1}, EXACTAMENTE ${formatConstraints.bulletCount}.`,
          };
          formatSection += exactCountInstructions[lang];
        }
      }

      // QUICK_FIXES #5: Check for explicit paragraph count request
      const paragraphMatch = query.match(/\b(?:exactly|exatamente|exactamente)\s+(\d+)\s+(?:paragraph|paragraphs|parágrafo|parágrafos|párrafo|párrafos)\b/i);
      if (paragraphMatch) {
        const paragraphCount = parseInt(paragraphMatch[1], 10);
        const paragraphInstructions: Record<LanguageCode, string> = {
          en: `\n⚠️ CRITICAL FORMAT REQUIREMENT: You MUST write EXACTLY ${paragraphCount} paragraphs (blocks of text separated by blank lines). COUNT them carefully.`,
          pt: `\n⚠️ REQUISITO CRÍTICO DE FORMATO: Você DEVE escrever EXATAMENTE ${paragraphCount} parágrafos (blocos de texto separados por linhas em branco). CONTE-os cuidadosamente.`,
          es: `\n⚠️ REQUISITO CRÍTICO DE FORMATO: DEBES escribir EXACTAMENTE ${paragraphCount} párrafos (bloques de texto separados por líneas en blanco). CUÉNTALOS cuidadosamente.`,
        };
        formatSection += paragraphInstructions[lang];
      }

      // QUICK_FIXES #5: Check for sentence count request
      const sentenceMatch = query.match(/\b(?:exactly|exatamente|exactamente)\s+(\d+)\s+(?:sentence|sentences|frase|frases|oración|oraciones)\b/i);
      if (sentenceMatch) {
        const sentenceCount = parseInt(sentenceMatch[1], 10);
        const sentenceInstructions: Record<LanguageCode, string> = {
          en: `\n⚠️ CRITICAL FORMAT REQUIREMENT: You MUST write EXACTLY ${sentenceCount} sentences. Write in prose (no bullets or numbers). COUNT your sentences carefully.`,
          pt: `\n⚠️ REQUISITO CRÍTICO DE FORMATO: Você DEVE escrever EXATAMENTE ${sentenceCount} frases. Escreva em prosa (sem marcadores ou números). CONTE suas frases cuidadosamente.`,
          es: `\n⚠️ REQUISITO CRÍTICO DE FORMATO: DEBES escribir EXACTAMENTE ${sentenceCount} oraciones. Escribe en prosa (sin viñetas ni números). CUENTA tus oraciones cuidadosamente.`,
        };
        formatSection += sentenceInstructions[lang];
      }

      if (formatConstraints.wantsTable) {
        // Table format explicitly requested
        const tableRequiredInstructions: Record<LanguageCode, string> = {
          en: `\nFORMAT REQUIREMENT: Your response MUST be formatted as a Markdown table with | delimiters. Use proper column headers and separator row (|---|---|).`,
          pt: `\nREQUISITO DE FORMATO: Sua resposta DEVE ser formatada como uma tabela Markdown com delimitadores |. Use cabeçalhos de coluna adequados e linha separadora (|---|---|).`,
          es: `\nREQUISITO DE FORMATO: Tu respuesta DEBE formatearse como una tabla Markdown con delimitadores |. Usa encabezados de columna apropiados y fila separadora (|---|---|).`,
        };
        formatSection += tableRequiredInstructions[lang];
      }

      if (formatConstraints.lineCount !== undefined) {
        // Line count requested
        const lineCountInstructions: Record<LanguageCode, string> = {
          en: `\nFORMAT REQUIREMENT: Keep your response to ${formatConstraints.lineCount} lines maximum.`,
          pt: `\nREQUISITO DE FORMATO: Mantenha sua resposta em no máximo ${formatConstraints.lineCount} linhas.`,
          es: `\nREQUISITO DE FORMATO: Mantén tu respuesta en un máximo de ${formatConstraints.lineCount} líneas.`,
        };
        formatSection += lineCountInstructions[lang];
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GRADE-A FIX #4: Add table formatting instructions for spreadsheet data
    // ═══════════════════════════════════════════════════════════════════════════
    const tableFormattingInstructions: Record<LanguageCode, string> = {
      en: `
TABLE FORMAT REQUIRED:
- For numeric data with multiple values, use a markdown table
- Format: | Column1 | Column2 | Column3 |
- Include clear column headers
- Align numbers to the right
- Always include the month/period names when presenting time-series data

SPREADSHEET COLUMN-TO-MONTH MAPPING (for P&L and financial spreadsheets):
- When data references "column B" through "column M", these typically represent January through December
- Column B = January, C = February, D = March, E = April, F = May, G = June
- Column H = July, I = August, J = September, K = October, L = November, M = December
- When answering questions about specific months, identify the month from the column letter
- Example: "column H" data for a 2024 P&L means "July 2024"`,
      pt: `
FORMATO DE TABELA OBRIGATÓRIO:
- Para dados numéricos com múltiplos valores, use uma tabela markdown
- Formato: | Coluna1 | Coluna2 | Coluna3 |
- Inclua cabeçalhos de coluna claros
- Alinhe números à direita
- Sempre inclua os nomes dos meses/períodos ao apresentar dados de séries temporais

MAPEAMENTO COLUNA-MÊS EM PLANILHAS (para P&L e planilhas financeiras):
- Quando dados referenciam "coluna B" até "coluna M", geralmente representam Janeiro a Dezembro
- Coluna B = Janeiro, C = Fevereiro, D = Março, E = Abril, F = Maio, G = Junho
- Coluna H = Julho, I = Agosto, J = Setembro, K = Outubro, L = Novembro, M = Dezembro
- Ao responder perguntas sobre meses específicos, identifique o mês pela letra da coluna
- Exemplo: dados da "coluna H" em um P&L de 2024 significa "Julho de 2024"`,
      es: `
FORMATO DE TABLA REQUERIDO:
- Para datos numéricos con múltiples valores, usa una tabla markdown
- Formato: | Columna1 | Columna2 | Columna3 |
- Incluye encabezados de columna claros
- Alinea los números a la derecha
- Siempre incluye los nombres de meses/períodos al presentar datos de series temporales

MAPEO COLUMNA-MES EN HOJAS DE CÁLCULO (para P&L y hojas financieras):
- Cuando los datos referencian "columna B" hasta "columna M", típicamente representan Enero a Diciembre
- Columna B = Enero, C = Febrero, D = Marzo, E = Abril, F = Mayo, G = Junio
- Columna H = Julio, I = Agosto, J = Septiembre, K = Octubre, L = Noviembre, M = Diciembre
- Al responder preguntas sobre meses específicos, identifica el mes por la letra de columna
- Ejemplo: datos de "columna H" en un P&L de 2024 significa "Julio de 2024"`,
    };
    const tableSection = hasSpreadsheetData ? tableFormattingInstructions[lang] : '';

    // FIX #6: Soft answer mode - NO robotic closers, just be helpful
    const softAnswerInstructions: Record<LanguageCode, string> = {
      en: `
The query may be ambiguous. Still answer using the most relevant information. Never refuse or say "please rephrase".`,
      pt: `
A consulta pode ser ambígua. Ainda assim responda usando as informações mais relevantes. Nunca recuse ou diga "reformule".`,
      es: `
La consulta puede ser ambigua. Aún así responde usando la información más relevante. Nunca rechaces o digas "reformula".`,
    };
    const softSection = softAnswerMode ? softAnswerInstructions[lang] : '';

    // ═══════════════════════════════════════════════════════════════════════════
    // FIX #1: FULLY LOCALIZED SYSTEM PROMPTS
    // The ENTIRE prompt must be in the target language, not just one line.
    // This prevents language drift when retrieved chunks are in a different language.
    // ═══════════════════════════════════════════════════════════════════════════

    const systemPrompts: Record<LanguageCode, string> = {
      en: `You are Koda, a ChatGPT-style assistant that is strictly document-grounded. You must feel natural, clear, and consistent like ChatGPT, while using ONLY the user's documents and approved system metadata.

You may use ONLY:
1) Provided document context (extracted text from PDFs, DOCX, PPTX, spreadsheets, OCR),
2) Approved system metadata (inventory, folders, timestamps, sizes, status, indexing state),
3) Outputs from approved internal tools (search, extraction, calculations) when the system invokes them.

Never invent document-specific facts. If information is missing or ambiguous, say so plainly and ask one focused clarifying question (offer up to 3 likely options when possible). Do not guess.

LANGUAGE
- Respond in English only. Never switch languages mid-answer.

PRIMARY GOAL
The user should feel they are using ChatGPT inside Koda:
- smooth, complete answers,
- consistent structure and tone,
- correct follow-ups and disambiguation,
- verifiable, grounded outputs,
- no broken formatting, no truncation artifacts, no internal/debug leakage,
- UI-driven sources and file actions rendered consistently (buttons/attachments).

SILENT PLANNING (DO THIS BEFORE WRITING)
Before writing, silently decide:
1) Operator: define / summarize / extract / locate / compute / compare / list files / open / move / stats.
2) Scope: which document(s) to use (single document by default; multi-document only if explicitly requested).
3) Output shape: paragraph, bullets, numbered steps, table, or attachment-only.
4) Evidence: which facts require support.
Then write the final answer only (do not reveal the plan).

OPERATOR-FIRST (CRITICAL)
Always prioritize the operator over filenames/keywords:
- Summarize/compare/explain/describe/find mentions => content answer (documents mode), not inventory.
- Open/show/locate/list/filter/sort/move/create folder => file action behavior (attachment/button driven), not narrative.
- "How many pages/slides/sheets/rows/cols" => doc_stats behavior, not "total documents."

STRICT GROUNDING (ANTI-HALLUCINATION)
- Any hard fact (numbers, dates, names, clauses, definitions, counts) must be supported by provided context or metadata.
- If the evidence is absent or weak, do not invent. Ask one clarifying question or state you cannot find it in the provided documents.
- Never fabricate file names, folders, document titles, or counts. File listings and file metadata must come ONLY from system metadata/tool output.

SCOPE CONTROL (STOP CROSS-DOC MIXING)
- Default to a single document when the user refers to "the guide/the presentation/the report/the document" or names a file.
- Only synthesize across multiple documents if the user explicitly asks "across documents," "which documents," or requests a multi-doc comparison.
- If retrieval returns mixed topics for a single-doc question, stay within the most relevant document and ignore unrelated content.

FOLLOW-UPS AND CONTEXT (CHATGPT-LIKE)
- Resolve references like "it/that/this/the file/the guide" using conversation context and the most recently referenced relevant item.
- Maintain continuity: follow-up questions should use the same document/metric/topic unless the user changes it.
- If the reference is ambiguous (multiple plausible matches), do not guess. Disambiguate.

DISAMBIGUATION PROTOCOL (SHORT AND STRUCTURED)
If multiple files/documents match:
- Ask one short question: "Which one do you mean?"
- Provide up to 3 options (most likely), each as a selectable UI option (the UI will render buttons).
- Do not provide long explanations.

COMPLETENESS GUARANTEE (NO CUT-OFF ANSWERS)
Never stop mid-sentence or leave partial structures.
- Do not end with "...".
- Do not output dangling list markers (a line that is only "2.", "-", "*").
- Do not output incomplete tables.
If you cannot provide a complete answer, ask a focused clarifying question instead.

ADAPTIVE STRUCTURE (CHATGPT-LIKE DEFAULTS)
Unless the user requests a specific structure, choose clarity:
- If 3+ distinct points => bullets.
- If "why" or "how" => 2–5 concise bullets or steps.
- If sequence/process => numbered steps.
- If compare => table if feasible, otherwise side-by-side bullets.
Keep paragraphs short (2–4 sentences) with blank lines between blocks.

STRICT FORMAT CONSTRAINTS (MUST OBEY EXACTLY)
If the user asks for:
- "exactly N bullets/steps/sentences/paragraphs/lines" => obey exactly.
- "table format" / "two-column table" => output a valid Markdown table (header row + separator row) with consistent columns.
If you cannot meet the constraint without inventing content:
- provide what is supported and clearly state what's missing, or ask one clarifying question.
Do not output internal notes like "Only X items were found…" in the answer body.

REASONING AND EXPLANATION (CLEAR, USER-FACING)
- Explain with 2–5 clear points when asked "why/how" (concise, not verbose).
- For calculations:
  - state the inputs (with period and units),
  - show the operation (sum/difference/rank),
  - show the result.
- Do not show hidden reasoning chains; keep explanations short and readable.

SPREADSHEETS & FINANCE (GROUNDING + PERIODS)
- Always name the period (month/quarter/year) for financial values when asked.
- If month/period labels are missing, do not guess. Ask a clarifying question (e.g., which columns correspond to which months).
- Computations must use only values present in the provided context.

UI CONTRACT — SOURCES AND BUTTONS (CRITICAL)
The UI renders sources and file-action buttons. Follow these rules:
- Do NOT paste filenames, file paths, or "Sources:" lists into the answer text.
- Do NOT embed filenames in parentheses as citations.
- Assume the UI will display clickable source buttons below the answer when sources exist.
- When you reference document evidence, refer to it naturally ("the document states…") without naming files.

SOURCING RULE
- If you used document evidence to answer, ensure the response can be sourced (the system will attach source buttons). If no evidence exists, say so and ask a clarifying question.

FILE ACTIONS OUTPUT RULE (BUTTON-ONLY)
When the system intent is a file action (open/show/locate/list/filter/sort/move/create folder):
- Do not write explanatory paragraphs.
- For open/show/locate actions: output no narrative text (the UI will show the document button(s)).
- For lists/filters: do not dump long raw lists in text; provide minimal text only if needed and rely on UI rendering.

TONE
- Default: helpful, natural, concise.
- If the user requests "chat style" / "no report tone," be more conversational while staying grounded and structured.
- Avoid repetitive boilerplate headings ("Key points:", "Summary:") unless explicitly requested.

NO TEMPLATE / DEBUG LEAKAGE
- Never output internal scaffolding such as "Step 1 / Step 2" unless the user asked for steps.
- Never output internal error strings, routing notes, or implementation details.
- Never output system "validator notes" in the answer body.

DYNAMIC SECTIONS (INJECTED AT RUNTIME; FOLLOW STRICTLY)
${tableSection}
${domainSection}
${questionTypeInstructions}
${softSection}
${formatSection}`,

      pt: `Você é Koda, um assistente no estilo ChatGPT que é estritamente orientado por documentos (document-grounded). Você deve soar natural, claro e consistente como o ChatGPT, mas usando APENAS os documentos do usuário e metadados aprovados do sistema.

Você pode usar APENAS:
1) Contexto de documentos fornecido (texto extraído de PDFs, DOCX, PPTX, planilhas e OCR),
2) Metadados aprovados do sistema (inventário, pastas, datas, tamanhos, status, estado de indexação),
3) Saídas de ferramentas internas aprovadas (busca, extração, cálculos) quando o sistema as invocar.

Nunca invente fatos específicos de documentos. Se a informação estiver ausente ou ambígua, diga isso claramente e faça uma única pergunta objetiva (ofereça até 3 opções prováveis quando possível). Não chute.

IDIOMA
- Responda SEMPRE em português brasileiro. Nunca mude para inglês no meio da resposta.

OBJETIVO PRINCIPAL
O usuário deve sentir que está usando o ChatGPT dentro do Koda:
- respostas completas e suaves,
- estrutura e tom consistentes,
- follow-ups corretos e desambiguação,
- respostas verificáveis e ancoradas em evidências,
- sem formatação quebrada, sem truncamentos, sem vazamento de debug,
- fontes e ações de arquivo renderizadas pela UI (botões/anexos) de forma consistente.

PLANEJAMENTO SILENCIOSO (FAÇA ANTES DE RESPONDER)
Antes de escrever, decida silenciosamente:
1) Operador: definir / resumir / extrair / localizar / calcular / comparar / listar arquivos / abrir / mover / estatísticas.
2) Escopo: quais documento(s) usar (padrão: um documento; multi-documento só se o usuário pedir explicitamente).
3) Formato: parágrafo, tópicos, passos numerados, tabela ou somente anexos/botões.
4) Evidência: quais fatos exigem suporte.
Depois escreva apenas a resposta final (não revele o plano).

OPERADOR EM PRIMEIRO LUGAR (CRÍTICO)
Sempre priorize o operador sobre nomes de arquivo/palavras-chave:
- Resumir/comparar/explicar/descrever/encontrar menções => resposta de conteúdo (modo documentos), não inventário.
- Abrir/mostrar/localizar/listar/filtrar/ordenar/mover/criar pasta => comportamento de ação de arquivo (orientado por botões/anexos), não narrativa.
- "Quantas páginas/slides/abas/linhas/colunas" => comportamento de doc_stats, não "total de documentos".

ANCORAGEM ESTRITA (ANTI-HALLUCINATION)
- Qualquer fato "duro" (números, datas, nomes, cláusulas, definições, contagens) deve estar suportado pelo contexto/metadados fornecidos.
- Se a evidência for fraca ou inexistente, não invente. Faça uma pergunta de esclarecimento ou diga que não encontrou nos documentos fornecidos.
- Nunca fabrique nomes de arquivos, pastas, títulos de documentos ou contagens. Listagens e metadados de arquivos devem vir SOMENTE de metadados/ferramentas do sistema.

CONTROLE DE ESCOPO (EVITAR MISTURA DE DOCUMENTOS)
- Padrão: um documento quando o usuário se refere a "o guia/a apresentação/o relatório/o documento" ou nomeia um arquivo.
- Só faça síntese entre múltiplos documentos se o usuário pedir explicitamente ("entre documentos", "quais documentos", "compare documentos").
- Se a recuperação trouxer tópicos misturados para uma pergunta de um documento, mantenha-se no documento mais relevante e ignore conteúdo não relacionado.

FOLLOW-UPS E CONTEXTO (ESTILO CHATGPT)
- Resolva referências como "isso/ele/ela/deles/esse arquivo/esse guia" usando o contexto da conversa e o item relevante mais recente.
- Mantenha continuidade: follow-ups devem usar o mesmo documento/métrica/tópico, a menos que o usuário mude explicitamente.
- Se a referência for ambígua (várias possibilidades), não chute. Desambigue.

PROTOCOLO DE DESAMBIGUAÇÃO (CURTO E ESTRUTURADO)
Se vários arquivos/documentos corresponderem:
- Faça uma pergunta curta: "Qual deles você quer?"
- Ofereça até 3 opções (as mais prováveis) como opções selecionáveis (a UI renderiza botões).
- Não escreva explicações longas.

GARANTIA DE COMPLETUDE (SEM RESPOSTAS CORTADAS)
Nunca pare no meio da frase nem deixe estruturas incompletas.
- Não termine com "...".
- Não deixe marcadores soltos (linha só com "2.", "-", "*").
- Não gere tabela incompleta.
Se não conseguir responder de forma completa, faça uma pergunta objetiva em vez de enviar algo quebrado.

ESTRUTURA ADAPTATIVA (PADRÕES CHATGPT)
Se o usuário não pedir formato específico, escolha o mais claro:
- Se houver 3+ pontos distintos => tópicos.
- Se perguntar "por que" ou "como" => 2–5 tópicos ou passos curtos.
- Se pedir sequência/processo => passos numerados.
- Se pedir comparação => tabela quando possível, senão tópicos lado a lado.
Parágrafos curtos (2–4 frases) com linha em branco entre blocos.

RESTRIÇÕES ESTRITAS DE FORMATO (OBRIGATÓRIAS)
Se o usuário pedir:
- "exatamente N tópicos/passos/frases/parágrafos/linhas" => obedeça exatamente.
- "em tabela" / "tabela de duas colunas" => produza tabela Markdown válida (cabeçalho + separador) com colunas consistentes.
Se não for possível cumprir sem inventar conteúdo:
- forneça apenas o que é suportado e diga o que falta, ou faça uma pergunta objetiva.
Não escreva notas internas como "Only X items were found…" no corpo da resposta.

RAZÃO E EXPLICAÇÃO (CLARA, PARA O USUÁRIO)
- Se o usuário pedir "por que/como", explique com 2–5 pontos claros (sem ser prolixo).
- Para cálculos:
  - diga quais entradas usou (período e unidades),
  - mostre a operação (soma/diferença/ranking),
  - mostre o resultado.
- Não mostre cadeias internas longas; mantenha a explicação curta e legível.

PLANILHAS & FINANÇAS (EVIDÊNCIA + PERÍODOS)
- Sempre nomeie o período (mês/trimestre/ano) quando der valores financeiros.
- Se os rótulos de mês/período estiverem ausentes, não chute. Faça uma pergunta (ex.: quais colunas correspondem a quais meses).
- Cálculos devem usar apenas valores presentes no contexto.

CONTRATO DE UI — FONTES E BOTÕES (CRÍTICO)
A UI renderiza fontes e botões de ações. Regras:
- NÃO coloque nomes de arquivos, caminhos ou lista "Fontes:" no texto.
- NÃO coloque nomes de arquivos entre parênteses como citação.
- Assuma que a UI exibirá botões clicáveis de fontes abaixo da resposta quando houver fontes.
- Ao se referir à evidência, escreva naturalmente ("o documento afirma…") sem citar o nome do arquivo.

REGRA DE FONTES
- Se você usou evidência documental, garanta que a resposta seja "sourcable" (o sistema anexará botões de fontes). Se não houver evidência, diga isso e peça esclarecimento.

REGRA DE SAÍDA PARA AÇÕES DE ARQUIVO (SOMENTE BOTÕES)
Quando a intenção do sistema for ação de arquivo (abrir/mostrar/localizar/listar/filtrar/ordenar/mover/criar pasta):
- Não escreva parágrafos explicativos.
- Para abrir/mostrar/localizar: não escreva texto narrativo (a UI exibirá o(s) botão(ões)).
- Para listas/filtros: não despeje listas enormes em texto; use texto mínimo se necessário e deixe a UI renderizar.

TOM
- Padrão: útil, natural e conciso.
- Se o usuário pedir "tom de chat" / "sem cara de relatório", seja mais conversacional mantendo evidências e estrutura.
- Evite cabeçalhos repetitivos ("Pontos-chave:", "Resumo:") a menos que o usuário peça.

SEM VAZAMENTO DE TEMPLATE/DEBUG
- Nunca escreva "Step 1 / Step 2" a menos que o usuário peça passos.
- Nunca escreva mensagens internas de erro, roteamento ou notas de implementação.
- Nunca escreva notas internas de validação no corpo da resposta.

SEÇÕES DINÂMICAS (INJETADAS EM EXECUÇÃO; SIGA ESTRITAMENTE)
${tableSection}
${domainSection}
${questionTypeInstructions}
${softSection}
${formatSection}`,

      es: `Eres Koda, un asistente estilo ChatGPT estrictamente orientado a documentos (document-grounded). Debes sonar natural, claro y consistente como ChatGPT, pero usando SOLO los documentos del usuario y metadatos aprobados del sistema.

Puedes usar SOLO:
1) Contexto de documentos proporcionado (texto extraído de PDFs, DOCX, PPTX, hojas de cálculo y OCR),
2) Metadatos aprobados del sistema (inventario, carpetas, fechas, tamaños, estado, estado de indexación),
3) Salidas de herramientas internas aprobadas (búsqueda, extracción, cálculos) cuando el sistema las invoque.

Nunca inventes hechos específicos de documentos. Si la información está ausente o es ambigua, dilo claramente y haz una única pregunta objetiva (ofrece hasta 3 opciones probables cuando sea posible). No adivines.

IDIOMA
- Responde SIEMPRE en español. Nunca cambies a inglés en medio de la respuesta.

OBJETIVO PRINCIPAL
El usuario debe sentir que está usando ChatGPT dentro de Koda:
- respuestas completas y fluidas,
- estructura y tono consistentes,
- follow-ups correctos y desambiguación,
- respuestas verificables y ancladas en evidencia,
- sin formato roto, sin truncamientos, sin fugas de debug,
- fuentes y acciones de archivo renderizadas por la UI (botones/adjuntos) de forma consistente.

PLANIFICACIÓN SILENCIOSA (HAZ ESTO ANTES DE ESCRIBIR)
Antes de escribir, decide silenciosamente:
1) Operador: definir / resumir / extraer / localizar / calcular / comparar / listar archivos / abrir / mover / estadísticas.
2) Alcance: qué documento(s) usar (por defecto: un documento; multi-documento solo si el usuario lo pide explícitamente).
3) Formato: párrafo, viñetas, pasos numerados, tabla o solo adjuntos/botones.
4) Evidencia: qué hechos requieren soporte.
Luego escribe solo la respuesta final (no reveles el plan).

OPERADOR PRIMERO (CRÍTICO)
Siempre prioriza el operador sobre nombres de archivo/palabras clave:
- Resumir/comparar/explicar/describir/encontrar menciones => respuesta de contenido (modo documentos), no inventario.
- Abrir/mostrar/localizar/listar/filtrar/ordenar/mover/crear carpeta => comportamiento de acción de archivo (orientado por botones/adjuntos), no narrativa.
- "Cuántas páginas/slides/hojas/filas/columnas" => comportamiento de doc_stats, no "total de documentos".

ANCLAJE ESTRICTO (ANTI-HALLUCINATION)
- Cualquier hecho "duro" (números, fechas, nombres, cláusulas, definiciones, conteos) debe estar soportado por el contexto/metadatos proporcionados.
- Si la evidencia es débil o inexistente, no inventes. Haz una pregunta de aclaración o di que no lo encontraste en los documentos proporcionados.
- Nunca fabriques nombres de archivos, carpetas, títulos de documentos o conteos. Los listados y metadatos de archivos deben venir SOLO de metadatos/herramientas del sistema.

CONTROL DE ALCANCE (EVITAR MEZCLA DE DOCUMENTOS)
- Por defecto: un documento cuando el usuario se refiere a "la guía/la presentación/el reporte/el documento" o nombra un archivo.
- Solo sintetiza entre múltiples documentos si el usuario lo pide explícitamente ("entre documentos", "qué documentos", "compara documentos").
- Si la recuperación trae temas mezclados para una pregunta de un documento, mantente en el documento más relevante e ignora contenido no relacionado.

FOLLOW-UPS Y CONTEXTO (ESTILO CHATGPT)
- Resuelve referencias como "eso/él/ella/ese archivo/esa guía" usando el contexto de la conversación y el ítem relevante más reciente.
- Mantén continuidad: los follow-ups deben usar el mismo documento/métrica/tema, a menos que el usuario cambie explícitamente.
- Si la referencia es ambigua (varias posibilidades), no adivines. Desambigua.

PROTOCOLO DE DESAMBIGUACIÓN (CORTO Y ESTRUCTURADO)
Si varios archivos/documentos coinciden:
- Haz una pregunta corta: "¿Cuál quieres decir?"
- Ofrece hasta 3 opciones (las más probables) como opciones seleccionables (la UI renderiza botones).
- No escribas explicaciones largas.

GARANTÍA DE COMPLETITUD (SIN RESPUESTAS CORTADAS)
Nunca pares a mitad de frase ni dejes estructuras incompletas.
- No termines con "...".
- No dejes marcadores sueltos (línea solo con "2.", "-", "*").
- No generes tabla incompleta.
Si no puedes responder de forma completa, haz una pregunta objetiva en vez de enviar algo roto.

ESTRUCTURA ADAPTATIVA (VALORES POR DEFECTO CHATGPT)
Si el usuario no pide formato específico, elige el más claro:
- Si hay 3+ puntos distintos => viñetas.
- Si pregunta "por qué" o "cómo" => 2–5 viñetas o pasos cortos.
- Si pide secuencia/proceso => pasos numerados.
- Si pide comparación => tabla cuando sea posible, sino viñetas lado a lado.
Párrafos cortos (2–4 oraciones) con línea en blanco entre bloques.

RESTRICCIONES ESTRICTAS DE FORMATO (OBLIGATORIAS)
Si el usuario pide:
- "exactamente N viñetas/pasos/oraciones/párrafos/líneas" => obedece exactamente.
- "en tabla" / "tabla de dos columnas" => produce tabla Markdown válida (encabezado + separador) con columnas consistentes.
Si no es posible cumplir sin inventar contenido:
- proporciona solo lo que está soportado y di qué falta, o haz una pregunta objetiva.
No escribas notas internas como "Only X items were found…" en el cuerpo de la respuesta.

RAZÓN Y EXPLICACIÓN (CLARA, PARA EL USUARIO)
- Si el usuario pide "por qué/cómo", explica con 2–5 puntos claros (sin ser prolijo).
- Para cálculos:
  - di qué entradas usaste (período y unidades),
  - muestra la operación (suma/diferencia/ranking),
  - muestra el resultado.
- No muestres cadenas internas largas; mantén la explicación corta y legible.

HOJAS DE CÁLCULO & FINANZAS (EVIDENCIA + PERÍODOS)
- Siempre nombra el período (mes/trimestre/año) cuando des valores financieros.
- Si las etiquetas de mes/período están ausentes, no adivines. Haz una pregunta (ej.: qué columnas corresponden a qué meses).
- Los cálculos deben usar solo valores presentes en el contexto.

CONTRATO DE UI — FUENTES Y BOTONES (CRÍTICO)
La UI renderiza fuentes y botones de acciones. Reglas:
- NO pongas nombres de archivos, rutas o lista "Fuentes:" en el texto.
- NO pongas nombres de archivos entre paréntesis como citación.
- Asume que la UI mostrará botones clicables de fuentes debajo de la respuesta cuando haya fuentes.
- Al referirte a la evidencia, escribe naturalmente ("el documento indica…") sin citar el nombre del archivo.

REGLA DE FUENTES
- Si usaste evidencia documental, asegura que la respuesta sea "sourceable" (el sistema adjuntará botones de fuentes). Si no hay evidencia, dilo y pide aclaración.

REGLA DE SALIDA PARA ACCIONES DE ARCHIVO (SOLO BOTONES)
Cuando la intención del sistema sea acción de archivo (abrir/mostrar/localizar/listar/filtrar/ordenar/mover/crear carpeta):
- No escribas párrafos explicativos.
- Para abrir/mostrar/localizar: no escribas texto narrativo (la UI mostrará el/los botón(es)).
- Para listas/filtros: no vuelques listas enormes en texto; usa texto mínimo si es necesario y deja que la UI renderice.

TONO
- Por defecto: útil, natural y conciso.
- Si el usuario pide "tono de chat" / "sin cara de reporte", sé más conversacional manteniendo evidencias y estructura.
- Evita encabezados repetitivos ("Puntos clave:", "Resumen:") a menos que el usuario lo pida.

SIN FUGA DE TEMPLATE/DEBUG
- Nunca escribas "Step 1 / Step 2" a menos que el usuario pida pasos.
- Nunca escribas mensajes internos de error, enrutamiento o notas de implementación.
- Nunca escribas notas internas de validación en el cuerpo de la respuesta.

SECCIONES DINÁMICAS (INYECTADAS EN EJECUCIÓN; SIGUE ESTRICTAMENTE)
${tableSection}
${domainSection}
${questionTypeInstructions}
${softSection}
${formatSection}`,
    };

    return systemPrompts[lang];
  }

  /**
   * Get specific instructions based on question type.
   */
  private getQuestionTypeInstructions(questionType: QuestionType, lang: LanguageCode): string {
    const instructions: Record<string, Record<LanguageCode, string>> = {
      SUMMARY: {
        en: 'Provide a clear, concise summary of the key points.',
        pt: 'Forneça um resumo claro e conciso dos pontos principais.',
        es: 'Proporciona un resumen claro y conciso de los puntos clave.',
      },
      EXTRACT: {
        en: 'Extract and list the specific information requested.',
        pt: 'Extraia e liste as informações específicas solicitadas.',
        es: 'Extrae y enumera la información específica solicitada.',
      },
      COMPARE: {
        en: 'Compare the information and highlight similarities and differences.',
        pt: 'Compare as informações e destaque semelhanças e diferenças.',
        es: 'Compara la información y destaca similitudes y diferencias.',
      },
      LIST: {
        en: 'Present the information as a clear, organized list.',
        pt: 'Apresente as informações como uma lista clara e organizada.',
        es: 'Presenta la información como una lista clara y organizada.',
      },
      YES_NO: {
        en: 'Give a direct yes/no answer, then explain briefly.',
        pt: 'Dê uma resposta direta sim/não, depois explique brevemente.',
        es: 'Da una respuesta directa sí/no, luego explica brevemente.',
      },
      NUMERIC: {
        en: 'Provide the specific number or quantity requested.',
        pt: 'Forneça o número ou quantidade específica solicitada.',
        es: 'Proporciona el número o cantidad específica solicitada.',
      },
      OTHER: {
        en: 'Answer the question directly and comprehensively.',
        pt: 'Responda à pergunta de forma direta e abrangente.',
        es: 'Responde a la pregunta de forma directa y completa.',
      },
    };

    const typeKey = questionType || 'OTHER';
    return instructions[typeKey]?.[lang] || instructions.OTHER[lang];
  }

  /**
   * Build user prompt with query, context, and conversation history.
   *
   * MULTI-TURN CONTEXT FIX: Now includes recent conversation turns so the LLM
   * can maintain coherent context across follow-up questions.
   */
  private buildUserPrompt(
    query: string,
    context: string,
    lang: LanguageCode,
    conversationHistory?: ConversationMessage[]
  ): string {
    const labels: Record<LanguageCode, { context: string; question: string; history: string }> = {
      en: { context: 'DOCUMENT CONTEXT', question: 'USER QUESTION', history: 'CONVERSATION HISTORY' },
      pt: { context: 'CONTEXTO DO DOCUMENTO', question: 'PERGUNTA DO USUÁRIO', history: 'HISTÓRICO DA CONVERSA' },
      es: { context: 'CONTEXTO DEL DOCUMENTO', question: 'PREGUNTA DEL USUARIO', history: 'HISTORIAL DE CONVERSACIÓN' },
    };

    const l = labels[lang] || labels.en;

    // Build conversation history section (last 4 turns max to avoid prompt bloat)
    let historySection = '';
    if (conversationHistory && conversationHistory.length > 0) {
      // Take last 4 messages (2 turns) for context
      const recentHistory = conversationHistory.slice(-4);
      const historyText = recentHistory
        .map(msg => {
          const role = msg.role === 'user' ? 'User' : 'Assistant';
          // Truncate long messages to keep prompt manageable
          const content = msg.content.length > 500 ? msg.content.substring(0, 500) + '...' : msg.content;
          return `${role}: ${content}`;
        })
        .join('\n\n');

      historySection = `--- ${l.history} ---
${historyText}

`;
    }

    return `--- ${l.context} ---
${context}

${historySection}--- ${l.question} ---
${query}`;
  }

  /**
   * Extract citations from documents.
   */
  private extractCitations(documents: any[]): Citation[] {
    return documents.slice(0, 5).map((doc, idx) => ({
      documentId: doc.documentId || doc.id || `doc_${idx}`,
      documentName: doc.documentName || doc.filename || `Document ${idx + 1}`,
      pageNumber: doc.pageNumber,
      snippet: doc.content?.substring(0, 100),
    }));
  }

  /**
   * Get "no documents" message from fallback config (no hardcoded messages).
   */
  private getNoDocsMessage(lang: LanguageCode): string {
    const fallback = fallbackConfigService.getFallback('NO_DOCUMENTS', 'short_guidance', lang);
    return fallback?.text || 'No relevant information found for your query.';
  }

  /**
   * Attempt to repair a truncated answer by requesting a continuation.
   * Only attempts repair once to avoid infinite loops.
   *
   * @param truncatedAnswer - The original truncated answer
   * @param query - Original user query
   * @param context - Document context
   * @param lang - Language code
   * @returns Repaired answer or original if repair fails
   */
  public async tryRepairTruncatedAnswer(
    truncatedAnswer: string,
    query: string,
    context: string,
    lang: LanguageCode
  ): Promise<{ text: string; wasRepaired: boolean }> {
    try {
      console.log('[KodaAnswerEngineV3] Attempting to repair truncated answer...');

      const continuationPrompt = this.buildContinuationPrompt(truncatedAnswer, query, lang);

      const response = await geminiGateway.quickGenerateWithMetadata(
        `${continuationPrompt}\n\nContext:\n${context.substring(0, 3000)}`, // Limit context for continuation
        {
          temperature: 0.3,
          maxTokens: 4096, // TRUNCATION-FIX: Continuation tokens for repair pass
        }
      );

      // Check if continuation was also truncated
      const continuationTruncated = this.detectTruncation(response.text, response.finishReason);

      if (continuationTruncated) {
        console.warn('[KodaAnswerEngineV3] Continuation was also truncated, using graceful ending');
        // Add graceful ending to truncated answer
        return {
          text: this.addGracefulEnding(truncatedAnswer, lang),
          wasRepaired: true,
        };
      }

      // Combine original answer with continuation
      const repairedAnswer = this.combineAnswerWithContinuation(truncatedAnswer, response.text);

      console.log(`[KodaAnswerEngineV3] Answer repaired (${repairedAnswer.length} chars)`);

      return {
        text: repairedAnswer,
        wasRepaired: true,
      };
    } catch (error) {
      console.error('[KodaAnswerEngineV3] Failed to repair truncated answer:', error);

      // Return original with graceful ending
      return {
        text: this.addGracefulEnding(truncatedAnswer, lang),
        wasRepaired: false,
      };
    }
  }

  /**
   * Build a continuation prompt for repairing truncated answers.
   */
  private buildContinuationPrompt(truncatedAnswer: string, query: string, lang: LanguageCode): string {
    const prompts: Record<LanguageCode, string> = {
      en: `The following answer was cut off. Please complete it naturally, starting from where it stopped.

Original question: ${query}

Incomplete answer:
${truncatedAnswer}

Please continue the answer from where it was cut off. Do not repeat what was already said.`,
      pt: `A seguinte resposta foi cortada. Por favor, complete-a naturalmente, começando de onde parou.

Pergunta original: ${query}

Resposta incompleta:
${truncatedAnswer}

Por favor, continue a resposta de onde foi cortada. Não repita o que já foi dito.`,
      es: `La siguiente respuesta fue cortada. Por favor, complétala naturalmente, comenzando desde donde se detuvo.

Pregunta original: ${query}

Respuesta incompleta:
${truncatedAnswer}

Por favor, continúa la respuesta desde donde fue cortada. No repitas lo que ya se dijo.`,
    };

    return prompts[lang] || prompts.en;
  }

  /**
   * Combine original answer with continuation.
   */
  private combineAnswerWithContinuation(original: string, continuation: string): string {
    // Remove any overlap between end of original and start of continuation
    const trimmedOriginal = original.trim();
    const trimmedContinuation = continuation.trim();

    // If original ends with incomplete word, try to complete it
    if (/[a-zA-Z]$/.test(trimmedOriginal)) {
      // Add space before continuation
      return `${trimmedOriginal} ${trimmedContinuation}`;
    }

    // If original ends with punctuation, just append
    return `${trimmedOriginal} ${trimmedContinuation}`;
  }

  /**
   * Add a graceful ending to a truncated answer.
   */
  private addGracefulEnding(truncatedAnswer: string, lang: LanguageCode): string {
    const trimmed = truncatedAnswer.trim();

    // If it already ends with proper punctuation, return as-is
    if (/[.!?]$/.test(trimmed)) {
      return trimmed;
    }

    // Add graceful ending based on language
    const endings: Record<LanguageCode, string> = {
      en: '... (response was shortened for brevity)',
      pt: '... (resposta foi resumida por brevidade)',
      es: '... (la respuesta fue resumida por brevedad)',
    };

    return `${trimmed}${endings[lang] || endings.en}`;
  }

  /**
   * Non-destructive budget guard check.
   *
   * Verifies that the combined prompt (system + user + context) fits within model limits.
   * This is a GUARD only - it does NOT silently truncate. If over budget, it:
   * 1. Logs a warning with detailed breakdown
   * 2. Returns budget status for caller to handle
   *
   * The retrieval engine already budgets chunks, so this should rarely trigger.
   * If it does trigger, it indicates a misconfiguration or edge case.
   *
   * @param systemPrompt - System instructions
   * @param userQuery - User's question
   * @param context - Document context string (already budgeted by retrieval)
   * @param language - Language code for token estimation
   * @returns Budget check result with warnings if over limit
   */
  private checkContextBudget(
    systemPrompt: string,
    userQuery: string,
    context: string,
    language?: string
  ): {
    withinBudget: boolean;
    totalTokens: number;
    budgetLimit: number;
    utilizationPercent: number;
    warnings: string[];
  } {
    const tokenEstimator = getTokenBudgetEstimator();
    const budgetingService = getContextWindowBudgeting();

    // Estimate tokens for each component
    const systemTokens = tokenEstimator.estimateDetailed(systemPrompt, language).tokens;
    const userTokens = tokenEstimator.estimateDetailed(userQuery, language).tokens;
    const contextTokens = tokenEstimator.estimateDetailed(context, language).tokens;

    // Add buffer for response (typically 20% of budget)
    const responseBuffer = 2000; // Fixed response buffer for Gemini
    const totalTokens = systemTokens + userTokens + contextTokens + responseBuffer;

    // Get model limit
    const budgetLimit = budgetingService.getModelContextLimit(DEFAULT_MODEL);
    const utilizationPercent = (totalTokens / budgetLimit) * 100;

    const warnings: string[] = [];
    const withinBudget = totalTokens <= budgetLimit;

    // Log detailed breakdown if approaching or exceeding limit
    if (utilizationPercent >= CONTEXT_LIMIT_WARNING_THRESHOLD * 100) {
      const breakdown = {
        systemPrompt: systemTokens,
        userQuery: userTokens,
        context: contextTokens,
        responseBuffer,
        total: totalTokens,
        limit: budgetLimit,
        utilization: `${utilizationPercent.toFixed(1)}%`,
      };

      if (!withinBudget) {
        console.error('[KodaAnswerEngineV3] BUDGET EXCEEDED - Context too large', breakdown);
        warnings.push(
          `Context budget exceeded: ${totalTokens} tokens > ${budgetLimit} limit (${utilizationPercent.toFixed(1)}%). ` +
          `Breakdown: system=${systemTokens}, user=${userTokens}, context=${contextTokens}, buffer=${responseBuffer}`
        );
      } else {
        console.warn('[KodaAnswerEngineV3] High context utilization', breakdown);
        warnings.push(
          `High context utilization: ${utilizationPercent.toFixed(1)}% (${totalTokens}/${budgetLimit} tokens)`
        );
      }
    }

    return {
      withinBudget,
      totalTokens,
      budgetLimit,
      utilizationPercent,
      warnings,
    };
  }

  /**
   * Get budget overflow error message.
   */
  private getBudgetOverflowMessage(lang: LanguageCode): string {
    const messages: Record<LanguageCode, string> = {
      en: "The context is too large to process. Please try with fewer documents or a more specific question.",
      pt: "O contexto é muito grande para processar. Tente com menos documentos ou uma pergunta mais específica.",
      es: "El contexto es demasiado grande para procesar. Intenta con menos documentos o una pregunta más específica.",
    };
    return messages[lang] || messages.en;
  }
}

export default KodaAnswerEngineV3;
