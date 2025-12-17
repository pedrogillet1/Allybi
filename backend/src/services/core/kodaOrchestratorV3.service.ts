/**
 * KODA V3 Orchestrator Service
 *
 * Central traffic cop for all intents
 * Handles ALL 25 intent types with proper routing
 *
 * Based on: pasted_content_21.txt Layer 5 and pasted_content_22.txt Section 2 specifications
 */

import { KodaIntentEngineV3 } from './kodaIntentEngineV3.service';
import { FallbackConfigService } from './fallbackConfig.service';
import { KodaProductHelpServiceV3 } from './kodaProductHelpV3.service';
import { KodaFormattingPipelineV3Service } from './kodaFormattingPipelineV3.service';
import KodaRetrievalEngineV3 from './kodaRetrievalEngineV3.service';
import KodaAnswerEngineV3 from './kodaAnswerEngineV3.service';
import prisma from '../../config/database';

// Decision tree for family/sub-intent based routing
import {
  decide,
  DecisionResult,
  DecisionSignals,
  isErrorDecision,
  getFallbackScenario,
} from './decisionTree.service';

// Multi-intent and override services - TYPES ONLY for DI
// NOTE: Instances are injected via container.ts, NOT imported as singletons
import { MultiIntentService } from './multiIntent.service';
import { OverrideService } from './override.service';

// Service types for DI - these are injected via container.ts
import { UserPreferencesService } from '../user/userPreferences.service';
import { ConversationMemoryService } from '../memory/conversationMemory.service';
import { FeedbackLoggerService } from '../analytics/feedbackLogger.service';
import { AnalyticsEngineService } from '../analytics/analyticsEngine.service';
import { DocumentSearchService } from '../analytics/documentSearch.service';
import { KodaAnswerValidationService } from '../validation/kodaAnswerValidation.service';
import {
  IntentName,
  LanguageCode,
  PredictedIntent,
  IntentHandlerResponse,
} from '../../types/intentV3.types';

import {
  IntentDomain,
  QuestionType,
  QueryScope,
} from '../../types/ragV3.types';

import type {
  IntentClassificationV3,
  DocumentTarget,
} from '../../types/ragV3.types';

import type {
  StreamEvent,
  ContentEvent,
  StreamingResult,
  StreamGenerator,
} from '../../types/streaming.types';

// ============================================================================
// INTENT TYPE ADAPTER
// ============================================================================

/**
 * Convert PredictedIntent (from intent engine) to IntentClassificationV3 (for RAG services)
 * This bridges the gap between the lightweight intent classification and the full RAG type.
 */
function adaptPredictedIntent(predicted: PredictedIntent, request: OrchestratorRequest): IntentClassificationV3 {
  const intent = predicted.primaryIntent;

  // Determine domain based on intent (using enum values)
  // V4 simplified: 9 core intents + 6 domain-specific intents
  const getDomain = (): IntentDomain => {
    // Document-related intents
    if (intent === 'documents') return IntentDomain.DOCUMENTS;
    // Domain-specific document intents
    if (['excel', 'accounting', 'engineering', 'finance', 'legal', 'medical'].includes(intent)) {
      return IntentDomain.DOCUMENTS;
    }
    // Product help
    if (intent === 'help') return IntentDomain.PRODUCT;
    // Conversation (chitchat, feedback)
    if (intent === 'conversation') return IntentDomain.CHITCHAT;
    // All other intents
    return IntentDomain.GENERAL;
  };

  // Determine question type based on intent (using enum values)
  // V4 simplified intent mapping
  const getQuestionType = (): QuestionType => {
    switch (intent) {
      case 'documents': return QuestionType.OTHER;
      case 'reasoning': return QuestionType.WHY;
      case 'extraction': return QuestionType.EXTRACT;
      case 'edit': return QuestionType.EXTRACT;
      // Domain-specific default to OTHER
      case 'excel':
      case 'accounting':
      case 'engineering':
      case 'finance':
      case 'legal':
      case 'medical':
        return QuestionType.OTHER;
      default: return QuestionType.OTHER;
    }
  };

  // Determine scope based on context (using enum values)
  const getScope = (): QueryScope => {
    if (request.context?.attachedDocumentIds?.length === 1) return QueryScope.SINGLE_DOC;
    if (request.context?.attachedDocumentIds?.length > 1) return QueryScope.MULTI_DOC;
    return QueryScope.ALL_DOCS;
  };

  // Determine document target (returns interface object)
  const getTarget = (): DocumentTarget => {
    if (request.context?.attachedDocumentIds?.length > 0) {
      return {
        type: 'BY_ID',
        documentIds: request.context.attachedDocumentIds,
      };
    }
    return { type: 'NONE' };
  };

  // Determine if RAG is required (V4 simplified intents)
  const documentIntents = ['documents', 'excel', 'accounting', 'engineering', 'finance', 'legal', 'medical'];
  const requiresRAG = documentIntents.includes(intent);

  // Determine if product help is required (V4: help intent covers all product help)
  const requiresProductHelp = intent === 'help';

  return {
    primaryIntent: intent,
    domain: getDomain(),
    questionType: getQuestionType(),
    scope: getScope(),
    language: predicted.language,
    requiresRAG,
    requiresProductHelp,
    target: getTarget(),
    documentTargets: request.context?.attachedDocumentIds || [],
    rawQuery: request.text,
    confidence: predicted.confidence,
    matchedPattern: predicted.matchedPattern,
    matchedKeywords: predicted.matchedKeywords,
    metadata: {
      queryLength: request.text.length,
      hasContext: !!request.context,
      classificationTimeMs: 0, // Not tracked at this level
    },
  };
}

export interface OrchestratorRequest {
  text: string;
  userId: string;
  conversationId?: string;
  language?: LanguageCode;
  context?: any;
  /** AbortSignal for cancellation on client disconnect */
  abortSignal?: AbortSignal;
}

// Handler context type
interface HandlerContext {
  request: OrchestratorRequest;
  intent: PredictedIntent;
  language: LanguageCode;
}

export class KodaOrchestratorV3 {
  // Core services - REQUIRED
  private readonly intentEngine: KodaIntentEngineV3;
  private readonly fallbackConfig: FallbackConfigService;
  private readonly productHelp: KodaProductHelpServiceV3;
  private readonly formattingPipeline: KodaFormattingPipelineV3Service;
  private readonly retrievalEngine: KodaRetrievalEngineV3;
  private readonly answerEngine: KodaAnswerEngineV3;

  // Multi-intent and override services - REQUIRED (from container.ts DI)
  private readonly multiIntent: MultiIntentService;
  private readonly override: OverrideService;

  // Analytics & utility services - REQUIRED (from container.ts DI)
  private readonly documentSearch: DocumentSearchService;
  private readonly userPreferences: UserPreferencesService;
  private readonly conversationMemory: ConversationMemoryService;
  private readonly feedbackLogger: FeedbackLoggerService;
  private readonly analyticsEngine: AnalyticsEngineService;
  private readonly validationService: KodaAnswerValidationService;

  // Logger
  private readonly logger: Console;

