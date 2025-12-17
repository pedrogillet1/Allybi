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
}

export interface AnswerResult {
  answer: string;
  confidenceScore?: number;
  citations?: Citation[];
  wasTruncated?: boolean;
  finishReason?: string;
}

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

📄 **Document Q&A** - Ask me anything about your documents
🔍 **Search** - Find specific documents or information
📊 **Analytics** - Get statistics about your document library
📝 **Summarize** - Get quick summaries of document content
🔄 **Compare** - Compare information across documents

Just upload your documents and ask me anything!`,
  pt: `Sou o **Koda**, seu assistente de documentos com IA! Aqui está o que posso fazer:

📄 **Perguntas sobre Documentos** - Pergunte qualquer coisa sobre seus documentos
🔍 **Pesquisa** - Encontre documentos ou informações específicas
📊 **Análises** - Obtenha estatísticas sobre sua biblioteca de documentos
📝 **Resumir** - Obtenha resumos rápidos do conteúdo dos documentos
🔄 **Comparar** - Compare informações entre documentos

Basta enviar seus documentos e me perguntar qualquer coisa!`,
  es: `¡Soy **Koda**, tu asistente de documentos con IA! Esto es lo que puedo hacer:

📄 **Preguntas sobre Documentos** - Pregúntame cualquier cosa sobre tus documentos
🔍 **Búsqueda** - Encuentra documentos o información específica
📊 **Análisis** - Obtén estadísticas sobre tu biblioteca de documentos
📝 **Resumir** - Obtén resúmenes rápidos del contenido de los documentos
🔄 **Comparar** - Compara información entre documentos

¡Solo sube tus documentos y pregúntame cualquier cosa!`,
};

// ============================================================================
// KODA ANSWER ENGINE V3
// ============================================================================

export class KodaAnswerEngineV3 {
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
    const { query, documents, language, intent } = params;
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
    const systemPrompt = this.buildSystemPrompt(intent, lang);

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
    const result = await this.generateDocumentAnswer(query, context, intent, lang);

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

    // 🛡️ GUARD: Handle empty documents case early with language-aware fallback
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
    const systemPrompt = this.buildSystemPrompt(intent, lang);
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

      // Yield error fallback with language-aware message
      const fallbackMsg = this.getStreamingErrorMessage(lang);
      if (fullAnswer.length === 0) {
        yield { type: 'content', content: fallbackMsg } as ContentEvent;
        fullAnswer = fallbackMsg;
      }

      // Emit error event
      yield {
        type: 'error',
        error: (error as Error).message,
      } as StreamEvent;

      return {
        fullAnswer,
        intent: intent.primaryIntent || 'DOC_QA',
        confidence: 0.3,
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
      en: "I encountered an issue while generating the response. Please try again.",
      pt: "Encontrei um problema ao gerar a resposta. Por favor, tente novamente.",
      es: "Encontré un problema al generar la respuesta. Por favor, inténtalo de nuevo.",
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
    lang: LanguageCode
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

      // Fallback to basic response
      const fallbackMessages: Record<LanguageCode, string> = {
        en: "I found relevant information in your documents but encountered an issue generating a detailed response. Please try again.",
        pt: "Encontrei informações relevantes nos seus documentos, mas tive um problema ao gerar uma resposta detalhada. Por favor, tente novamente.",
        es: "Encontré información relevante en tus documentos, pero tuve un problema al generar una respuesta detallada. Por favor, inténtalo de nuevo.",
      };

      return {
        text: fallbackMessages[lang] || fallbackMessages.en,
        wasTruncated: false,
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
   */
  private buildSystemPrompt(intent: IntentClassificationV3, lang: LanguageCode): string {
    const languageInstructions: Record<LanguageCode, string> = {
      en: 'Respond in English.',
      pt: 'Responda em Português.',
      es: 'Responde en Español.',
    };

    const questionTypeInstructions = this.getQuestionTypeInstructions(intent.questionType, lang);

    return `You are Koda, an intelligent document assistant. Your role is to answer questions based ONLY on the provided document context.

CRITICAL RULES:
1. ONLY use information from the provided context
2. If the context doesn't contain the answer, say so clearly
3. Always cite which document the information comes from
4. Be concise but comprehensive
5. ${languageInstructions[lang]}

${questionTypeInstructions}`;
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
   * Get "no documents" message.
   */
  private getNoDocsMessage(lang: LanguageCode): string {
    const messages: Record<LanguageCode, string> = {
      en: "I couldn't find relevant information in your documents. Try rephrasing your question or check if the document has been uploaded.",
      pt: "Não encontrei informações relevantes nos seus documentos. Tente reformular sua pergunta ou verifique se o documento foi enviado.",
      es: "No encontré información relevante en tus documentos. Intenta reformular tu pregunta o verifica si el documento fue subido.",
    };
    return messages[lang] || messages.en;
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
