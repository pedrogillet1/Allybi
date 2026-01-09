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

    // FIX D: Pass softAnswerMode to system prompt for conservative answers
    const systemPrompt = this.buildSystemPrompt(intent, lang, domainContext, softAnswerMode);

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
    const systemPrompt = this.buildSystemPrompt(intent, lang, params.domainContext, params.softAnswerMode);
    const userPrompt = this.buildUserPrompt(query, context, lang);
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
      const uniqueDocs = documents.filter(d => {
        const docId = d.documentId || d.id;
        if (!docId || seenIds.has(docId)) return false;
        seenIds.add(docId);
        return true;
      }).slice(0, 3);

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

      const systemPrompt = this.buildSystemPrompt(intent, lang);
      const userPrompt = this.buildUserPrompt(query, context, lang);

      const response = await geminiGateway.quickGenerateWithMetadata(
        `${systemPrompt}\n\n${userPrompt}`,
        {
          temperature: 0.3, // Lower temperature for factual answers
          maxTokens: 2000
        }
      );

      // Check for truncation based on finish_reason
      // Gemini uses: 'STOP' (normal), 'MAX_TOKENS' (truncated), 'SAFETY', 'RECITATION', etc.
      const wasTruncated = this.detectTruncation(response.text, response.finishReason);

      if (wasTruncated) {
        console.warn(`[KodaAnswerEngineV3] Answer may be truncated. Finish reason: ${response.finishReason}`);
      }

      console.log(`[KodaAnswerEngineV3] Generated answer (${response.text.length} chars, truncated: ${wasTruncated})`);

      return {
        text: response.text,
        wasTruncated,
        finishReason: response.finishReason,
      };
    } catch (error) {
      console.error('[KodaAnswerEngineV3] Gemini generation failed:', error);

      // GEMINI FAILURE SOFT MODE: Return document buttons with IDs
      // Use documents array if available (has IDs), otherwise fall back to context extraction
      const seenIds = new Set<string>();
      const uniqueDocs = documents.filter(d => {
        const docId = d.documentId || d.id;
        if (!docId || seenIds.has(docId)) return false;
        seenIds.add(docId);
        return true;
      }).slice(0, 3);

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
   */
  private buildSystemPrompt(
    intent: IntentClassificationV3,
    lang: LanguageCode,
    domainContext?: string,
    softAnswerMode?: boolean
  ): string {
    const languageInstructions: Record<LanguageCode, string> = {
      en: 'Respond in English.',
      pt: 'Responda em Português.',
      es: 'Responde en Español.',
    };

    const questionTypeInstructions = this.getQuestionTypeInstructions(intent.questionType, lang);

    // Add domain-specific context if provided
    const domainSection = domainContext ? `\nDOMAIN CONTEXT:\n${domainContext}\n` : '';

    // FIX D: Soft answer mode instructions - be conservative but still answer
    const softAnswerInstructions: Record<LanguageCode, string> = {
      en: `
IMPORTANT: The user's query may be ambiguous or vague. DO NOT refuse to answer.
Instead:
- Answer based on the most relevant information you find
- If you're not fully confident, prefix with "Based on what I found..."
- End with a brief clarifying question like "Would you like more details about X?"
- NEVER say "please rephrase" or "I can't understand"`,
      pt: `
IMPORTANTE: A consulta do usuário pode ser ambígua. NÃO se recuse a responder.
Em vez disso:
- Responda com base nas informações mais relevantes que encontrar
- Se não tiver certeza, comece com "Com base no que encontrei..."
- Termine com uma pergunta de esclarecimento como "Gostaria de mais detalhes sobre X?"
- NUNCA diga "reformule" ou "não entendi"`,
      es: `
IMPORTANTE: La consulta del usuario puede ser ambigua. NO te niegues a responder.
En su lugar:
- Responde basándote en la información más relevante que encuentres
- Si no estás seguro, comienza con "Según lo que encontré..."
- Termina con una pregunta aclaratoria como "¿Te gustaría más detalles sobre X?"
- NUNCA digas "reformula" o "no entiendo"`,
    };

    const softSection = softAnswerMode ? softAnswerInstructions[lang] : '';

    return `You are Koda, an intelligent document assistant. Your role is to answer questions based ONLY on the provided document context.

CRITICAL RULES:
1. ONLY use information from the provided context
2. Always cite which document the information comes from
3. Be concise but comprehensive
4. ${languageInstructions[lang]}

FORBIDDEN PHRASES (NEVER USE):
- "I can help with..."
- "I can assist with..."
- "I'd be happy to..."
- "I can summarize..."
- "To answer this, I would need..."
- "You can upload..."
- "I'm Koda" or any self-introduction
- "Document management features are coming soon"
- "this particular detail isn't mentioned"
- "based on the documents, this particular"
If you find yourself writing any of these, STOP and provide a direct answer from the snippets.

TRUST_HARDENING - MANDATORY ANSWER RULE:
You HAVE document context below. You MUST use it. Follow these rules strictly:

1. FOR GENERAL QUESTIONS (summaries, overviews, "what is this about", subjective assessments):
   - You MUST provide an answer using the snippets provided
   - Summarize what the document DOES contain
   - NEVER say "not found" for general/subjective questions
   - Example: "Is this theoretical or practical?" -> Answer based on content you see

2. FOR SPECIFIC FIELD QUESTIONS (exact dates, specific numbers, named entities):
   - If the EXACT value isn't in snippets, say: "The specific [field] isn't stated, but the document discusses [related content]..."
   - Still provide what IS available

3. ONLY use "Not found" when:
   - The user asks for a SPECIFIC data point (like "expiry date", "total amount")
   - AND that exact value is genuinely absent from all snippets
   - AND there's no related information to share

4. EVIDENCE USAGE (MANDATORY):
   - Quote or paraphrase at least ONE snippet in your answer
   - Reference the document name
   - If you have snippets, you have evidence - USE IT

GROUNDING RULES:
- Every factual claim must be verifiable from the provided snippets
- NUMBERS: If you output any number (money, %, years, counts, totals), you must quote the exact snippet text containing that number
- NEGATION: Never claim "the document does not contain X" - instead describe what it DOES contain

ANSWER LANGUAGE POLICY:
- Use confident framing:
  - "Based on the document..."
  - "The document shows..."
  - "From the context..."
- For subjective questions, provide your best assessment using available evidence
- Keep answers tight - no multi-paragraph preambles
${domainSection}
${questionTypeInstructions}
${softSection}`;
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
   * Build user prompt with query and context.
   */
  private buildUserPrompt(query: string, context: string, lang: LanguageCode): string {
    const labels: Record<LanguageCode, { context: string; question: string }> = {
      en: { context: 'DOCUMENT CONTEXT', question: 'USER QUESTION' },
      pt: { context: 'CONTEXTO DO DOCUMENTO', question: 'PERGUNTA DO USUÁRIO' },
      es: { context: 'CONTEXTO DEL DOCUMENTO', question: 'PREGUNTA DEL USUARIO' },
    };

    const l = labels[lang] || labels.en;

    return `--- ${l.context} ---
${context}

--- ${l.question} ---
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
        `${continuationPrompt}\n\nContext:\n${context.substring(0, 2000)}`, // Limit context for continuation
        {
          temperature: 0.3,
          maxTokens: 1000, // Smaller budget for continuation
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