  constructor(
    services: {
      // Core RAG services - ALL REQUIRED
      intentEngine: KodaIntentEngineV3;
      fallbackConfig: FallbackConfigService;
      productHelp: KodaProductHelpServiceV3;
      formattingPipeline: KodaFormattingPipelineV3Service;
      retrievalEngine: KodaRetrievalEngineV3;
      answerEngine: KodaAnswerEngineV3;
      // Multi-intent and override services - ALL REQUIRED
      multiIntent: MultiIntentService;
      override: OverrideService;
      // Analytics & utility services - ALL REQUIRED
      documentSearch: DocumentSearchService;
      userPreferences: UserPreferencesService;
      conversationMemory: ConversationMemoryService;
      feedbackLogger: FeedbackLoggerService;
      analyticsEngine: AnalyticsEngineService;
      validationService: KodaAnswerValidationService;
    },
    logger?: Console
  ) {
    // CRITICAL: ALL services MUST be provided (fail-fast pattern)
    // No optional services - container.ts guarantees all are provided
    if (!services.intentEngine) throw new Error('[Orchestrator] intentEngine is REQUIRED');
    if (!services.fallbackConfig) throw new Error('[Orchestrator] fallbackConfig is REQUIRED');
    if (!services.productHelp) throw new Error('[Orchestrator] productHelp is REQUIRED');
    if (!services.formattingPipeline) throw new Error('[Orchestrator] formattingPipeline is REQUIRED');
    if (!services.retrievalEngine) throw new Error('[Orchestrator] retrievalEngine is REQUIRED');
    if (!services.answerEngine) throw new Error('[Orchestrator] answerEngine is REQUIRED');
    if (!services.multiIntent) throw new Error('[Orchestrator] multiIntent is REQUIRED');
    if (!services.override) throw new Error('[Orchestrator] override is REQUIRED');
    if (!services.documentSearch) throw new Error('[Orchestrator] documentSearch is REQUIRED');
    if (!services.userPreferences) throw new Error('[Orchestrator] userPreferences is REQUIRED');
    if (!services.conversationMemory) throw new Error('[Orchestrator] conversationMemory is REQUIRED');
    if (!services.feedbackLogger) throw new Error('[Orchestrator] feedbackLogger is REQUIRED');
    if (!services.analyticsEngine) throw new Error('[Orchestrator] analyticsEngine is REQUIRED');
    if (!services.validationService) throw new Error('[Orchestrator] validationService is REQUIRED');

    // Assign all services (no optional chains needed - all guaranteed)
    this.intentEngine = services.intentEngine;
    this.fallbackConfig = services.fallbackConfig;
    this.productHelp = services.productHelp;
    this.formattingPipeline = services.formattingPipeline;
    this.retrievalEngine = services.retrievalEngine;
    this.answerEngine = services.answerEngine;
    this.multiIntent = services.multiIntent;
    this.override = services.override;
    this.documentSearch = services.documentSearch;
    this.userPreferences = services.userPreferences;
    this.conversationMemory = services.conversationMemory;
    this.feedbackLogger = services.feedbackLogger;
    this.analyticsEngine = services.analyticsEngine;
    this.validationService = services.validationService;
    this.logger = logger || console;
  }

  /**
   * Main orchestration entry point
   * Routes request to appropriate handler based on decision tree (family/sub-intent)
   *
   * Flow:
   * 1. Classify intent
   * 2. Detect multi-intent (if multiple segments, process sequentially)
   * 3. Apply override rules based on workspace context
   * 4. Run decision tree for family/sub-intent classification
   * 5. Route to appropriate handler based on decision
   */
  async orchestrate(request: OrchestratorRequest): Promise<IntentHandlerResponse> {
    const startTime = Date.now();

    try {
      // 1. Classify primary intent
      const intent = await this.intentEngine.predict({
        text: request.text,
        language: request.language,
        context: request.context,
      });

      this.logger.info(
        `[Orchestrator] userId=${request.userId} intent=${intent.primaryIntent} confidence=${intent.confidence.toFixed(2)}`
      );

      // 2. Multi-intent detection (using injected service)
      const multiIntentResult = this.multiIntent.detect(request.text);
      if (multiIntentResult.isMultiIntent && multiIntentResult.segments.length > 1) {
        this.logger.info(
          `[Orchestrator] Multi-intent detected: ${multiIntentResult.segments.length} segments`
        );
        // Process segments sequentially and combine responses
        return this.processMultiIntentSequentially(request, multiIntentResult.segments, startTime);
      }

      // 3. Get workspace stats for override rules
      const docCount = await this.getDocumentCount(request.userId);
      const workspaceStats = { docCount };
      const hasDocs = docCount > 0;

      // 4. Apply override rules (e.g., no docs + help query → PRODUCT_HELP)
      const adaptedIntent = adaptPredictedIntent(intent, request);
      const overriddenIntent = await this.override.override({
        intent: adaptedIntent,
        userId: request.userId,
        query: request.text,
        workspaceStats,
      });

      // Log if override was applied
      if (overriddenIntent.overrideReason) {
        this.logger.info(
          `[Orchestrator] Override applied: ${intent.primaryIntent} → ${overriddenIntent.primaryIntent} (${overriddenIntent.overrideReason})`
        );
      }

      // 5. Create PredictedIntent from overridden intent for routing
      const finalIntent: PredictedIntent = {
        ...intent,
        primaryIntent: overriddenIntent.primaryIntent as any,
        confidence: overriddenIntent.confidence,
      };

      // 6. Run decision tree for family/sub-intent classification
      const decisionSignals: DecisionSignals = {
        predicted: finalIntent,
        hasDocs,
        isRewrite: false,
        isFollowup: !!request.conversationId,
      };
      const decision = decide(decisionSignals);

      this.logger.info(
        `[Orchestrator] Decision: ${decision.reason}`
      );

      // 7. Route to appropriate handler based on decision (family/sub-intent)
      const response = await this.routeDecision(request, finalIntent, decision);

      // 8. REPETITION CHECK: Get previous assistant answer and check for repetition
      const previousAnswer = await this.getLastAssistantAnswer(request.conversationId);
      this.logger.info(`[Orchestrator] Repetition check: conversationId=${request.conversationId}, hasPrevious=${!!previousAnswer}, prevLen=${previousAnswer?.length || 0}`);

      if (previousAnswer && response.answer) {
        const repetitionCheck = this.validationService.checkRepetition(
          response.answer,
          previousAnswer,
          intent.language || 'en'
        );
        this.logger.info(`[Orchestrator] Repetition result: similarity=${repetitionCheck.similarity.toFixed(2)}, isRepetition=${repetitionCheck.isRepetition}`);

        if (repetitionCheck.isRepetition && repetitionCheck.shortConfirmation) {
          this.logger.info(`[Orchestrator] Repetition detected (similarity: ${repetitionCheck.similarity.toFixed(2)}), returning short confirmation`);
          return {
            answer: repetitionCheck.shortConfirmation,
            formatted: repetitionCheck.shortConfirmation,
            metadata: {
              intent: finalIntent.primaryIntent,
              confidence: finalIntent.confidence,
              processingTime: Date.now() - startTime,
              wasRepetition: true,
              repetitionSimilarity: repetitionCheck.similarity,
            } as any,
          };
        }
      }

      // 9. Add metadata
      response.metadata = {
        ...response.metadata,
        intent: finalIntent.primaryIntent,
        confidence: finalIntent.confidence,
        processingTime: Date.now() - startTime,
        overrideApplied: !!overriddenIntent.overrideReason,
      };

      return response;

    } catch (error) {
      this.logger.error('[Orchestrator] Error processing request:', error);
      return await this.buildErrorResponse(request, error);
    }
  }

  /**
   * Process multiple intent segments sequentially.
   * IMPORTANT: Calls routeIntent directly per segment to avoid recursion.
   * Returns structured response with labeled steps and comprehensive metadata.
   */
  private async processMultiIntentSequentially(
    request: OrchestratorRequest,
    segments: string[],
    startTime: number
  ): Promise<IntentHandlerResponse> {
    interface SegmentData {
      label: string;
      intent: string;
      confidence: number;
      answer: string;
      documentsUsed: number;
    }

    const segmentsData: SegmentData[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segmentText = segments[i];

      // Classify each segment
      const segmentIntent = await this.intentEngine.predict({
        text: segmentText,
        language: request.language,
        context: request.context,
      });

      // Create segment request
      const segmentRequest: OrchestratorRequest = {
        ...request,
        text: segmentText,
      };

      // Route directly (no recursion into orchestrate)
      const segmentResponse = await this.routeIntent(segmentRequest, segmentIntent);

      // Collect structured segment data
      segmentsData.push({
        label: `Step ${i + 1}`,
        intent: segmentIntent.primaryIntent,
        confidence: segmentIntent.confidence,
        answer: segmentResponse.answer,
        documentsUsed: segmentResponse.metadata?.documentsUsed || 0,
      });
    }

    // Build structured combined answer with clear labels (no --- separators)
    const rawCombinedAnswer = segmentsData
      .map(s => `**${s.label}:**\n${s.answer}`)
      .join('\n\n');

    // Calculate totals
    const totalDocumentsUsed = segmentsData.reduce((sum, s) => sum + s.documentsUsed, 0);

    // Build segment metadata array (without full answer text)
    const segmentsMeta = segmentsData.map(s => ({
      intent: s.intent,
      confidence: s.confidence,
      documentsUsed: s.documentsUsed,
    }));

    // Pass through formatting pipeline for consistent output
    // V4: Use 'documents' as base intent for multi-intent formatting
    const formattedResult = await this.formattingPipeline.format({
      text: rawCombinedAnswer,
      intent: 'documents',
      language: request.language,
    });

    return {
      answer: formattedResult.markdown || rawCombinedAnswer,
      formatted: formattedResult.markdown || rawCombinedAnswer,
      metadata: {
        intent: 'documents' as any, // V4: Multi-intent responses use 'documents' as base
        confidence: Math.min(...segmentsData.map(s => s.confidence)),
        processingTime: Date.now() - startTime,
        multiIntent: true,
        segmentCount: segments.length,
        segments: segmentsMeta,
        documentsUsed: totalDocumentsUsed,
      },
    };
  }

  /**
   * Get document count for user (for override rules).
   */
  private async getDocumentCount(userId: string): Promise<number> {
    try {
      return await prisma.document.count({
        where: {
          userId,
          status: 'completed',
        },
      });
    } catch (error) {
      this.logger.error('[Orchestrator] Error getting document count:', error);
      return 0;
    }
  }

  /**
   * TRUE STREAMING orchestration entry point.
   * Yields StreamEvent chunks in real-time as they arrive from LLM.
   *
   * TTFT (Time To First Token) should be <300-800ms.
   *
   * Flow:
   * 1. Classify intent
   * 2. Log multi-intent if detected (skip processing for streaming)
   * 3. Apply override rules
   * 4. Route to streaming handler
   */
  async *orchestrateStream(request: OrchestratorRequest): StreamGenerator {
    const startTime = Date.now();

    try {
      // Step 1: Classify intent (fast, non-streaming)
      const intent = await this.intentEngine.predict({
        text: request.text,
        language: request.language,
        context: request.context,
      });

      const language = intent.language || request.language || 'en';

      this.logger.info(
        `[Orchestrator] STREAMING userId=${request.userId} intent=${intent.primaryIntent} confidence=${intent.confidence.toFixed(2)}`
      );

      // Step 2: Multi-intent detection - process segments with per-segment streaming
      const multiIntentResult = this.multiIntent.detect(request.text);
      if (multiIntentResult.isMultiIntent && multiIntentResult.segments.length > 1) {
        this.logger.info(
          `[Orchestrator] Multi-intent streaming: ${multiIntentResult.segments.length} segments`
        );

        // Yield initial intent event
        // V4: Use 'documents' as base intent for multi-intent streams
        yield {
          type: 'intent',
          intent: 'documents',
          confidence: intent.confidence,
          multiIntent: true, // Flag to indicate multi-intent processing
        } as StreamEvent;

        // Process each segment and emit content with segment markers
        const segmentsData: Array<{
          intent: string;
          confidence: number;
          answer: string;
          documentsUsed: number;
        }> = [];

        for (let i = 0; i < multiIntentResult.segments.length; i++) {
          const segmentText = multiIntentResult.segments[i];

          // Classify segment intent
          const segmentIntent = await this.intentEngine.predict({
            text: segmentText,
            language: request.language,
            context: request.context,
          });

          // Route segment (non-streaming)
          const segmentRequest: OrchestratorRequest = { ...request, text: segmentText };
          const segmentResponse = await this.routeIntent(segmentRequest, segmentIntent);

          // Collect segment data
          segmentsData.push({
            intent: segmentIntent.primaryIntent,
            confidence: segmentIntent.confidence,
            answer: segmentResponse.answer,
            documentsUsed: segmentResponse.metadata?.documentsUsed || 0,
          });

          // Format segment content through pipeline
          const formattedSegment = await this.formattingPipeline.format({
            text: segmentResponse.answer,
            intent: segmentIntent.primaryIntent,
            language: request.language,
          });
          const segmentContent = formattedSegment.markdown || segmentResponse.answer;

          // Emit content event with segment marker (no --- separators)
          const stepLabel = `**Step ${i + 1}:**\n${segmentContent}`;
          yield {
            type: 'content',
            segment: i + 1,
            intent: segmentIntent.primaryIntent,
            content: stepLabel,
          } as StreamEvent;

          // Add spacing between segments (except after last) - no ---
          if (i < multiIntentResult.segments.length - 1) {
            yield { type: 'content', content: '\n\n' } as StreamEvent;
          }
        }

        // Build combined answer (no --- separators)
        const combinedAnswer = segmentsData
          .map((s, i) => `**Step ${i + 1}:**\n${s.answer}`)
          .join('\n\n');

        const totalDocumentsUsed = segmentsData.reduce((sum, s) => sum + s.documentsUsed, 0);
        const processingTime = Date.now() - startTime;

        // Emit metadata event with segments info
        yield {
          type: 'metadata',
          processingTime,
          documentsUsed: totalDocumentsUsed,
          multiIntent: true,
          segmentCount: segmentsData.length,
          segments: segmentsData.map(s => ({
            intent: s.intent,
            confidence: s.confidence,
            documentsUsed: s.documentsUsed,
          })),
        } as StreamEvent;

        // Emit done event with full structured answer
        yield {
          type: 'done',
          fullAnswer: combinedAnswer,
        } as StreamEvent;

        return {
          fullAnswer: combinedAnswer,
          intent: 'documents', // V4: Multi-intent uses 'documents' as base
          confidence: Math.min(...segmentsData.map(s => s.confidence)),
          documentsUsed: totalDocumentsUsed,
          processingTime,
        };
      }

      // Step 3: Get workspace stats and apply override rules
      const docCount = await this.getDocumentCount(request.userId);
      const workspaceStats = { docCount };

      const adaptedIntent = adaptPredictedIntent(intent, request);
      const overriddenIntent = await this.override.override({
        intent: adaptedIntent,
        userId: request.userId,
        query: request.text,
        workspaceStats,
      });

      // Log if override was applied
      if (overriddenIntent.overrideReason) {
        this.logger.info(
          `[Orchestrator] Stream override applied: ${intent.primaryIntent} → ${overriddenIntent.primaryIntent} (${overriddenIntent.overrideReason})`
        );
      }

      // Create final intent for routing
      const finalIntent: PredictedIntent = {
        ...intent,
        primaryIntent: overriddenIntent.primaryIntent as any,
        confidence: overriddenIntent.confidence,
        language,
      };

      // Yield intent event (with possibly overridden intent)
      yield {
        type: 'intent',
        intent: finalIntent.primaryIntent,
        confidence: finalIntent.confidence,
      } as StreamEvent;

      // Step 4: Route to streaming handler based on (possibly overridden) intent
      let result: StreamingResult;

      // Track whether the handler emits its own done event (to avoid duplicate)
      // V4: 'documents' + domain-specific intents all use streaming
      const documentIntents = ['documents', 'excel', 'accounting', 'engineering', 'finance', 'legal', 'medical'];
      const handlerEmitsDone = documentIntents.includes(finalIntent.primaryIntent);

      if (documentIntents.includes(finalIntent.primaryIntent)) {
        // Document-related intents use TRUE streaming
        // These handlers emit their own rich done event with citations, formatted, etc.
        result = yield* this.streamDocumentQnA(request, finalIntent, language);
      } else if (finalIntent.primaryIntent === 'conversation' || finalIntent.primaryIntent === 'extraction') {
        // Simple intents - generate once and yield
        result = yield* this.streamSimpleResponse(request, finalIntent, language);
      } else {
        // Other intents - use non-streaming then yield the result
        const response = await this.routeIntent(request, finalIntent);
        yield { type: 'content', content: response.answer } as ContentEvent;
        result = {
          fullAnswer: response.answer,
          intent: finalIntent.primaryIntent,
          confidence: finalIntent.confidence,
          documentsUsed: response.metadata?.documentsUsed || 0,
          processingTime: Date.now() - startTime,
        };
      }

      // Only emit metadata/done for handlers that don't emit their own
      // Streaming handlers (DOC_QA, DOC_SEARCH, DOC_SUMMARIZE) emit rich done events
      // with citations, formatted answer, sourceDocumentIds, wasTruncated, etc.
      // Emitting another done here would overwrite that rich metadata.
      if (!handlerEmitsDone) {
        // Yield metadata event
        yield {
          type: 'metadata',
          processingTime: result.processingTime,
          documentsUsed: result.documentsUsed,
        } as StreamEvent;

        // Yield done event - REQUIRED for proper stream completion
        yield {
          type: 'done',
          fullAnswer: result.fullAnswer,
        } as StreamEvent;
      }

      return result;

    } catch (error: any) {
      this.logger.error('[Orchestrator] Streaming error:', error);

      // Yield error
      yield {
        type: 'error',
        error: error.message || 'An error occurred',
      } as StreamEvent;

      return {
        fullAnswer: 'Sorry, an error occurred. Please try again.',
        intent: 'UNKNOWN',
        confidence: 0,
        documentsUsed: 0,
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Stream DOC_QA response using TRUE streaming from answer engine.
   * Event order: intent → retrieving → generating → content* → citations → metadata → done
   * Supports AbortSignal for cancellation on client disconnect.
   */
  private async *streamDocumentQnA(
    request: OrchestratorRequest,
    intent: PredictedIntent,
    language: LanguageCode
  ): StreamGenerator {
    const startTime = Date.now();
    const abortSignal = request.abortSignal;

    // Helper to check if aborted
    const isAborted = () => abortSignal?.aborted ?? false;

    // Check if user has documents
    const hasDocuments = await this.checkUserHasDocuments(request.userId);
    if (!hasDocuments) {
      const fallback = this.fallbackConfig.getFallback('NO_DOCUMENTS', 'short_guidance', language);
      yield { type: 'content', content: fallback.text } as ContentEvent;
      yield { type: 'done', fullAnswer: fallback.text } as StreamEvent;
      return {
        fullAnswer: fallback.text,
        intent: intent.primaryIntent,
        confidence: intent.confidence,
        documentsUsed: 0,
        processingTime: Date.now() - startTime,
      };
    }

    // Check abort before retrieval
    if (isAborted()) {
      this.logger.info('[Orchestrator] Stream aborted before retrieval');
      return {
        fullAnswer: '',
        intent: intent.primaryIntent,
        confidence: intent.confidence,
        documentsUsed: 0,
        processingTime: Date.now() - startTime,
      };
    }

    // Yield retrieving event
    yield { type: 'retrieving', message: 'Searching documents...' } as StreamEvent;

    // Convert PredictedIntent to IntentClassificationV3 for RAG services
    const adaptedIntent = adaptPredictedIntent(intent, request);

    // Retrieve documents with metadata (non-streaming - fast)
    const retrievalResult = await this.retrievalEngine.retrieveWithMetadata({
      query: request.text,
      userId: request.userId,
      language,
      intent: adaptedIntent,
    });

    if (!retrievalResult.chunks || retrievalResult.chunks.length === 0) {
      const noDocsMsg = this.getNoResultsMessage(language);
      yield { type: 'content', content: noDocsMsg } as ContentEvent;
      yield { type: 'done', fullAnswer: noDocsMsg } as StreamEvent;
      return {
        fullAnswer: noDocsMsg,
        intent: intent.primaryIntent,
        confidence: intent.confidence,
        documentsUsed: 0,
        processingTime: Date.now() - startTime,
      };
    }

    // Check abort after retrieval
    if (isAborted()) {
      this.logger.info('[Orchestrator] Stream aborted after retrieval');
      return {
        fullAnswer: '',
        intent: intent.primaryIntent,
        confidence: intent.confidence,
        documentsUsed: retrievalResult.chunks.length,
        processingTime: Date.now() - startTime,
      };
    }

    // Yield generating event with document count
    yield {
      type: 'generating',
      message: `Generating answer from ${retrievalResult.chunks.length} document chunks...`,
    } as StreamEvent;

    // TRUE STREAMING: Use answer engine's async generator with abort signal
    const answerStream = this.answerEngine.streamAnswerWithDocsAsync({
      userId: request.userId,
      query: request.text,
      intent: adaptedIntent,
      documents: retrievalResult.chunks,
      language,
      abortSignal, // Pass abort signal to answer engine
    });

    // FIXED: Manually iterate to capture generator return value
    // (for await doesn't give access to return value after completion)
    let fullAnswer = '';
    let tokensUsed = 0;
    let wasAborted = false;
    let iterResult = await answerStream.next();

    while (!iterResult.done) {
      // Check abort during streaming
      if (isAborted()) {
        this.logger.info('[Orchestrator] Stream aborted during LLM generation');
        wasAborted = true;
        break;
      }

      const event = iterResult.value;
      yield event;

      if (event.type === 'content') {
        fullAnswer += (event as ContentEvent).content;
      }

      iterResult = await answerStream.next();
    }

    // Capture generator return value (when iterResult.done === true)
    if (!wasAborted && iterResult.done) {
      const generatorReturn = iterResult.value as StreamingResult | undefined;
      if (generatorReturn) {
        fullAnswer = generatorReturn.fullAnswer || fullAnswer;
        tokensUsed = generatorReturn.tokensUsed || 0;
      }
    }

    // If aborted, return early with partial result
    if (wasAborted) {
      return {
        fullAnswer,
        intent: intent.primaryIntent,
        confidence: intent.confidence,
        documentsUsed: retrievalResult.chunks.length,
        tokensUsed,
        processingTime: Date.now() - startTime,
      };
    }

    // Extract citations from retrieval chunks
    const citations = this.extractCitationsFromChunks(retrievalResult.chunks);
    if (citations.length > 0) {
      yield {
        type: 'citation',
        citations,
      } as StreamEvent;
    }

    // ====================================================================
    // FORMATTING CONTRACT: Run accumulated answer through formatting pipeline
    // This ensures streaming responses get the same treatment as non-streaming:
    // - {{DOC::...}} marker injection
    // - Markdown validation
    // - Truncation detection
    // ====================================================================

    // Convert citations to formatting pipeline format
    const convertedCitations = citations.map(c => ({
      docId: c.documentId,
      docName: c.documentName,
      pageNumber: c.pageNumber,
      chunkId: c.chunkId,  // FIXED: Use actual chunkId from citation
      relevanceScore: undefined,
    }));

    // Extract document references for marker injection
    const documentReferences = this.extractDocumentReferences(retrievalResult.chunks);

    // Format the complete answer through the pipeline
    const formatted = await this.formattingPipeline.format({
      text: fullAnswer,
      citations: convertedCitations,
      documents: documentReferences,
      intent: intent.primaryIntent,
      language,
    });

    // Use formatted text if available, log truncation detection
    const formattedAnswer = formatted.markdown || formatted.text || fullAnswer;
    const wasTruncated = formatted.truncationDetected;

    if (wasTruncated) {
      this.logger.warn('[Orchestrator] Streaming answer truncation detected', {
        confidence: formatted.truncationDetails?.confidence,
        reasons: formatted.truncationDetails?.reasons,
      });
    }

    // Build final result with all metadata
    const result: StreamingResult = {
      fullAnswer: formattedAnswer, // Use formatted version
      intent: intent.primaryIntent,
      confidence: intent.confidence,
      documentsUsed: retrievalResult.chunks.length,
      tokensUsed,
      processingTime: Date.now() - startTime,
      citations,
      wasTruncated,
    };

    // Extract unique document IDs for metadata persistence
    const sourceDocumentIds = [...new Set(retrievalResult.chunks.map(
      c => c.documentId || c.metadata?.documentId
    ).filter(Boolean))];

    // Emit single done event with full metadata including formatted answer for frontend
    yield {
      type: 'done',
      fullAnswer: formattedAnswer,
      formatted: formattedAnswer, // Explicitly include formatted version with markers
      intent: result.intent,
      confidence: result.confidence,
      documentsUsed: result.documentsUsed,
      tokensUsed: result.tokensUsed,
      processingTime: result.processingTime,
      wasTruncated,
      citations,
      sourceDocumentIds,
    } as StreamEvent;

    return result;
  }

  /**
   * Extract citations from retrieved chunks for the citation event.
   */
  private extractCitationsFromChunks(chunks: any[]): Array<{
    documentId: string;
    documentName: string;
    pageNumber?: number;
    snippet?: string;
    chunkId?: string;
  }> {
    const seen = new Set<string>();
    const citations: Array<{
      documentId: string;
      documentName: string;
      pageNumber?: number;
      snippet?: string;
      chunkId?: string;
    }> = [];

    for (const chunk of chunks.slice(0, 5)) {
      const docId = chunk.documentId || chunk.metadata?.documentId;
      if (!docId || seen.has(docId)) continue;
      seen.add(docId);

      // FIXED: Populate chunkId for precise source reference in citation/done events
      const chunkId = chunk.chunkId || chunk.metadata?.chunkId ||
        (chunk.metadata?.chunkIndex !== undefined ? `${docId}-${chunk.metadata.chunkIndex}` : undefined);

      citations.push({
        documentId: docId,
        documentName: chunk.documentName || chunk.metadata?.filename || 'Document',
        pageNumber: chunk.pageNumber || chunk.metadata?.pageNumber,
        snippet: chunk.content?.substring(0, 100),
        chunkId,
      });
    }

    return citations;
  }

  /**
   * Stream simple responses (chitchat, meta AI).
   */
  private async *streamSimpleResponse(
    request: OrchestratorRequest,
    intent: PredictedIntent,
    language: LanguageCode
  ): StreamGenerator {
    const startTime = Date.now();

    // Generate the response
    const response = await this.routeIntent(request, intent);

    // Yield the content as a single chunk (these are short responses)
    yield { type: 'content', content: response.answer } as ContentEvent;

    return {
      fullAnswer: response.answer,
      intent: intent.primaryIntent,
      confidence: intent.confidence,
      documentsUsed: 0,
      processingTime: Date.now() - startTime,
    };
  }

  /**
   * Get no results message in appropriate language.
   */
  private getNoResultsMessage(language: LanguageCode): string {
    const messages: Record<LanguageCode, string> = {
      en: "I couldn't find relevant information in your documents. Try rephrasing your question.",
      pt: "Não encontrei informações relevantes nos seus documentos. Tente reformular sua pergunta.",
      es: "No encontré información relevante en tus documentos. Intenta reformular tu pregunta.",
    };
    return messages[language] || messages.en;
  }

  /**
   * Route intent to appropriate handler
   * V4 simplified intent routing - 15 intents (9 core + 6 domain-specific)
   */
  private async routeIntent(
    request: OrchestratorRequest,
    intent: PredictedIntent
  ): Promise<IntentHandlerResponse> {

    // Pass intent object through to all handlers
    const handlerContext = {
      request,
      intent,
      language: intent.language,
    };

    switch (intent.primaryIntent) {
      // ========== CORE INTENTS ==========

      case 'documents':
        // Unified document handler (QA, analytics, search, summarize, management)
        return this.handleDocumentQnA(handlerContext);

      case 'help':
        // Product help, onboarding, feature requests
        return this.handleProductHelp(handlerContext);

      case 'conversation':
        // Chitchat, feedback, greetings
        return this.handleChitchat(handlerContext);

      case 'edit':
        // Answer rewrite/expand/simplify, text transforms
        return this.handleAnswerRewrite(handlerContext);

      case 'reasoning':
        // Math, logic, calculations, general knowledge
        return this.handleReasoningTask(handlerContext);

      case 'memory':
        // Store and recall user information
        return this.handleMemoryStore(handlerContext);

      case 'error':
        // Out of scope, ambiguous, safety, unknown
        return this.handleAmbiguous(handlerContext);

      case 'preferences':
        // User settings, language, tone, role
        return this.handlePreferenceUpdate(handlerContext);

      case 'extraction':
        // Data extraction, meta-AI queries
        return this.handleMetaAI(handlerContext);

      // ========== DOMAIN-SPECIFIC INTENTS ==========

      case 'excel':
        // Excel/spreadsheet specific queries
        return this.handleDocumentQnA(handlerContext);

      case 'accounting':
        // Accounting-specific document queries
        return this.handleDocumentQnA(handlerContext);

      case 'engineering':
        // Engineering-specific document queries
        return this.handleDocumentQnA(handlerContext);

      case 'finance':
        // Finance-specific document queries
        return this.handleDocumentQnA(handlerContext);

      case 'legal':
        // Legal-specific document queries
        return this.handleDocumentQnA(handlerContext);

      case 'medical':
        // Medical-specific document queries
        return this.handleDocumentQnA(handlerContext);

      default:
        return this.buildFallbackResponse(
          handlerContext,
          'UNSUPPORTED_INTENT',
          `Intent not implemented: ${intent.primaryIntent}`
        );
    }
  }

  /**
   * Route based on decision tree result (family/sub-intent)
   * This is the new decision-based routing that replaces raw intent switching
   */
  private async routeDecision(
    request: OrchestratorRequest,
    intent: PredictedIntent,
    decision: DecisionResult
  ): Promise<IntentHandlerResponse> {
    const handlerContext: HandlerContext = {
      request,
      intent,
      language: intent.language,
    };

    // Check for error decisions first
    if (isErrorDecision(decision)) {
      const fallbackKey = getFallbackScenario(decision);
      return this.buildFallbackResponse(
        handlerContext,
        fallbackKey || 'AMBIGUOUS_QUESTION'
      );
    }

    // Route by family
    switch (decision.family) {
      case 'documents':
        return this.handleDocumentsBySubIntent(handlerContext, decision);

      case 'help':
        return this.handleProductHelp(handlerContext);

      case 'edit':
        return this.handleEditBySubIntent(handlerContext, decision);

      case 'conversation':
        return this.handleChitchat(handlerContext);

      case 'reasoning':
        return this.handleReasoningTask(handlerContext);

      case 'memory':
        return this.handleMemoryStore(handlerContext);

      case 'preferences':
        return this.handlePreferenceUpdate(handlerContext);

      case 'extraction':
        return this.handleMetaAI(handlerContext);

      default:
        // Fallback to routeIntent for any unhandled cases
        return this.routeIntent(request, intent);
    }
  }

  /**
   * Handle documents family with sub-intent routing
   */
  private async handleDocumentsBySubIntent(
    context: HandlerContext,
    decision: DecisionResult
  ): Promise<IntentHandlerResponse> {
    switch (decision.subIntent) {
      case 'summary':
        return this.handleDocSummarize(context);

      case 'compare':
        // For now, route to DOC_QA with compare context
        return this.handleDocumentQnA(context);

      case 'analytics':
        return this.handleDocAnalytics(context);

      case 'extract':
        // For now, route to DOC_QA with extract context
        return this.handleDocumentQnA(context);

      case 'manage':
        return this.handleDocManagement(context);

      case 'search':
        return this.handleDocSearch(context);

      case 'factual':
      default:
        return this.handleDocumentQnA(context);
    }
  }

  /**
   * Handle edit family with sub-intent routing
   */
  private async handleEditBySubIntent(
    context: HandlerContext,
    decision: DecisionResult
  ): Promise<IntentHandlerResponse> {
    switch (decision.subIntent) {
      case 'simplify':
        return this.handleAnswerSimplify(context);

      case 'expand':
        return this.handleAnswerExpand(context);

      case 'translate':
        // For now, route to text transform
        return this.handleTextTransform(context);

      case 'format':
        // For now, route to text transform
        return this.handleTextTransform(context);

      case 'rewrite':
      default:
        return this.handleAnswerRewrite(context);
    }
  }

  // ========== HANDLER IMPLEMENTATIONS ==========

  /**
   * Handle DOC_QA: Answer questions using uploaded documents
   * FAIL-FAST: Services are guaranteed by container - no optional chains
   */
  private async handleDocumentQnA(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, intent, language } = context;

    // Pre-check: Does user have documents?
    const hasDocuments = await this.checkUserHasDocuments(request.userId);
    if (!hasDocuments) {
      return this.buildFallbackResponse(context, 'NO_DOCUMENTS');
    }

    // Convert PredictedIntent to IntentClassificationV3 for RAG services
    const adaptedIntent = adaptPredictedIntent(intent, request);

    // Retrieve documents - pass adapted intent for intent-aware boosting
    const retrievalResult = await this.retrievalEngine.retrieveWithMetadata({
      query: request.text,
      userId: request.userId,
      language,
      intent: adaptedIntent,
    });

    // Check if we got chunks
    if (!retrievalResult.chunks || retrievalResult.chunks.length === 0) {
      return this.buildFallbackResponse(context, 'NO_RELEVANT_DOCS');
    }

    // Generate answer - pass adapted intent for question-type formatting
    const answerResult = await this.answerEngine.answerWithDocs({
      userId: request.userId,
      query: request.text,
      intent: adaptedIntent,
      documents: retrievalResult.chunks,
      language,
    });

    // Convert citations from RAG format to formatting pipeline format
    const convertedCitations = answerResult.citations?.map(c => ({
      docId: c.documentId,
      docName: c.documentName,
      pageNumber: c.pageNumber,
      chunkId: c.chunkId,
      relevanceScore: c.confidence,
    })) || [];

    // Extract unique document references for marker injection
    const documentReferences = this.extractDocumentReferences(retrievalResult.chunks);

    // Format with citations and documents via formatting pipeline
    // Documents are passed to enable {{DOC::...}} marker injection
    const formatted = await this.formattingPipeline.format({
      text: answerResult.answer,
      citations: convertedCitations,
      documents: documentReferences,
      intent: intent.primaryIntent,
      language,
    });

    // Build sources array for frontend display
    const sources = this.buildSourcesFromChunks(retrievalResult.chunks);

    // Extract unique document IDs for metadata
    const sourceDocumentIds = [...new Set(retrievalResult.chunks.map(
      c => c.documentId || c.metadata?.documentId
    ).filter(Boolean))];

    return {
      answer: formatted.text || answerResult.answer,
      formatted: formatted.markdown || formatted.text || answerResult.answer,
      citations: convertedCitations,
      sources,
      metadata: {
        documentsUsed: retrievalResult.chunks.length,
        confidence: answerResult.confidenceScore,
        sourceDocumentIds,
      },
    };
  }

  /**
   * Extract document references from chunks for marker injection.
   * Returns unique documents with context type for formatting pipeline.
   */
  private extractDocumentReferences(chunks: any[]): Array<{
    id: string;
    filename: string;
    context: 'list' | 'text';
  }> {
    const seen = new Set<string>();
    const refs: Array<{ id: string; filename: string; context: 'list' | 'text' }> = [];

    for (const chunk of chunks) {
      const docId = chunk.documentId || chunk.metadata?.documentId;
      if (!docId || seen.has(docId)) continue;
      seen.add(docId);

      refs.push({
        id: docId,
        filename: chunk.documentName || chunk.metadata?.filename || 'Document',
        context: 'text', // In-text context for DOC_QA answers
      });
    }

    return refs;
  }

  /**
   * Build sources array for frontend display from chunks.
   */
  private buildSourcesFromChunks(chunks: any[]): Array<{
    documentId: string;
    documentName: string;
    pageNumber?: number;
    snippet?: string;
  }> {
    const seen = new Set<string>();
    const sources: Array<{
      documentId: string;
      documentName: string;
      pageNumber?: number;
      snippet?: string;
    }> = [];

    // Limit to top 5 unique documents
    for (const chunk of chunks.slice(0, 10)) {
      const docId = chunk.documentId || chunk.metadata?.documentId;
      if (!docId || seen.has(docId)) continue;
      seen.add(docId);

      sources.push({
        documentId: docId,
        documentName: chunk.documentName || chunk.metadata?.filename || 'Document',
        pageNumber: chunk.pageNumber || chunk.metadata?.pageNumber,
        snippet: chunk.content?.substring(0, 150),
      });

      if (sources.length >= 5) break;
    }

    return sources;
  }

  /**
   * Handle DOC_ANALYTICS: Counts, lists, statistics
   */
  private async handleDocAnalytics(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    // Use getDocumentCounts for analytics
    const counts = await this.documentSearch.getDocumentCounts(request.userId);

    const analyticsMessages: Record<LanguageCode, string> = {
      en: `You have ${counts.total} document${counts.total !== 1 ? 's' : ''}. ${counts.completed} completed, ${counts.processing} processing, ${counts.failed} failed.`,
      pt: `Você tem ${counts.total} documento${counts.total !== 1 ? 's' : ''}. ${counts.completed} completo${counts.completed !== 1 ? 's' : ''}, ${counts.processing} processando, ${counts.failed} com falha.`,
      es: `Tienes ${counts.total} documento${counts.total !== 1 ? 's' : ''}. ${counts.completed} completado${counts.completed !== 1 ? 's' : ''}, ${counts.processing} procesando, ${counts.failed} fallido${counts.failed !== 1 ? 's' : ''}.`,
    };

    const answer = analyticsMessages[language] || analyticsMessages['en'];

    return {
      answer,
      formatted: answer,
      metadata: {
        documentsUsed: counts.total,
      },
    };
  }

  /**
   * Handle DOC_MANAGEMENT: Delete, tag, move, rename
   */
  private async handleDocManagement(context: HandlerContext): Promise<IntentHandlerResponse> {
    // Not yet fully implemented - return graceful message
    return this.buildFallbackResponse(
      context,
      'UNSUPPORTED_INTENT',
      'Document management features are coming soon!'
    );
  }

  /**
   * Handle DOC_SEARCH: Search across documents
   */
  private async handleDocSearch(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    // Detect "list all" queries - empty or generic list patterns
    const listAllPatterns = /^(list|show|display|get|what are)?\s*(all|my)?\s*(docs?|documents?|files?)?\s*$/i;
    const isListAll = !request.text.trim() || listAllPatterns.test(request.text.trim());

    // First check total document count for the user
    const totalDocCount = await this.getDocumentCount(request.userId);

    // If user has no documents at all, return NO_DOCUMENTS fallback
    if (totalDocCount === 0) {
      return this.buildFallbackResponse(context, 'NO_DOCUMENTS');
    }

    // Search documents (empty query for list-all)
    const searchResult = await this.documentSearch.search({
      query: isListAll ? '' : request.text,
      userId: request.userId,
    });

    const documents = searchResult.items || [];
    const total = searchResult.total || 0;

    // No matches found for specific search - return NO_RELEVANT_DOCS fallback
    if (documents.length === 0 && !isListAll && request.text.trim()) {
      return this.buildFallbackResponse(context, 'DOC_NOT_FOUND');
    }

    // Format document listing (always use formatDocumentListing for matches)
    const formatted = await this.formattingPipeline.formatDocumentListing(
      documents.map(d => ({ id: d.documentId, filename: d.filename, fileType: d.fileType })),
      total,
      documents.length
    );

    const summaryMessages: Record<LanguageCode, string> = isListAll ? {
      en: `You have ${total} document${total !== 1 ? 's' : ''}.`,
      pt: `Você tem ${total} documento${total !== 1 ? 's' : ''}.`,
      es: `Tienes ${total} documento${total !== 1 ? 's' : ''}.`,
    } : {
      en: `Found ${total} document${total !== 1 ? 's' : ''} matching "${request.text}".`,
      pt: `Encontrado${total !== 1 ? 's' : ''} ${total} documento${total !== 1 ? 's' : ''} correspondendo a "${request.text}".`,
      es: `Encontrado${total !== 1 ? 's' : ''} ${total} documento${total !== 1 ? 's' : ''} que coinciden con "${request.text}".`,
    };

    return {
      answer: summaryMessages[language] || summaryMessages['en'],
      formatted: formatted.text,
      metadata: {
        documentsUsed: documents.length,
      },
    };
  }

  /**
   * Handle DOC_SUMMARIZE: Summarize documents
   * NOTE: Full document summarization requires document retrieval first.
   * This is handled as a DOC_QA with summarization intent.
   */
  private async handleDocSummarize(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    // Extract document reference from query
    const docRef = await this.extractDocumentReference(request.text, request.userId);

    if (!docRef) {
      return await this.buildFallbackResponse(context, 'AMBIGUOUS_QUESTION', 'Which document would you like me to summarize?');
    }

    // Route through DOC_QA with the document context
    const summaryRequest = {
      ...context,
      request: {
        ...request,
        text: `Summarize the document "${docRef.filename}"`,
        context: {
          ...request.context,
          attachedDocumentIds: [docRef.id],
        },
      },
    };

    return this.handleDocumentQnA(summaryRequest);
  }

  /**
   * Handle PREFERENCE_UPDATE: User settings, language, tone
   * NOTE: Full preference parsing not yet implemented - returns acknowledgment.
   */
  private async handlePreferenceUpdate(context: HandlerContext): Promise<IntentHandlerResponse> {
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
  }

  /**
   * Handle MEMORY_STORE: Store user context
   * NOTE: Memory is automatically stored via conversation history.
   */
  private async handleMemoryStore(context: HandlerContext): Promise<IntentHandlerResponse> {
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
  }

  /**
   * Handle MEMORY_RECALL: Recall stored information
   * Returns stored key/value pairs (e.g., "project code is X42") in concise format.
   * Does NOT dump full conversation history.
   */
  private async handleMemoryRecall(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    if (request.conversationId) {
      const conversationContext = await this.conversationMemory.getContext(request.conversationId);

      if (conversationContext && conversationContext.messages.length > 0) {
        // Search for stored memories (user messages with "remember", "store", "save" patterns)
        const memoryPatterns = /\b(remember|store|save|keep|note)\b.*\b(is|are|:)\s+(.+)/i;
        const storedMemories: string[] = [];

        for (const msg of conversationContext.messages) {
          if (msg.role === 'user') {
            const match = msg.content.match(memoryPatterns);
            if (match) {
              storedMemories.push(msg.content);
            }
          }
        }

        // If we found stored memories, return them concisely
        if (storedMemories.length > 0) {
          const lastMemory = storedMemories[storedMemories.length - 1];

          // Extract the key-value part
          const keyValueMatch = lastMemory.match(/(?:my\s+)?(\w+(?:\s+\w+)?)\s+(?:is|are|:)\s+(.+)/i);
          if (keyValueMatch) {
            const [, key, value] = keyValueMatch;
            const recallMessages: Record<LanguageCode, string> = {
              en: `Your ${key.toLowerCase()} is ${value.trim()}.`,
              pt: `Seu ${key.toLowerCase()} é ${value.trim()}.`,
              es: `Tu ${key.toLowerCase()} es ${value.trim()}.`,
            };

            const formatted = await this.formatSimple(
              recallMessages[language] || recallMessages['en'],
              'MEMORY_RECALL',
              language
            );

            return {
              answer: formatted,
              formatted,
            };
          }
        }
      }
    }

    // Concise "nothing stored" fallback
    const noMemoryMessages: Record<LanguageCode, string> = {
      en: "I don't have anything stored yet. You can tell me to remember something like 'Remember my project code is X42'.",
      pt: "Não tenho nada armazenado ainda. Você pode me dizer para lembrar algo como 'Lembre que meu código do projeto é X42'.",
      es: "No tengo nada almacenado aún. Puedes decirme que recuerde algo como 'Recuerda que mi código de proyecto es X42'.",
    };

    const formatted = await this.formatSimple(
      noMemoryMessages[language] || noMemoryMessages['en'],
      'MEMORY_RECALL',
      language
    );

    return {
      answer: formatted,
      formatted,
    };
  }

  /**
   * Handle ANSWER_REWRITE: Explain better, more details, simplify
   * NOTE: Rewrite functionality requires last answer context - not yet implemented.
   */
  private async handleAnswerRewrite(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    // Get conversation context to find last answer
    if (request.conversationId) {
      const conversationContext = await this.conversationMemory.getContext(request.conversationId);

      if (conversationContext) {
        const lastAssistant = [...conversationContext.messages]
          .reverse()
          .find(m => m.role === 'assistant');

        if (lastAssistant) {
          // For now, return acknowledgment with the original
          const messages: Record<LanguageCode, string> = {
            en: "I understand you'd like me to explain differently. Here's what I said before:\n\n" + lastAssistant.content,
            pt: "Entendo que você gostaria que eu explicasse de forma diferente. Aqui está o que eu disse antes:\n\n" + lastAssistant.content,
            es: "Entiendo que te gustaría que lo explicara de manera diferente. Esto es lo que dije antes:\n\n" + lastAssistant.content,
          };

          return {
            answer: messages[language] || messages['en'],
            formatted: messages[language] || messages['en'],
          };
        }
      }
    }

    return this.buildFallbackResponse(context, 'AMBIGUOUS_QUESTION', 'What would you like me to rewrite?');
  }

  /**
   * Handle ANSWER_EXPAND: Add more details
   * NOTE: Expansion functionality requires context - routes to DOC_QA for elaboration.
   */
  private async handleAnswerExpand(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    // Get conversation context to find what to expand
    if (request.conversationId) {
      const conversationContext = await this.conversationMemory.getContext(request.conversationId);

      if (conversationContext) {
        const lastAssistant = [...conversationContext.messages]
          .reverse()
          .find(m => m.role === 'assistant');

        if (lastAssistant) {
          // Route as follow-up question for more details
          const expandedContext = {
            ...context,
            request: {
              ...request,
              text: `Please provide more details about: ${lastAssistant.content.substring(0, 200)}`,
            },
          };
          return this.handleDocumentQnA(expandedContext);
        }
      }
    }

    return this.buildFallbackResponse(context, 'AMBIGUOUS_QUESTION', 'What would you like me to expand on?');
  }

  /**
   * Handle ANSWER_SIMPLIFY: Make simpler
   * NOTE: Simplification requires LLM post-processing - returns acknowledgment.
   */
  private async handleAnswerSimplify(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    // Get conversation context
    if (request.conversationId) {
      const conversationContext = await this.conversationMemory.getContext(request.conversationId);

      if (conversationContext) {
        const lastAssistant = [...conversationContext.messages]
          .reverse()
          .find(m => m.role === 'assistant');

        if (lastAssistant) {
          const messages: Record<LanguageCode, string> = {
            en: "I'll try to explain more simply. The key point is: " + lastAssistant.content.substring(0, 300) + "...",
            pt: "Vou tentar explicar de forma mais simples. O ponto principal é: " + lastAssistant.content.substring(0, 300) + "...",
            es: "Intentaré explicar de forma más simple. El punto clave es: " + lastAssistant.content.substring(0, 300) + "...",
          };

          return {
            answer: messages[language] || messages['en'],
            formatted: messages[language] || messages['en'],
          };
        }
      }
    }

    return this.buildFallbackResponse(context, 'AMBIGUOUS_QUESTION', 'What would you like me to simplify?');
  }


  /**
   * Handle FEEDBACK_POSITIVE: "Perfect", "Thanks"
   */
  private async handlePositiveFeedback(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    // Log positive feedback with correct signature
    await this.feedbackLogger.logPositive(
      request.userId,
      request.conversationId || '',
      undefined,
      request.text
    );

    const responses: Record<LanguageCode, string> = {
      en: "Glad I could help!",
      pt: "Fico feliz em ajudar!",
      es: "¡Me alegra poder ayudar!",
    };

    return {
      answer: responses[language] || responses['en'],
      formatted: responses[language] || responses['en'],
    };
  }

  /**
   * Handle FEEDBACK_NEGATIVE: "Wrong", "Not in the file"
   */
  private async handleNegativeFeedback(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    // Log negative feedback with correct signature
    await this.feedbackLogger.logNegative(
      request.userId,
      request.conversationId || '',
      undefined,
      request.text
    );

    const responses: Record<LanguageCode, string> = {
      en: "I apologize for the error. Could you tell me what was wrong, or paste the correct passage from the file?",
      pt: "Peço desculpas pelo erro. Você poderia me dizer o que estava errado ou colar a passagem correta do arquivo?",
      es: "Disculpa por el error. ¿Podrías decirme qué estaba mal o pegar el pasaje correcto del archivo?",
    };

    return {
      answer: responses[language] || responses['en'],
      formatted: responses[language] || responses['en'],
      requiresFollowup: true,
    };
  }

  /**
   * Handle PRODUCT_HELP: How to use Koda
   * CRITICAL: This was missing in previous orchestrator!
   */
  private async handleProductHelp(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    const helpResult = await this.productHelp.getHelp({
      query: request.text,
      language,
    });

    return {
      answer: helpResult.text,
      formatted: helpResult.text,
      suggestedActions: helpResult.relatedTopics,
    };
  }

  /**
   * Handle ONBOARDING_HELP: Getting started
   */
  private async handleOnboardingHelp(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { language } = context;

    const onboardingMessages: Record<LanguageCode, string> = {
      en: "Welcome to Koda! Here's how to get started:\n\n1. Upload your documents\n2. Ask me questions about them\n3. I'll search and answer based on your files\n\nTry asking: 'What documents do I have?' or upload a file to begin!",
      pt: "Bem-vindo ao Koda! Veja como começar:\n\n1. Faça upload dos seus documentos\n2. Faça perguntas sobre eles\n3. Vou pesquisar e responder com base nos seus arquivos\n\nTente perguntar: 'Quais documentos eu tenho?' ou faça upload de um arquivo para começar!",
      es: "¡Bienvenido a Koda! Así es como empezar:\n\n1. Sube tus documentos\n2. Hazme preguntas sobre ellos\n3. Buscaré y responderé basándome en tus archivos\n\n¡Intenta preguntar: '¿Qué documentos tengo?' o sube un archivo para comenzar!",
    };

    return {
      answer: onboardingMessages[language] || onboardingMessages['en'],
      formatted: onboardingMessages[language] || onboardingMessages['en'],
    };
  }

  /**
   * Handle FEATURE_REQUEST: User requesting features
   */
  private async handleFeatureRequest(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { language } = context;

    const responses: Record<LanguageCode, string> = {
      en: "Thanks for the suggestion! I've noted your feature request. Our team reviews all feedback regularly.",
      pt: "Obrigado pela sugestão! Anotei sua solicitação de recurso. Nossa equipe revisa todos os feedbacks regularmente.",
      es: "¡Gracias por la sugerencia! He anotado tu solicitud de función. Nuestro equipo revisa todos los comentarios regularmente.",
    };

    return {
      answer: responses[language] || responses['en'],
      formatted: responses[language] || responses['en'],
    };
  }

  /**
   * Handle GENERIC_KNOWLEDGE: World facts
   * NOTE: Koda focuses on document-based answers. Generic knowledge is limited.
   */
  private async handleGenericKnowledge(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { language } = context;

    const responses: Record<LanguageCode, string> = {
      en: "I specialize in helping you with your documents. For general knowledge questions, I recommend using a general-purpose search engine. If you have documents about this topic, feel free to upload them and ask me!",
      pt: "Eu me especializo em ajudá-lo com seus documentos. Para perguntas de conhecimento geral, recomendo usar um mecanismo de busca geral. Se você tiver documentos sobre este tópico, fique à vontade para enviá-los e me perguntar!",
      es: "Me especializo en ayudarte con tus documentos. Para preguntas de conocimiento general, recomiendo usar un motor de búsqueda general. Si tienes documentos sobre este tema, ¡no dudes en subirlos y preguntarme!",
    };

    return {
      answer: responses[language] || responses['en'],
      formatted: responses[language] || responses['en'],
    };
  }

  /**
   * Handle REASONING_TASK: Math, logic
   * NOTE: Koda focuses on document Q&A. Complex reasoning is limited.
   */
  private async handleReasoningTask(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { language } = context;

    const responses: Record<LanguageCode, string> = {
      en: "I'm optimized for answering questions about your documents rather than general reasoning tasks. If you have documents containing calculations or data you'd like me to analyze, please upload them!",
      pt: "Sou otimizado para responder perguntas sobre seus documentos, em vez de tarefas de raciocínio geral. Se você tiver documentos contendo cálculos ou dados que gostaria que eu analisasse, por favor envie-os!",
      es: "Estoy optimizado para responder preguntas sobre tus documentos en lugar de tareas de razonamiento general. Si tienes documentos con cálculos o datos que te gustaría que analice, ¡por favor súbelos!",
    };

    return {
      answer: responses[language] || responses['en'],
      formatted: responses[language] || responses['en'],
    };
  }

  /**
   * Handle TEXT_TRANSFORM: Translate, summarize, rewrite
   * NOTE: Text transformation of user-provided text is limited.
   */
  private async handleTextTransform(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { language } = context;

    const responses: Record<LanguageCode, string> = {
      en: "I'm best at finding and summarizing information from your uploaded documents. For text transformation tasks, please upload a document and I can help extract or summarize specific parts.",
      pt: "Sou melhor em encontrar e resumir informações de seus documentos enviados. Para tarefas de transformação de texto, por favor envie um documento e posso ajudar a extrair ou resumir partes específicas.",
      es: "Soy mejor encontrando y resumiendo información de tus documentos subidos. Para tareas de transformación de texto, por favor sube un documento y puedo ayudar a extraer o resumir partes específicas.",
    };

    return {
      answer: responses[language] || responses['en'],
      formatted: responses[language] || responses['en'],
    };
  }

  /**
   * Handle CHITCHAT: Greetings, small talk
   */
  private async handleChitchat(context: HandlerContext): Promise<IntentHandlerResponse> {
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
  }

  /**
   * Handle META_AI: About the AI
   */
  private async handleMetaAI(context: HandlerContext): Promise<IntentHandlerResponse> {
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
  }

  /**
   * Handle OUT_OF_SCOPE: Harmful/illegal requests
   */
  private async handleOutOfScope(context: HandlerContext): Promise<IntentHandlerResponse> {
    return await this.buildFallbackResponse(context, 'OUT_OF_SCOPE');
  }

  /**
   * Handle AMBIGUOUS: Too vague
   */
  private async handleAmbiguous(context: HandlerContext): Promise<IntentHandlerResponse> {
    return await this.buildFallbackResponse(context, 'AMBIGUOUS_QUESTION');
  }

  /**
   * Handle SAFETY_CONCERN: Safety-related content
   */
  private async handleSafetyConcern(context: HandlerContext): Promise<IntentHandlerResponse> {
    return this.buildFallbackResponse(context, 'OUT_OF_SCOPE');
  }

  /**
   * Handle MULTI_INTENT: Multiple intents detected
   */
  private async handleMultiIntent(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { intent } = context;

    // Route to primary intent for now
    // In future, could handle multiple intents sequentially
    if (intent.secondaryIntents && intent.secondaryIntents.length > 0) {
      this.logger.info(
        `[Orchestrator] Multi-intent detected, routing to primary: ${intent.primaryIntent}`
      );
    }

    // Re-route to primary intent handler
    return this.routeIntent(context.request, intent);
  }

  // ========== HELPER METHODS ==========

  /**
   * Build fallback response using FallbackConfigService
   */
  private buildFallbackResponse(
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
  }

  /**
   * Build error response
   */
  private buildErrorResponse(request: OrchestratorRequest, error: any): IntentHandlerResponse {
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
  }

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
   * Get the last assistant message from conversation context.
   * Used for repetition detection to prevent identical/near-identical answers.
   */
  private async getLastAssistantAnswer(conversationId?: string): Promise<string | undefined> {
    if (!conversationId) return undefined;

    try {
      const context = await this.conversationMemory.getContext(conversationId);
      if (!context || !context.messages || context.messages.length === 0) {
        return undefined;
      }

      const lastAssistant = [...context.messages]
        .reverse()
        .find(m => m.role === 'assistant');

      return lastAssistant?.content;
    } catch (err) {
      this.logger.warn('[Orchestrator] Error getting last assistant answer:', err);
      return undefined;
    }
  }

  /**
   * Apply formatting and validation to a response.
   * Returns formatted fallback if validation fails with error severity.
   * Includes repetition detection to prevent identical answers.
   */
  private async applyFormatAndValidate(
    response: IntentHandlerResponse,
    intent: string,
    language: LanguageCode,
    skipFormat: boolean = false,
    previousAnswer?: string
  ): Promise<IntentHandlerResponse> {
    let formattedText = response.formatted || response.answer;
    if (!skipFormat && formattedText) {
      formattedText = await this.formatSimple(formattedText, intent, language);
    }

    const validationResult = this.validationService.validate({
      answer: {
        text: formattedText,
        citations: response.citations as any,
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
        } as any,
      };
    }

    // REPETITION CHECK: Prevent identical/near-identical answers
    if (previousAnswer && formattedText) {
      const repetitionCheck = this.validationService.checkRepetition(
        formattedText,
        previousAnswer,
        language
      );

      if (repetitionCheck.isRepetition && repetitionCheck.shortConfirmation) {
        this.logger.info(`[Orchestrator] Repetition detected (similarity: ${repetitionCheck.similarity.toFixed(2)}), returning short confirmation`);
        return {
          answer: repetitionCheck.shortConfirmation,
          formatted: repetitionCheck.shortConfirmation,
          metadata: {
            ...response.metadata,
            wasRepetition: true,
            repetitionSimilarity: repetitionCheck.similarity,
          } as any,
        };
      }
    }

    return {
      ...response,
      answer: formattedText,
      formatted: formattedText,
      metadata: {
        ...response.metadata,
        validationPassed: validationResult.passed,
        validationSeverity: validationResult.severity,
      } as any,
    };
  }

  /**
   * Get validation policy key based on intent.
   * V4 simplified intent mapping
   */
  private getValidationPolicyKey(intent: string): string {
    switch (intent) {
      // Core document intent
      case 'documents':
        return 'documents.factual';
      // Domain-specific document intents
      case 'excel':
      case 'accounting':
      case 'engineering':
      case 'finance':
      case 'legal':
      case 'medical':
        return 'documents.factual';
      // Help intent (covers product help, onboarding, feature requests)
      case 'help':
        return 'product.help';
      // Conversation intent (chitchat, feedback)
      case 'conversation':
        return 'chitchat';
      // Extraction/meta-AI
      case 'extraction':
        return 'chitchat';
      // Reasoning (math, logic)
      case 'reasoning':
        return 'documents.factual';
      default:
        return 'default';
    }
  }


  /**
   * Check if user has documents
   */
  private async checkUserHasDocuments(userId: string): Promise<boolean> {
    const docCount = await prisma.document.count({
      where: {
        userId: userId,
        status: 'completed',
      },
    });
    return docCount > 0;
  }

  /**
   * Extract document reference from text
   */
  private async extractDocumentReference(text: string, userId: string): Promise<any> {
    // A simple implementation: look for a document name in double quotes
    const match = text.match(/"(.*?)"/);
    if (!match) {
      return null;
    }

    const docName = match[1];
    if (!docName) {
      return null;
    }

    // Find a document for the user that matches the extracted name
    const document = await prisma.document.findFirst({
      where: {
        userId,
        filename: {
          contains: docName,
          mode: 'insensitive',
        },
        status: 'completed',
      },
    });

    return document;
  }
}

// NOTE: Do NOT export singleton instance here!
// Controllers MUST get the orchestrator from bootstrap/container.ts
// This ensures proper dependency injection and fail-fast on missing services.

export default KodaOrchestratorV3;
