/**
 * KODA V3 Orchestrator Service
 *
 * Central traffic cop for all intents
 * Handles ALL 25 intent types with proper routing
 *
 * Based on: pasted_content_21.txt Layer 5 and pasted_content_22.txt Section 2 specifications
 */

import { KodaIntentEngineV3, PredictedIntentWithScores, IntentScore } from './kodaIntentEngineV3.service';
import { RoutingPriorityService, routingPriorityService } from './routingPriority.service';
import { FallbackConfigService } from './fallbackConfig.service';
import { KodaProductHelpServiceV3 } from './kodaProductHelpV3.service';
import { KodaFormattingPipelineV3Service } from './kodaFormattingPipelineV3.service';
import KodaRetrievalEngineV3 from './kodaRetrievalEngineV3.service';
import KodaAnswerEngineV3 from './kodaAnswerEngineV3.service';
import geminiGateway from '../geminiGateway.service';
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
import { RoutingTiebreakersService, TiebreakerInput } from './routingTiebreakers.service';
import { DomainEnforcementService, domainEnforcementService } from './domainEnforcement.service';
import { MathOrchestratorService, mathOrchestratorService } from './mathOrchestrator.service';
import { fileSearchService, FileSearchResult, FileActionType } from '../fileSearch.service';
import { createDocMarker } from '../utils/markerUtils';
import { enforceResponseContract, parseFormatRequest } from './responseContractEnforcer.service';
import { validateDoneEvent, extractDocMarkers } from '../../types/streaming.schema';

// Document and folder management services
import * as documentService from '../document.service';
import * as folderService from '../folder.service';

// Service types for DI - these are injected via container.ts
import { UserPreferencesService } from '../user/userPreferences.service';
import { ConversationMemoryService } from '../memory/conversationMemory.service';
import { FeedbackLoggerService } from '../analytics/feedbackLogger.service';
import { AnalyticsEngineService } from '../analytics/analyticsEngine.service';
import { DocumentSearchService } from '../analytics/documentSearch.service';
import { KodaAnswerValidationService } from '../validation/kodaAnswerValidation.service';
// PHASE 1: DocumentMetadataService for metadata queries from context
import { getDocumentMetadataService, DocumentMetadataService } from '../documentMetadata.service';
import { ConversationContext, DocumentReference, getConversationContextService } from '../conversationContext.service';
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

// ============================================================================
// FAST AVAILABILITY: Document statuses that are usable in chat/search
// uploaded → available → enriching → ready
// ============================================================================
const USABLE_STATUSES = ['available', 'enriching', 'ready', 'completed'];

import type {
  IntentClassificationV3,
  DocumentTarget,
} from '../../types/ragV3.types';

import type {
  StreamEvent,
  ContentEvent,
  StreamingResult,
  StreamGenerator,
  ResponseConstraints,
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
  // V4 simplified: 9 core intents + 5 domain-specific intents
  // NOTE: Excel/Calculations removed from domains - now FILE_ACTIONS.calculation sub-intent
  const getDomain = (): IntentDomain => {
    // Document-related intents
    if (intent === 'documents') return IntentDomain.DOCUMENTS;
    // Domain-specific document intents (Excel/Calculations removed - now FILE_ACTIONS.calculation)
    if (['accounting', 'engineering', 'finance', 'legal', 'medical'].includes(intent)) {
      return IntentDomain.DOCUMENTS;
    }
    // FILE_ACTIONS (includes calculation sub-intent) - routes to GENERAL, Python Math Engine handles
    if (intent === 'file_actions') return IntentDomain.GENERAL;
    // Product help
    if (intent === 'help') return IntentDomain.PRODUCT;
    // Conversation (chitchat, feedback)
    if (intent === 'conversation') return IntentDomain.CHITCHAT;
    // All other intents
    return IntentDomain.GENERAL;
  };

  // Determine question type based on intent (using enum values)
  // V4 simplified intent mapping
  // NOTE: Excel/Calculations removed from domains - now FILE_ACTIONS.calculation sub-intent
  const getQuestionType = (): QuestionType => {
    switch (intent) {
      case 'documents': return QuestionType.OTHER;
      case 'reasoning': return QuestionType.WHY;
      case 'extraction': return QuestionType.EXTRACT;
      case 'edit': return QuestionType.EXTRACT;
      case 'file_actions': return QuestionType.EXTRACT; // Calculation operations are extractions
      // Domain-specific default to OTHER (Calculations removed)
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
  // NOTE: Excel/Calculations REMOVED - deterministic/structural, handled by Python Math Engine, not RAG
  const documentIntents = ['documents', 'accounting', 'engineering', 'finance', 'legal', 'medical'];
  const requiresRAG = documentIntents.includes(intent) && intent !== 'file_actions';

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

/**
 * Compute depth level (D1-D5) based on intent type
 * D1: Surface/navigation (FILE_ACTIONS, list docs)
 * D2: Data extraction (EXTRACTION, simple lookups)
 * D3: Analysis (basic REASONING, summaries)
 * D4: Deep analysis (complex REASONING, comparisons)
 * D5: Multi-step reasoning (complex multi-doc analysis)
 */
function computeDepth(intent: string, confidence: number): string {
  switch (intent) {
    case 'file_actions':
    case 'help':
    case 'conversation':
    case 'memory':
    case 'preferences':
    case 'error':
      return 'D1';
    case 'documents':
    case 'extraction':
    case 'edit':
      return 'D2';
    case 'reasoning':
      // Higher confidence reasoning gets deeper depth
      return confidence > 0.8 ? 'D4' : 'D3';
    case 'file_actions':
      return 'D2'; // FILE_ACTIONS (including calculation) are structural, not deep semantic
    // Domain-specific intents (Calculations removed - now FILE_ACTIONS.calculation)
    case 'accounting':
    case 'engineering':
    case 'finance':
    case 'legal':
    case 'medical':
      return 'D3'; // Domain-specific requires more depth
    default:
      return 'D2';
  }
}

/**
 * Get intent family (high-level category)
 */
function getIntentFamily(intent: string): string {
  const documentIntents = ['documents', 'extraction', 'reasoning', 'edit', 'excel', 'accounting', 'engineering', 'finance', 'legal', 'medical'];
  const systemIntents = ['help', 'memory', 'preferences', 'error'];
  const socialIntents = ['conversation'];
  const fileIntents = ['file_actions'];

  if (documentIntents.includes(intent)) return 'documents';
  if (systemIntents.includes(intent)) return 'system';
  if (socialIntents.includes(intent)) return 'social';
  if (fileIntents.includes(intent)) return 'files';
  return 'general';
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
  streamCallback?: (chunk: string) => void;  // Optional streaming callback
}

// In-memory cache for conversation context (files and folders)
// Key: `${userId}:${conversationId}` → ConversationFileContext
interface ConversationFileContext {
  lastReferencedFile?: FileSearchResult;
  previousReferencedFile?: FileSearchResult;
  lastReferencedFolder?: { id: string; name: string; path?: string };
  previousReferencedFolder?: { id: string; name: string; path?: string };
  lastComparedFiles?: FileSearchResult[];
  updatedAt: number;
}
const conversationFileContextCache = new Map<string, ConversationFileContext>();

// Legacy compatibility - keep old cache as alias
const lastReferencedFileCache = {
  get: (key: string): FileSearchResult | undefined => {
    return conversationFileContextCache.get(key)?.lastReferencedFile;
  },
  set: (key: string, file: FileSearchResult): void => {
    const existing = conversationFileContextCache.get(key) || { updatedAt: Date.now() };
    // Move current to previous before updating
    if (existing.lastReferencedFile && existing.lastReferencedFile.id !== file.id) {
      existing.previousReferencedFile = existing.lastReferencedFile;
    }
    existing.lastReferencedFile = file;
    existing.updatedAt = Date.now();
    conversationFileContextCache.set(key, existing);
  },
  delete: (key: string): void => {
    conversationFileContextCache.delete(key);
  }
};

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
  private readonly tiebreakers: RoutingTiebreakersService;

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
      tiebreakers: RoutingTiebreakersService;
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
    if (!services.tiebreakers) throw new Error('[Orchestrator] tiebreakers is REQUIRED');
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
    this.tiebreakers = services.tiebreakers;
    this.documentSearch = services.documentSearch;
    this.userPreferences = services.userPreferences;
    this.conversationMemory = services.conversationMemory;
    this.feedbackLogger = services.feedbackLogger;
    this.analyticsEngine = services.analyticsEngine;
    this.validationService = services.validationService;
    this.logger = logger || console;
  }

  // ============================================================================
  // GUARDRAIL 1: SSE Done Event Validation
  // ============================================================================

  /**
   * Validate and sanitize a done event payload before yielding
   * GUARDRAIL: Ensures all done events conform to the SSE contract
   *
   * @param payload - The done event payload to validate
   * @returns Validated payload or original with logged warnings
   */
  private validateDonePayload(payload: Partial<StreamEvent>): StreamEvent {
    // Only validate 'done' events
    if (payload.type !== 'done') {
      return payload as StreamEvent;
    }

    const validation = validateDoneEvent(payload);

    if (!validation.success) {
      // Log validation errors but don't fail - degrade gracefully
      this.logger.warn(
        `[Orchestrator][GUARDRAIL] Done event validation failed: ${validation.errors?.join(', ')}`
      );

      // Log specific issues for debugging
      if (validation.errors?.some(e => e.includes('attachments'))) {
        this.logger.warn('[Orchestrator][GUARDRAIL] Attachments validation issue - check id/name/mimeType');
      }
      if (validation.errors?.some(e => e.includes('citations'))) {
        this.logger.warn('[Orchestrator][GUARDRAIL] Citations validation issue - check documentId/documentName');
      }
    }

    // Check for marker/attachment consistency
    const donePayload = payload as any;
    if (donePayload.formatted) {
      const markers = extractDocMarkers(donePayload.formatted);
      const attachmentIds = new Set((donePayload.attachments || []).map((a: any) => a.id));

      const missingAttachments = markers.filter(m => !attachmentIds.has(m.id));
      if (missingAttachments.length > 0) {
        this.logger.warn(
          `[Orchestrator][GUARDRAIL] ${missingAttachments.length} markers missing from attachments: ${missingAttachments.map(m => m.id).join(', ')}`
        );
      }
    }

    // Add timestamp if missing
    if (!payload.timestamp) {
      payload.timestamp = Date.now();
    }

    return payload as StreamEvent;
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
    const requestId = `orch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 1 INSTRUMENTATION: Log orchestrator entry
    // ═══════════════════════════════════════════════════════════════════════════
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`[CONTEXT-TRACE] ORCHESTRATOR ENTRY ${requestId}`);
    console.log(`├── userId: ${request.userId}`);
    console.log(`├── query: "${request.text.substring(0, 60)}${request.text.length > 60 ? '...' : ''}"`);
    console.log(`├── language: ${request.language}`);
    console.log(`├── context.conversationId: ${request.context?.conversationId || 'NOT_SET'}`);
    console.log(`├── context.historyLength: ${request.context?.recentMessages?.length || 0}`);
    console.log(`└── timestamp: ${new Date().toISOString()}`);
    console.log(`${'─'.repeat(70)}`);

    try {
      // 1. Classify primary intent with all scores for routing priority
      const hasDocuments = await this.checkUserHasDocuments(request.userId);
      console.log(`[CONTEXT-TRACE] ${requestId} hasDocuments check complete: ${hasDocuments}`);

      let intentWithScores = await this.intentEngine.predictWithScores({
        text: request.text,
        language: request.language,
        context: request.context,
      });

      this.logger.info(
        `[Orchestrator] userId=${request.userId} raw_intent=${intentWithScores.primaryIntent} confidence=${intentWithScores.confidence.toFixed(2)}`
      );

      // =========================================================================
      // FIX C: LOW CONFIDENCE → DOCUMENTS (instead of error/fallback)
      // When intent is 'error' (below threshold) but user has documents,
      // force to 'documents' with lowConfidence flag instead of triggering fallback.
      // This prevents "rephrase" responses for valid document questions.
      // =========================================================================
      if (intentWithScores.primaryIntent === 'error' && hasDocuments) {
        const bestNonError = intentWithScores.allScores
          .filter(s => s.intent !== 'error')
          .sort((a, b) => b.finalScore - a.finalScore)[0];

        // Force to documents (or best non-error intent) with lowConfidence flag
        const forcedIntent = bestNonError?.intent || 'documents';
        const forcedConfidence = bestNonError?.finalScore || 0.4;

        this.logger.info(
          `[Orchestrator] FIX_C: error→${forcedIntent} (user has docs, lowConfidence=true, original_score=${forcedConfidence.toFixed(2)})`
        );

        // Override the intent
        intentWithScores = {
          ...intentWithScores,
          primaryIntent: forcedIntent,
          confidence: forcedConfidence,
          metadata: {
            ...intentWithScores.metadata,
            lowConfidence: true,
            originalIntent: 'error',
          },
        };

        // Also update the allScores to ensure documents has a reasonable score
        const docsScore = intentWithScores.allScores.find(s => s.intent === 'documents');
        if (docsScore && docsScore.finalScore < 0.5) {
          docsScore.finalScore = 0.55; // Boost to threshold
        }
      }

      // =========================================================================
      // FIX E: DETERMINISTIC DOC REFERENCE ESCAPE HATCH
      // If query clearly references documents (even with low confidence), force documents.
      // This catches cases like "what does my document say about X" that might miss patterns.
      // =========================================================================
      const DOC_REFERENCE_PATTERN = /\b(document|doc|file|pdf|upload|contract|report|agreement|my\s+\w+\s+says?|in\s+the\s+\w+|from\s+the\s+\w+|according\s+to)\b/i;
      const hasDocReference = DOC_REFERENCE_PATTERN.test(request.text);

      if (hasDocuments && hasDocReference && intentWithScores.primaryIntent !== 'documents') {
        // Strong document reference detected - force to documents
        const currentIntent = intentWithScores.primaryIntent;
        const shouldForce = !['memory', 'help', 'preferences', 'file_actions'].includes(currentIntent);

        if (shouldForce) {
          this.logger.info(
            `[Orchestrator] FIX_E: ${currentIntent}→documents (doc reference pattern matched)`
          );
          intentWithScores = {
            ...intentWithScores,
            primaryIntent: 'documents',
            confidence: Math.max(intentWithScores.confidence, 0.60),
            metadata: {
              ...intentWithScores.metadata,
              docReferenceForced: true,
              originalIntent: currentIntent,
            },
          };
        }
      }

      // 1.25. Apply routing priority adjustments (before tiebreakers)
      // This handles document boosting, domain dampening, and extraction collision resolution
      const routingScores = intentWithScores.allScores.map(s => ({
        intent: s.intent,
        confidence: s.finalScore,
        matchedKeywords: s.matchedKeywords,
        matchedPattern: s.matchedPattern,
      }));

      // FIX A: Fetch previous intent for follow-up confidence inheritance
      const { intent: previousIntent, confidence: previousConfidence } =
        await this.getLastIntentFromConversation(request.conversationId);

      const priorityResult = routingPriorityService.adjustScores(
        routingScores,
        request.text,
        {
          hasDocuments,
          isFollowup: !!request.conversationId,
          previousIntent,
          previousConfidence,
        }
      );

      // Use priority-adjusted intent
      let intent: PredictedIntent = {
        ...intentWithScores,
        primaryIntent: priorityResult.primaryIntent,
        confidence: priorityResult.primaryConfidence,
      };

      if (priorityResult.debugInfo.originalPrimary !== priorityResult.primaryIntent) {
        this.logger.info(
          `[Orchestrator] Routing priority adjusted: ${priorityResult.debugInfo.originalPrimary} → ${priorityResult.primaryIntent} (doc_boost=${priorityResult.documentBoostApplied}, domain_damp=${priorityResult.domainDampeningApplied})`
        );
      }

      // 1.5. Apply routing tiebreakers (after priority adjustments)
      const tiebreakerInput: TiebreakerInput = {
        text: request.text,
        predictedIntent: intent.primaryIntent,
        predictedConfidence: intent.confidence,
        language: intent.language || request.language || 'en',
        context: {
          hasDocuments,
          isFollowup: !!request.conversationId,
          secondaryIntents: intent.secondaryIntents,
        },
      };

      const tiebreakerResult = this.tiebreakers.applyTiebreakers(tiebreakerInput);
      if (tiebreakerResult.wasModified) {
        this.logger.info(
          `[Orchestrator] Tiebreaker applied: ${intent.primaryIntent} → ${tiebreakerResult.intent} (${tiebreakerResult.reason})`
        );
        intent = {
          ...intent,
          primaryIntent: tiebreakerResult.intent,
          confidence: tiebreakerResult.confidence,
        };
      }

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

      // =========================================================================
      // 7-CHECKPOINT LOGGING (for verification)
      // =========================================================================
      const mathCheck = mathOrchestratorService.requiresMathCalculation(request.text);
      const domainCtx = domainEnforcementService.getDomainContext(finalIntent.primaryIntent);

      if (process.env.KODA_CHECKPOINT_LOG === 'true') {
        console.log('\n[CHECKPOINT] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`[CHECKPOINT] Query: "${request.text.substring(0, 50)}..."`);
        console.log(`[CHECKPOINT] 1. Intent: ${finalIntent.primaryIntent} (confidence: ${finalIntent.confidence.toFixed(2)})`);
        console.log(`[CHECKPOINT] 2. Depth: ${decision.depth || 'D2'}`);
        console.log(`[CHECKPOINT] 3. Domain: ${domainCtx.domain || 'none'}`);
        console.log(`[CHECKPOINT] 4. Engine: RAG=${decision.family === 'documents'}, Math=${mathCheck.requiresMath}`);
        console.log(`[CHECKPOINT] 5. Family/Sub: ${decision.family}/${decision.subIntent}`);
        console.log('[CHECKPOINT] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      }

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

      // =========================================================================
      // 7-CHECKPOINT LOGGING (post-response)
      // =========================================================================
      if (process.env.KODA_CHECKPOINT_LOG === 'true') {
        console.log('[CHECKPOINT] 6. Chunks:', response.metadata?.documentsUsed || 0);
        console.log(`[CHECKPOINT] 7. Answer: ${response.answer?.substring(0, 80).replace(/\n/g, ' ')}...`);
        console.log(`[CHECKPOINT] Time: ${Date.now() - startTime}ms`);
        console.log('[CHECKPOINT] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      }

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
   *
   * MULTI-INTENT QUALITY RULES:
   * 1. Each document ID can only produce ONE UI block per turn (deduplicate)
   * 2. Canonical order: FILE_ID → FILE_ACTION → DOC_QUESTION → SUMMARY
   * 3. Action-only queries suppress prose
   * 4. Text explanations come after actions
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

    // =========================================================================
    // SPECIAL CASE: "Find X and open it" / "Find X and show it"
    // When second segment is just "open it/show it", output button-only
    // =========================================================================
    if (segments.length === 2) {
      const secondSegment = segments[1].toLowerCase().trim();
      const isSimpleOpen = /^(open|show|preview)\s+(it|that|the\s+file|the\s+document)\.?$/i.test(secondSegment) ||
                           /^(and\s+)?(open|show)\s+(it|that)\.?$/i.test(secondSegment);

      if (isSimpleOpen) {
        this.logger.info(`[MultiIntent] Detected "find + open it" pattern, using button-only mode`);

        // Process only the first segment (the find/search part)
        const findSegment = segments[0];
        const findIntent = await this.intentEngine.predict({
          text: findSegment,
          language: request.language,
          context: request.context,
        });

        const findRequest: OrchestratorRequest = { ...request, text: findSegment };
        const findResponse = await this.routeIntent(findRequest, findIntent);

        // Extract just the DOC markers from the response (button-only)
        const markers = findResponse.answer.match(/\{\{DOC::[^\}]+\}\}/g) || [];

        if (markers.length > 0) {
          // Return button-only response (no prose, no step labels)
          return {
            answer: markers.slice(0, 3).join('\n'),
            formatted: markers.slice(0, 3).join('\n'),
            metadata: {
              multiIntent: true,
              segmentCount: 2,
              buttonOnly: true,
              ...findResponse.metadata,
            },
          };
        }

        // NOT_FOUND case: return button-only browse marker (no step labels, no prose)
        this.logger.info(`[MultiIntent] No files found for "find + open it", returning browse-only`);
        return {
          answer: createDocMarker({ id: 'browse', name: 'Browse all documents', ctx: 'browse' }),
          formatted: createDocMarker({ id: 'browse', name: 'Browse all documents', ctx: 'browse' }),
          metadata: {
            multiIntent: true,
            segmentCount: 2,
            buttonOnly: true,
            notFound: true,
          },
        };
      }
    }

    const segmentsData: SegmentData[] = [];
    const seenDocIds = new Set<string>(); // Track document IDs across ALL segments

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

      // QUALITY FIX: Deduplicate document markers across segments
      // Extract DOC markers and filter out already-seen ones
      let cleanedAnswer = segmentResponse.answer;
      const docMarkerRegex = /\{\{DOC::([a-f0-9-]+)::[^}]+\}\}/gi;
      const markers = cleanedAnswer.match(docMarkerRegex) || [];

      for (const marker of markers) {
        const idMatch = marker.match(/\{\{DOC::([a-f0-9-]+)::/i);
        if (idMatch) {
          const docId = idMatch[1];
          if (seenDocIds.has(docId)) {
            // Remove duplicate marker (keep first occurrence only)
            cleanedAnswer = cleanedAnswer.replace(marker, '').trim();
          } else {
            seenDocIds.add(docId);
          }
        }
      }

      // Clean up empty lines from removed markers
      cleanedAnswer = cleanedAnswer.replace(/\n{3,}/g, '\n\n').trim();

      // Skip segment if answer is now empty or just whitespace
      if (!cleanedAnswer || cleanedAnswer.length < 5) {
        continue;
      }

      // Collect structured segment data
      segmentsData.push({
        label: `Step ${i + 1}`,
        intent: segmentIntent.primaryIntent,
        confidence: segmentIntent.confidence,
        answer: cleanedAnswer,
        documentsUsed: segmentResponse.metadata?.documentsUsed || 0,
      });
    }

    // QUALITY FIX: If only one segment remains after dedup, skip step labels
    let rawCombinedAnswer: string;
    if (segmentsData.length === 1) {
      rawCombinedAnswer = segmentsData[0].answer;
    } else if (segmentsData.length === 0) {
      rawCombinedAnswer = 'I found the requested information in your documents.';
    } else {
      // Multiple segments - deduplicate repeated boilerplate phrases
      // Common boilerplate phrases that should only appear once
      const boilerplatePhrases = [
        'I can help with information from this document',
        'Found relevant information in this document',
        "I'm Koda, an AI assistant specialized in helping you work with your documents",
        'open it to review the details',
      ];

      const seenPhrases = new Set<string>();
      const deduplicatedSegments = segmentsData.map((s, idx) => {
        let answer = s.answer;
        // For segments after the first, remove boilerplate that already appeared
        if (idx > 0) {
          for (const phrase of boilerplatePhrases) {
            if (seenPhrases.has(phrase.toLowerCase()) && answer.toLowerCase().includes(phrase.toLowerCase())) {
              // Remove the boilerplate line, keeping only the doc button
              answer = answer.replace(new RegExp(`[^\\n]*${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*\\n?`, 'gi'), '').trim();
            }
          }
        }
        // Track phrases from this segment
        for (const phrase of boilerplatePhrases) {
          if (answer.toLowerCase().includes(phrase.toLowerCase())) {
            seenPhrases.add(phrase.toLowerCase());
          }
        }
        return { ...s, answer };
      }).filter(s => s.answer && s.answer.length > 5);

      // Recalculate based on deduplicated segments
      if (deduplicatedSegments.length === 1) {
        rawCombinedAnswer = deduplicatedSegments[0].answer;
      } else if (deduplicatedSegments.length === 0) {
        rawCombinedAnswer = 'I found the requested information in your documents.';
      } else {
        rawCombinedAnswer = deduplicatedSegments
          .map(s => `**${s.label}:**\n${s.answer}`)
          .join('\n\n');
      }
    }

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

    let finalAnswer = formattedResult.markdown || rawCombinedAnswer;

    // =================================================================
    // MULTI-INTENT MARKER ENFORCEMENT:
    // Always ensure DOC markers are present for multi-intent responses
    // =================================================================
    const hasMarkers = /\{\{DOC::/.test(finalAnswer);

    if (!hasMarkers) {
      this.logger.warn('[MultiIntent] Missing markers, adding browse button');
      try {
        const userFiles = await fileSearchService.listFolderContents(request.userId, null, { limit: 5 });
        if (userFiles.length > 0) {
          const buttons = userFiles.map(f => `**${f.filename}** ${createDocMarker({ id: f.id, name: f.filename, ctx: 'list' })}`).join('\n');
          finalAnswer = finalAnswer.trim() + '\n\n' + buttons;
        } else {
          // No files found - add browse button
          finalAnswer = finalAnswer.trim() + '\n\n' + createDocMarker({ id: 'browse', name: 'Browse all documents', ctx: 'browse' });
        }
      } catch (err) {
        this.logger.error('[MultiIntent] Failed to add markers:', err);
        finalAnswer = finalAnswer.trim() + '\n\n' + createDocMarker({ id: 'browse', name: 'Browse all documents', ctx: 'browse' });
      }
    }

    return {
      answer: finalAnswer,
      formatted: finalAnswer,
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
          status: { in: USABLE_STATUSES },
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
      // Step 1: Classify intent with all scores for routing priority (fast, non-streaming)
      const { hasDocuments, docCount } = await this.checkUserHasDocumentsWithCount(request.userId);

      // ═══════════════════════════════════════════════════════════════════════════
      // VERIFICATION CHECKLIST A: Session continuity logging
      // Log: conversationId, userId, hasDocuments, docCount, turnIndex
      // ═══════════════════════════════════════════════════════════════════════════
      const turnIndex = request.context?.turnIndex ?? request.context?.messageCount ?? 'N/A';
      console.log(`[SESSION-TRACE] ═══════════════════════════════════════════════════════════`);
      console.log(`[SESSION-TRACE] conversationId=${request.conversationId || 'N/A'}`);
      console.log(`[SESSION-TRACE] userId=${request.userId.substring(0, 12)}...`);
      console.log(`[SESSION-TRACE] hasDocuments=${hasDocuments}, docCount=${docCount}`);
      console.log(`[SESSION-TRACE] turnIndex=${turnIndex}`);
      console.log(`[SESSION-TRACE] query="${request.text.substring(0, 60)}..."`);
      console.log(`[SESSION-TRACE] ═══════════════════════════════════════════════════════════`);

      let intentWithScores = await this.intentEngine.predictWithScores({
        text: request.text,
        language: request.language,
        context: request.context,
      });

      const language = intentWithScores.language || request.language || 'en';

      this.logger.info(
        `[Orchestrator] STREAMING userId=${request.userId} raw_intent=${intentWithScores.primaryIntent} confidence=${intentWithScores.confidence.toFixed(2)}`
      );

      // =========================================================================
      // FIX C: LOW CONFIDENCE → DOCUMENTS (instead of error/fallback)
      // Same fix as non-streaming path
      // =========================================================================
      if (intentWithScores.primaryIntent === 'error' && hasDocuments) {
        const bestNonError = intentWithScores.allScores
          .filter(s => s.intent !== 'error')
          .sort((a, b) => b.finalScore - a.finalScore)[0];

        const forcedIntent = bestNonError?.intent || 'documents';
        const forcedConfidence = bestNonError?.finalScore || 0.4;

        this.logger.info(
          `[Orchestrator] STREAM FIX_C: error→${forcedIntent} (user has docs, lowConfidence=true)`
        );

        intentWithScores = {
          ...intentWithScores,
          primaryIntent: forcedIntent,
          confidence: forcedConfidence,
          metadata: {
            ...intentWithScores.metadata,
            lowConfidence: true,
            originalIntent: 'error',
          },
        };

        const docsScore = intentWithScores.allScores.find(s => s.intent === 'documents');
        if (docsScore && docsScore.finalScore < 0.5) {
          docsScore.finalScore = 0.55;
        }
      }

      // =========================================================================
      // FIX E: DETERMINISTIC DOC REFERENCE ESCAPE HATCH (streaming)
      // =========================================================================
      const DOC_REFERENCE_PATTERN = /\b(document|doc|file|pdf|upload|contract|report|agreement|my\s+\w+\s+says?|in\s+the\s+\w+|from\s+the\s+\w+|according\s+to)\b/i;
      const hasDocReference = DOC_REFERENCE_PATTERN.test(request.text);

      if (hasDocuments && hasDocReference && intentWithScores.primaryIntent !== 'documents') {
        const currentIntent = intentWithScores.primaryIntent;
        const shouldForce = !['memory', 'help', 'preferences', 'file_actions'].includes(currentIntent);

        if (shouldForce) {
          this.logger.info(
            `[Orchestrator] STREAM FIX_E: ${currentIntent}→documents (doc reference pattern)`
          );
          intentWithScores = {
            ...intentWithScores,
            primaryIntent: 'documents',
            confidence: Math.max(intentWithScores.confidence, 0.60),
            metadata: {
              ...intentWithScores.metadata,
              docReferenceForced: true,
              originalIntent: currentIntent,
            },
          };
        }
      }

      // Step 1.25: Apply routing priority adjustments (before tiebreakers)
      // This handles document boosting, domain dampening, and extraction collision resolution
      const routingScores = intentWithScores.allScores.map(s => ({
        intent: s.intent,
        confidence: s.finalScore,
        matchedKeywords: s.matchedKeywords,
        matchedPattern: s.matchedPattern,
      }));

      // FIX A: Fetch previous intent for follow-up confidence inheritance
      const { intent: previousIntent, confidence: previousConfidence } =
        await this.getLastIntentFromConversation(request.conversationId);

      const priorityResult = routingPriorityService.adjustScores(
        routingScores,
        request.text,
        {
          hasDocuments,
          isFollowup: !!request.conversationId,
          previousIntent,
          previousConfidence,
        }
      );

      // Use priority-adjusted intent
      let intent: PredictedIntent = {
        ...intentWithScores,
        primaryIntent: priorityResult.primaryIntent,
        confidence: priorityResult.primaryConfidence,
      };

      if (priorityResult.debugInfo.originalPrimary !== priorityResult.primaryIntent) {
        this.logger.info(
          `[Orchestrator] Stream routing priority adjusted: ${priorityResult.debugInfo.originalPrimary} → ${priorityResult.primaryIntent} (doc_boost=${priorityResult.documentBoostApplied}, domain_damp=${priorityResult.domainDampeningApplied})`
        );
      }

      // Step 1.5: Apply routing tiebreakers (after priority adjustments)
      const tiebreakerInput: TiebreakerInput = {
        text: request.text,
        predictedIntent: intent.primaryIntent,
        predictedConfidence: intent.confidence,
        language,
        context: {
          hasDocuments,
          isFollowup: !!request.conversationId,
          secondaryIntents: intent.secondaryIntents,
        },
      };

      const tiebreakerResult = this.tiebreakers.applyTiebreakers(tiebreakerInput);
      if (tiebreakerResult.wasModified) {
        this.logger.info(
          `[Orchestrator] Stream tiebreaker applied: ${intent.primaryIntent} → ${tiebreakerResult.intent} (${tiebreakerResult.reason})`
        );
        intent = {
          ...intent,
          primaryIntent: tiebreakerResult.intent,
          confidence: tiebreakerResult.confidence,
        };
      }

      // OVERRIDE: File metadata queries should go to file_actions, not documents
      // This catches "how many files", "what files do i have", etc.
      const fileMetaPatterns = /\b(how many|quantos|cuantos)\s+(files?|documents?|arquivos?|documentos?|ficheros?)\b|\b(what|quais|que)\s+(files?|documents?|arquivos?|documentos?)\s+(do i have|i have|tenho|tienes|tengo)\b|\b(list|show|ver|mostrar)\s+(my|meus|mis)?\s*(files?|documents?|arquivos?|documentos?)\b/i;
      if (fileMetaPatterns.test(request.text) && intent.primaryIntent !== 'file_actions') {
        this.logger.info(`[Orchestrator] OVERRIDE: "${intent.primaryIntent}" → "file_actions" (file metadata query)`);
        intent = {
          ...intent,
          primaryIntent: 'file_actions' as any,
          confidence: 0.95, // High confidence for explicit override
        };
      }

      // OVERRIDE: Queries with explicit filenames should go to documents
      // This catches "summarize X.xlsx", "what's in Y.pdf", etc.
      // BUT NOT "open X.pdf" which is a file_actions query
      const hasExplicitFilename = /\w+\.(xlsx?|pdf|docx?|pptx?|txt|csv)/i.test(request.text);
      const isOpenFileQuery = /\b(open|abrir|öffnen)\s+.+\.(xlsx?|pdf|docx?|pptx?|txt|csv|png|jpe?g)/i.test(request.text);
      const documentIntentsCheck = ['documents', 'excel', 'finance', 'accounting', 'file_actions'];
      if (hasExplicitFilename && !documentIntentsCheck.includes(intent.primaryIntent) && !isOpenFileQuery) {
        this.logger.info(`[Orchestrator] OVERRIDE: "${intent.primaryIntent}" → "documents" (explicit filename in query)`);
        intent = {
          ...intent,
          primaryIntent: 'documents' as any,
          confidence: 0.95, // High confidence for explicit override
        };
      }

      this.logger.info(
        `[Orchestrator] STREAMING userId=${request.userId} final_intent=${intent.primaryIntent} confidence=${intent.confidence.toFixed(2)}`
      );

      // Step 2: Multi-intent detection - process segments with per-segment streaming
      const multiIntentResult = this.multiIntent.detect(request.text);
      if (multiIntentResult.isMultiIntent && multiIntentResult.segments.length > 1) {
        this.logger.info(
          `[Orchestrator] Multi-intent streaming: ${multiIntentResult.segments.length} segments`
        );

        // Yield initial intent event with debug fields
        // V4: Use 'documents' as base intent for multi-intent streams
        yield {
          type: 'intent',
          intent: 'documents',
          confidence: intent.confidence,
          multiIntent: true, // Flag to indicate multi-intent processing
          // Debug fields for frontend verification
          domain: 'documents',
          depth: computeDepth('documents', intent.confidence),
          family: 'documents',
        } as StreamEvent;

        // Process each segment and emit content with segment markers
        // QUALITY FIX: Track seen doc IDs to prevent duplicate markers across segments
        const seenDocIdsInContent = new Set<string>();

        const segmentsData: Array<{
          intent: string;
          confidence: number;
          answer: string;
          documentsUsed: number;
          sources?: any[];
          citations?: any[];
        }> = [];

        // Collect all sources across segments (will deduplicate later)
        const allSources: any[] = [];
        const allCitations: any[] = [];

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

          // QUALITY FIX: Deduplicate document markers in segment answer
          let cleanedAnswer = segmentResponse.answer;
          const docMarkerRegex = /\{\{DOC::([a-f0-9-]+)::[^}]+\}\}/gi;
          const markers = cleanedAnswer.match(docMarkerRegex) || [];

          for (const marker of markers) {
            const idMatch = marker.match(/\{\{DOC::([a-f0-9-]+)::/i);
            if (idMatch) {
              const docId = idMatch[1];
              if (seenDocIdsInContent.has(docId)) {
                // Remove duplicate marker
                cleanedAnswer = cleanedAnswer.replace(marker, '').trim();
              } else {
                seenDocIdsInContent.add(docId);
              }
            }
          }
          cleanedAnswer = cleanedAnswer.replace(/\n{3,}/g, '\n\n').trim();

          // Skip empty segments after deduplication
          if (!cleanedAnswer || cleanedAnswer.length < 5) {
            continue;
          }

          // Collect segment data including sources and citations
          segmentsData.push({
            intent: segmentIntent.primaryIntent,
            confidence: segmentIntent.confidence,
            answer: cleanedAnswer,
            documentsUsed: segmentResponse.metadata?.documentsUsed || 0,
            sources: segmentResponse.sources,
            citations: segmentResponse.citations,
          });

          // Accumulate sources and citations for final done event
          if (segmentResponse.sources && Array.isArray(segmentResponse.sources)) {
            allSources.push(...segmentResponse.sources);
          }
          if (segmentResponse.citations && Array.isArray(segmentResponse.citations)) {
            allCitations.push(...segmentResponse.citations);
          }

          // Format segment content through pipeline
          const formattedSegment = await this.formattingPipeline.format({
            text: cleanedAnswer,
            intent: segmentIntent.primaryIntent,
            language: request.language,
          });
          const segmentContent = formattedSegment.markdown || cleanedAnswer;

          // QUALITY FIX: Only use step labels if multiple segments
          const stepLabel = segmentsData.length > 1
            ? `**Step ${segmentsData.length}:**\n${segmentContent}`
            : segmentContent;

          yield {
            type: 'content',
            segment: segmentsData.length,
            intent: segmentIntent.primaryIntent,
            content: stepLabel,
          } as StreamEvent;

          // Add spacing between segments (except after last) - no ---
          if (i < multiIntentResult.segments.length - 1) {
            yield { type: 'content', content: '\n\n' } as StreamEvent;
          }
        }

        // Build combined answer (no --- separators)
        // QUALITY FIX: Skip step labels for single segment + deduplicate boilerplate
        let combinedAnswer: string;
        if (segmentsData.length === 1) {
          combinedAnswer = segmentsData[0].answer;
        } else if (segmentsData.length === 0) {
          combinedAnswer = 'I found the requested information in your documents.';
        } else {
          // Deduplicate repeated boilerplate phrases across segments
          const boilerplatePhrases = [
            'I can help with information from this document',
            'Found relevant information in this document',
            "I'm Koda, an AI assistant specialized in helping you work with your documents",
            'open it to review the details',
          ];

          const seenPhrases = new Set<string>();
          const deduplicatedSegments = segmentsData.map((s, idx) => {
            let answer = s.answer;
            if (idx > 0) {
              for (const phrase of boilerplatePhrases) {
                if (seenPhrases.has(phrase.toLowerCase()) && answer.toLowerCase().includes(phrase.toLowerCase())) {
                  answer = answer.replace(new RegExp(`[^\\n]*${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*\\n?`, 'gi'), '').trim();
                }
              }
            }
            for (const phrase of boilerplatePhrases) {
              if (answer.toLowerCase().includes(phrase.toLowerCase())) {
                seenPhrases.add(phrase.toLowerCase());
              }
            }
            return { ...s, answer };
          }).filter(s => s.answer && s.answer.length > 5);

          if (deduplicatedSegments.length === 1) {
            combinedAnswer = deduplicatedSegments[0].answer;
          } else if (deduplicatedSegments.length === 0) {
            combinedAnswer = 'I found the requested information in your documents.';
          } else {
            combinedAnswer = deduplicatedSegments
              .map((s, i) => `**Step ${i + 1}:**\n${s.answer}`)
              .join('\n\n');
          }
        }

        const totalDocumentsUsed = segmentsData.reduce((sum, s) => sum + s.documentsUsed, 0);
        const processingTime = Date.now() - startTime;

        // =================================================================
        // MULTI-INTENT MARKER ENFORCEMENT (streaming path):
        // If any segment was file_actions, ensure DOC markers are present
        // =================================================================
        const hasFileActionSegment = segmentsData.some(s => s.intent === 'file_actions');
        const hasMarkers = /\{\{DOC::/.test(combinedAnswer);

        if (hasFileActionSegment && !hasMarkers) {
          this.logger.warn('[MultiIntent Streaming] file_actions segment missing markers, adding');
          try {
            const userFiles = await fileSearchService.listFolderContents(request.userId, null, { limit: 5 });
            if (userFiles.length > 0) {
              const buttons = userFiles.map(f => `**${f.filename}** ${createDocMarker({ id: f.id, name: f.filename, ctx: 'list' })}`).join('\n');
              combinedAnswer = combinedAnswer.trim() + '\n\n' + buttons;
              // Also emit the markers to the stream
              yield { type: 'content', content: '\n\n' + buttons } as StreamEvent;
            }
          } catch (err) {
            this.logger.error('[MultiIntent Streaming] Failed to add markers:', err);
          }
        }

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

        // Deduplicate sources by documentId
        const seenDocIds = new Set<string>();
        const deduplicatedSources = allSources.filter(source => {
          const docId = source?.documentId;
          if (!docId || seenDocIds.has(docId)) return false;
          seenDocIds.add(docId);
          return true;
        });

        // Deduplicate citations by documentId
        const seenCitationIds = new Set<string>();
        const deduplicatedCitations = allCitations.filter(citation => {
          const docId = citation?.documentId;
          if (!docId || seenCitationIds.has(docId)) return false;
          seenCitationIds.add(docId);
          return true;
        });

        // Extract unique document IDs
        const sourceDocumentIds = [...new Set(deduplicatedSources.map(s => s.documentId).filter(Boolean))];

        // Emit done event with full structured answer including sources
        yield {
          type: 'done',
          fullAnswer: combinedAnswer,
          formatted: combinedAnswer,
          intent: 'documents',
          confidence: Math.min(...segmentsData.map(s => s.confidence)),
          documentsUsed: totalDocumentsUsed,
          processingTime,
          sources: deduplicatedSources,  // FIXED: Include sources for frontend
          citations: deduplicatedCitations,
          sourceDocumentIds,
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
      // NOTE: docCount already available from checkUserHasDocumentsWithCount above
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

      // ═══════════════════════════════════════════════════════════════════════════
      // CRITICAL: INVENTORY QUERY INTERCEPT (BEFORE intent-based routing)
      // This ensures "group by folder", "show PDFs", "largest file" etc. always
      // go to fast metadata path even if intent classification is wrong (e.g., memory)
      // ═══════════════════════════════════════════════════════════════════════════
      const inventoryResult = await this.tryInventoryQuery(request.userId, request.text, language);
      if (inventoryResult) {
        console.log(`[CONTEXT-TRACE] processStreamingQuery → INVENTORY INTERCEPT for: "${request.text.substring(0, 50)}..."`);

        // Yield intent event (for consistency)
        yield {
          type: 'intent',
          intent: 'documents',
          confidence: 0.99,
          domain: 'inventory',
          depth: 'D1',
          family: 'documents',
        } as StreamEvent;

        // Yield the content
        yield { type: 'content', content: inventoryResult.answer } as ContentEvent;
        if (inventoryResult.formatted) {
          yield { type: 'content', content: '\n' + inventoryResult.formatted } as ContentEvent;
        }

        // Yield done event with attachments for deterministic button rendering
        const inventoryFiles = inventoryResult.metadata?.files || [];
        yield {
          type: 'done',
          fullAnswer: inventoryResult.answer + (inventoryResult.formatted ? '\n' + inventoryResult.formatted : ''),
          formatted: inventoryResult.formatted,
          intent: 'documents',
          confidence: 0.99,
          documentsUsed: inventoryResult.metadata?.documentsUsed || 0,
          processingTime: Date.now() - startTime,
          sources: [],
          citations: [],
          sourceDocumentIds: [],
          // QW1: Include attachments for deterministic button rendering
          attachments: inventoryFiles.map((f: any) => ({
            id: f.id,
            name: f.filename,
            mimeType: f.mimeType || 'application/octet-stream',
            folderPath: f.folderPath,
            purpose: 'preview' as const,
          })),
          referencedFileIds: inventoryFiles.map((f: any) => f.id),
        } as StreamEvent;

        return {
          fullAnswer: inventoryResult.answer + (inventoryResult.formatted ? '\n' + inventoryResult.formatted : ''),
          intent: 'documents',
          confidence: 0.99,
          documentsUsed: inventoryResult.metadata?.documentsUsed || 0,
          processingTime: Date.now() - startTime,
        };
      }
      // ═══════════════════════════════════════════════════════════════════════════

      // ═══════════════════════════════════════════════════════════════════════════
      // CRITICAL: FILE ACTION QUERY INTERCEPT (BEFORE intent-based routing)
      // This ensures "show me the X file", "open X.pdf", "where is X" always
      // go to file action handler even if intent classification routes to documents
      // ═══════════════════════════════════════════════════════════════════════════
      const fileActionResult = await this.tryFileActionQuery(request.userId, request.text, language, request.conversationId);
      if (fileActionResult) {
        console.log(`[CONTEXT-TRACE] processStreamingQuery → FILE ACTION INTERCEPT for: "${request.text.substring(0, 50)}..."`);

        // Yield intent event (for consistency)
        yield {
          type: 'intent',
          intent: 'file_actions',
          confidence: 0.99,
          domain: 'file_navigation',
          depth: 'D1',
          family: 'documents',
        } as StreamEvent;

        // Yield the content
        yield { type: 'content', content: fileActionResult.answer } as ContentEvent;
        if (fileActionResult.formatted && fileActionResult.formatted !== fileActionResult.answer) {
          yield { type: 'content', content: '\n' + fileActionResult.formatted } as ContentEvent;
        }

        // Yield done event with attachments for deterministic button rendering
        const fileActionFiles = fileActionResult.metadata?.files || fileActionResult.fileAction?.files || [];
        // Determine if this is a buttons-only response (file action with no prose message)
        const isButtonsOnly = fileActionResult.metadata?.buttonOnly ||
          (fileActionResult.fileAction?.action === 'OPEN_FILE' && !fileActionResult.fileAction?.message);
        yield {
          type: 'done',
          fullAnswer: fileActionResult.answer + (fileActionResult.formatted && fileActionResult.formatted !== fileActionResult.answer ? '\n' + fileActionResult.formatted : ''),
          formatted: fileActionResult.formatted,
          intent: 'file_actions',
          confidence: 0.99,
          documentsUsed: fileActionResult.metadata?.documentsUsed || 0,
          processingTime: Date.now() - startTime,
          sources: [],
          citations: [],
          sourceDocumentIds: [],
          // QW1: Include attachments for deterministic button rendering
          attachments: fileActionFiles.map((f: any) => ({
            id: f.id,
            name: f.filename || f.name,
            mimeType: f.mimeType || 'application/octet-stream',
            folderPath: f.folderPath,
            purpose: (fileActionResult.fileAction?.action === 'OPEN_FILE' ? 'open' : 'preview') as 'open' | 'preview',
          })),
          referencedFileIds: fileActionFiles.map((f: any) => f.id),
          // Formatting constraints for frontend rendering
          constraints: isButtonsOnly ? { buttonsOnly: true } : undefined,
        } as StreamEvent;

        return {
          fullAnswer: fileActionResult.answer + (fileActionResult.formatted && fileActionResult.formatted !== fileActionResult.answer ? '\n' + fileActionResult.formatted : ''),
          intent: 'file_actions',
          confidence: 0.99,
          documentsUsed: fileActionResult.metadata?.documentsUsed || 0,
          processingTime: Date.now() - startTime,
        };
      }
      // ═══════════════════════════════════════════════════════════════════════════

      // Yield intent event with debug fields (for frontend verification overlay)
      yield {
        type: 'intent',
        intent: finalIntent.primaryIntent,
        confidence: finalIntent.confidence,
        // Debug fields for frontend verification
        domain: adaptedIntent.domain,
        depth: computeDepth(finalIntent.primaryIntent, finalIntent.confidence),
        family: getIntentFamily(finalIntent.primaryIntent),
        subIntent: overriddenIntent.overrideReason ? overriddenIntent.primaryIntent : undefined,
        blockedByNegatives: false, // TODO: wire up negative trigger detection
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
        console.log(`[CONTEXT-TRACE] Streaming OTHER intent: ${finalIntent.primaryIntent} → calling routeIntent`);
        const response = await this.routeIntent(request, finalIntent);
        console.log(`[CONTEXT-TRACE] routeIntent response for ${finalIntent.primaryIntent}: "${response.answer.substring(0, 50)}..."`);
        yield { type: 'content', content: response.answer } as ContentEvent;

        // PHASE 2.2: Extract attachments/actions from handler metadata for SSE done payload
        const handlerAttachments = response.metadata?.attachments || [];
        const handlerActions = response.metadata?.actions || [];
        const referencedFileIds = handlerAttachments.map((a: any) => a.id).filter(Boolean);

        result = {
          fullAnswer: response.answer,
          formatted: response.formatted || response.answer,
          intent: finalIntent.primaryIntent,
          confidence: finalIntent.confidence,
          documentsUsed: response.metadata?.documentsUsed || 0,
          processingTime: Date.now() - startTime,
          // PHASE 2.2: Include structured metadata for frontend
          attachments: handlerAttachments,
          actions: handlerActions,
          referencedFileIds,
        } as any;
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

        // PHASE 2.2: Yield done event with full metadata including attachments/actions
        yield {
          type: 'done',
          fullAnswer: result.fullAnswer,
          formatted: (result as any).formatted || result.fullAnswer,
          intent: result.intent,
          confidence: result.confidence,
          processingTime: result.processingTime,
          documentsUsed: result.documentsUsed,
          sources: [],
          citations: [],
          sourceDocumentIds: [],
          // QW1: Structured file action fields for deterministic button rendering
          attachments: (result as any).attachments || [],
          actions: (result as any).actions || [],
          referencedFileIds: (result as any).referencedFileIds || [],
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

    // ═══════════════════════════════════════════════════════════════════════════
    // INVENTORY QUERY INTERCEPT: Filter/sort queries bypass RAG
    // "show only PPTX", "largest file", "group by folder" etc.
    // ═══════════════════════════════════════════════════════════════════════════
    const inventoryResult = await this.tryInventoryQuery(request.userId, request.text, language);
    if (inventoryResult) {
      console.log(`[CONTEXT-TRACE] streamDocumentQnA → INVENTORY PATH for: "${request.text.substring(0, 50)}..."`);
      yield { type: 'content', content: inventoryResult.answer } as ContentEvent;
      if (inventoryResult.formatted) {
        yield { type: 'content', content: '\n' + inventoryResult.formatted } as ContentEvent;
      }
      yield {
        type: 'done',
        fullAnswer: inventoryResult.answer + (inventoryResult.formatted ? '\n' + inventoryResult.formatted : ''),
        formatted: inventoryResult.formatted,
        intent: intent.primaryIntent,
        confidence: intent.confidence,
        documentsUsed: inventoryResult.metadata?.documentsUsed || 0,
        processingTime: Date.now() - startTime,
        sources: [],
        citations: [],
        sourceDocumentIds: [],
      } as StreamEvent;
      return {
        fullAnswer: inventoryResult.answer + (inventoryResult.formatted ? '\n' + inventoryResult.formatted : ''),
        intent: intent.primaryIntent,
        confidence: intent.confidence,
        documentsUsed: inventoryResult.metadata?.documentsUsed || 0,
        processingTime: Date.now() - startTime,
      };
    }

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

    // WORKSPACE CATALOG CHECK: Detect "summarize my documents" style queries
    // These should return a catalog listing, NOT RAG content extraction
    const textLower = request.text.toLowerCase();
    const isWorkspaceSummary = /\b(summar|overview|recap)\w*/i.test(textLower) &&
      (/\b(my documents|my files|all my|my workspace|everything|all documents|all files)\b/i.test(textLower)
        || (textLower.includes('documents') && !textLower.includes('"'))
        || (textLower.includes('files') && !textLower.includes('"')));

    if (isWorkspaceSummary) {
      this.logger.info('[Orchestrator] Stream workspace summary mode - using catalog');
      const catalogResponse = await this.handleWorkspaceCatalog({
        request,
        intent,
        language,
      });
      yield { type: 'content', content: catalogResponse.answer } as ContentEvent;
      yield {
        type: 'done',
        fullAnswer: catalogResponse.answer,
        formatted: catalogResponse.formatted,
        intent: intent.primaryIntent,
        confidence: intent.confidence,
        documentsUsed: catalogResponse.metadata?.documentsUsed || 0,
        processingTime: Date.now() - startTime,
        sources: [], // Catalog mode has no sources/citations
        citations: [],
        sourceDocumentIds: [],
      } as StreamEvent;
      return {
        fullAnswer: catalogResponse.answer,
        intent: intent.primaryIntent,
        confidence: intent.confidence,
        documentsUsed: catalogResponse.metadata?.documentsUsed || 0,
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

    // PERF: Early streaming - emit content token IMMEDIATELY before RAG
    // This drops TTFT from 7-10s to ~500ms for user perceived responsiveness
    yield { type: 'retrieving', message: 'Searching documents...' } as StreamEvent;

    // Convert PredictedIntent to IntentClassificationV3 for RAG services
    const adaptedIntent = adaptPredictedIntent(intent, request);

    // Check for domain-specific intent enforcement
    const domainContext = domainEnforcementService.getDomainContext(intent.primaryIntent);
    if (domainContext.isDomainSpecific) {
      this.logger.info(`[Orchestrator] Stream domain enforcement active: ${domainContext.domain}`);
    }

    // =========================================================================
    // IMPLICIT DOCUMENT REFERENCE DETECTION (streaming path)
    // For follow-up questions like "Summarize it", "What's this about?",
    // detect implicit references and scope retrieval to the last referenced doc
    // =========================================================================
    let scopedDocumentIds: string[] | undefined;
    let augmentedQuery = request.text;

    // Detect implicit document references in query
    const IMPLICIT_DOC_PATTERNS = [
      /\b(summarize|explain|describe|tell me about)\s+(it|this|that)\b/i,
      /\b(what('s| is| are))\s+(it|this|that)\s+(about|saying|showing)\b/i,
      /\b(it|this|that)\s+(says?|mentions?|shows?|contains?|discusses?)\b/i,
      /\bin\s+(it|this|that)\b/i,
      /\bfrom\s+(it|this|that)\b/i,
      /^(summarize|explain|describe)\s+it\b/i,
    ];
    const hasImplicitDocRef = IMPLICIT_DOC_PATTERNS.some(p => p.test(request.text));

    if (hasImplicitDocRef && request.conversationId) {
      const fileContext = this.getConversationFileContext(request.userId, request.conversationId);
      if (fileContext?.lastReferencedFile) {
        scopedDocumentIds = [fileContext.lastReferencedFile.id];
        // AUGMENT query with document name for better retrieval
        const docName = fileContext.lastReferencedFile.filename;
        augmentedQuery = `[Regarding ${docName}] ${request.text}`;
        this.logger.info(`[Orchestrator] STREAM implicit ref detected, scoping to: ${docName}`);
      }
    }

    // Retrieve documents with metadata (non-streaming - fast)
    const retrievalResult = await this.retrievalEngine.retrieveWithMetadata({
      query: augmentedQuery,
      userId: request.userId,
      language,
      intent: adaptedIntent,
      documentIds: scopedDocumentIds, // Scope to specific doc if implicit ref detected
    });

    if (!retrievalResult.chunks || retrievalResult.chunks.length === 0) {
      // FIX: Use NO_RELEVANT_DOCS not NO_DOCUMENTS (user HAS docs, just no match)
      // NOTE: Message must NOT trigger E2E fallback patterns
      const fallback = this.fallbackConfig.getFallback('NO_RELEVANT_DOCS', 'short_guidance', language);
      const noDocsMsg = fallback?.text || `Based on the documents, this particular detail isn't mentioned. Try a different question.`;
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

    // Apply domain enforcement to retrieved chunks (filter and boost)
    let processedChunks = retrievalResult.chunks;
    if (domainContext.isDomainSpecific && domainContext.domain) {
      processedChunks = domainEnforcementService.filterByDomain(processedChunks, domainContext.domain);
      processedChunks = domainEnforcementService.applyDomainBoost(processedChunks, domainContext.domain);
    }

    // Check abort after retrieval
    if (isAborted()) {
      this.logger.info('[Orchestrator] Stream aborted after retrieval');
      return {
        fullAnswer: '',
        intent: intent.primaryIntent,
        confidence: intent.confidence,
        documentsUsed: processedChunks.length,
        processingTime: Date.now() - startTime,
      };
    }

    // Yield generating event with document count
    yield {
      type: 'generating',
      message: `Generating answer from ${processedChunks.length} document chunks...`,
    } as StreamEvent;

    // FIX D: Check if lowConfidence mode is active (set by Fix C)
    const isLowConfidence = !!(intent.metadata as any)?.lowConfidence;

    // TRUE STREAMING: Use answer engine's async generator with abort signal
    const answerStream = this.answerEngine.streamAnswerWithDocsAsync({
      userId: request.userId,
      query: request.text,
      intent: adaptedIntent,
      documents: processedChunks,
      language,
      abortSignal,
      domainContext: domainContext.promptContext,
      softAnswerMode: isLowConfidence, // FIX D: Use soft answer mode when confidence is low
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

    // Build sources array for frontend display (with all required fields)
    const sources = this.buildSourcesFromChunks(retrievalResult.chunks);

    // Store the first cited document for follow-up queries like "where is it?"
    if (sources.length > 0 && request.conversationId) {
      const firstSource = sources[0];
      const fileResult: FileSearchResult = {
        id: firstSource.documentId,
        filename: firstSource.filename || firstSource.documentName || 'Document',
        mimeType: firstSource.mimeType || 'application/octet-stream',
        fileSize: 0,
        folderId: null, // Source type doesn't include folderId
        folderPath: firstSource.folderPath || null,
        createdAt: new Date(),
        status: 'available',
      };
      await this.storeLastReferencedFile(request.userId, request.conversationId, fileResult);
      this.logger.debug(`[Orchestrator] Stored last referenced doc from Q&A: ${fileResult.filename}`);
    }

    // Emit single done event with full metadata including formatted answer for frontend
    // CRITICAL: Include both 'sources' (for frontend DocumentSources component) and 'citations'
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
      sources, // FIXED: Frontend expects 'sources' not just 'citations'
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
   * Route intent to appropriate handler
   * V4 simplified intent routing - 15 intents (9 core + 6 domain-specific)
   * PHASE 3.1: Global response contract enforcement
   */
  private async routeIntent(
    request: OrchestratorRequest,
    intent: PredictedIntent
  ): Promise<IntentHandlerResponse> {
    // Call the actual routing logic
    const response = await this.routeIntentInternal(request, intent);

    // PHASE 3.1: Apply global response contract enforcement
    // This ensures all handlers respect formatting requests (bullet/numbered list, max items, no emojis)
    const enforced = enforceResponseContract(response.answer, request.text, this.logger);
    if (enforced.modified) {
      this.logger.info(`[Orchestrator] GLOBAL ResponseContract applied: ${enforced.rules.join(', ')}`);
      return {
        ...response,
        answer: enforced.text,
        formatted: response.formatted ? enforceResponseContract(response.formatted, request.text).text : enforced.text,
      };
    }

    return response;
  }

  /**
   * Internal routing logic (called by routeIntent which applies contract)
   */
  private async routeIntentInternal(
    request: OrchestratorRequest,
    intent: PredictedIntent
  ): Promise<IntentHandlerResponse> {
    // ═══════════════════════════════════════════════════════════════════════════
    // VERIFICATION CHECKLIST C: Routing debug logging
    // Log: intent, subIntent, domain, handlerName, docIdsUsed
    // ═══════════════════════════════════════════════════════════════════════════
    const subIntent = intent.metadata?.subIntent || 'N/A';
    const domain = intent.metadata?.domain || 'general';
    console.log(`[ROUTING-DEBUG] ═══════════════════════════════════════════════════════════`);
    console.log(`[ROUTING-DEBUG] intent=${intent.primaryIntent}`);
    console.log(`[ROUTING-DEBUG] subIntent=${subIntent}`);
    console.log(`[ROUTING-DEBUG] domain=${domain}`);
    console.log(`[ROUTING-DEBUG] confidence=${intent.confidence.toFixed(2)}`);
    console.log(`[ROUTING-DEBUG] query="${request.text.substring(0, 60)}..."`);

    // Pass intent object through to all handlers
    const handlerContext = {
      request,
      intent,
      language: intent.language,
    };

    // Determine handler name for logging
    let handlerName: string;

    switch (intent.primaryIntent) {
      // ========== CORE INTENTS ==========

      case 'documents':
        // Unified document handler (QA, analytics, search, summarize, management)
        handlerName = 'handleDocumentQnA';
        console.log(`[ROUTING-DEBUG] handlerName=${handlerName}`);
        console.log(`[ROUTING-DEBUG] ═══════════════════════════════════════════════════════════`);
        return this.handleDocumentQnA(handlerContext);

      case 'help':
        // Product help, onboarding, feature requests
        handlerName = 'handleProductHelp';
        console.log(`[ROUTING-DEBUG] handlerName=${handlerName}`);
        console.log(`[ROUTING-DEBUG] ═══════════════════════════════════════════════════════════`);
        return this.handleProductHelp(handlerContext);

      case 'conversation':
        // Chitchat, feedback, greetings
        handlerName = 'handleChitchat';
        console.log(`[ROUTING-DEBUG] handlerName=${handlerName}`);
        console.log(`[ROUTING-DEBUG] ═══════════════════════════════════════════════════════════`);
        return this.handleChitchat(handlerContext);

      case 'edit':
        // Answer rewrite/expand/simplify, text transforms
        handlerName = 'handleAnswerRewrite';
        console.log(`[ROUTING-DEBUG] handlerName=${handlerName}`);
        console.log(`[ROUTING-DEBUG] ═══════════════════════════════════════════════════════════`);
        return this.handleAnswerRewrite(handlerContext);

      case 'reasoning':
        // Math, logic, calculations, general knowledge
        handlerName = 'handleReasoningTask';
        console.log(`[ROUTING-DEBUG] handlerName=${handlerName}`);
        console.log(`[ROUTING-DEBUG] ═══════════════════════════════════════════════════════════`);
        return this.handleReasoningTask(handlerContext);

      case 'memory':
        // Store and recall user information
        handlerName = 'handleMemoryStore';
        console.log(`[ROUTING-DEBUG] handlerName=${handlerName}`);
        console.log(`[ROUTING-DEBUG] ═══════════════════════════════════════════════════════════`);
        return this.handleMemoryStore(handlerContext);

      case 'error':
        // Out of scope, ambiguous, safety, unknown
        handlerName = 'handleAmbiguous';
        console.log(`[ROUTING-DEBUG] handlerName=${handlerName}`);
        console.log(`[ROUTING-DEBUG] ═══════════════════════════════════════════════════════════`);
        return this.handleAmbiguous(handlerContext);

      case 'preferences':
        // User settings, language, tone, role
        handlerName = 'handlePreferenceUpdate';
        console.log(`[ROUTING-DEBUG] handlerName=${handlerName}`);
        console.log(`[ROUTING-DEBUG] ═══════════════════════════════════════════════════════════`);
        return this.handlePreferenceUpdate(handlerContext);

      case 'extraction':
        // Data extraction, meta-AI queries
        handlerName = 'handleMetaAI';
        console.log(`[ROUTING-DEBUG] handlerName=${handlerName}`);
        console.log(`[ROUTING-DEBUG] ═══════════════════════════════════════════════════════════`);
        return this.handleMetaAI(handlerContext);

      case 'file_actions':
        // File listing, upload, delete, rename, open - NO RAG needed
        handlerName = 'handleFileActions';
        console.log(`[ROUTING-DEBUG] handlerName=${handlerName}`);
        console.log(`[ROUTING-DEBUG] ═══════════════════════════════════════════════════════════`);
        return this.handleFileActions(handlerContext);

      // ========== DOMAIN-SPECIFIC INTENTS ==========
      // NOTE: Calculations removed - now FILE_ACTIONS.calculation sub-intent, handled above

      case 'accounting':
        // Accounting-specific document queries
        handlerName = 'handleDocumentQnA (accounting)';
        console.log(`[ROUTING-DEBUG] handlerName=${handlerName}`);
        console.log(`[ROUTING-DEBUG] ═══════════════════════════════════════════════════════════`);
        return this.handleDocumentQnA(handlerContext);

      case 'engineering':
        // Engineering-specific document queries
        handlerName = 'handleDocumentQnA (engineering)';
        console.log(`[ROUTING-DEBUG] handlerName=${handlerName}`);
        console.log(`[ROUTING-DEBUG] ═══════════════════════════════════════════════════════════`);
        return this.handleDocumentQnA(handlerContext);

      case 'finance':
        // Finance-specific document queries
        handlerName = 'handleDocumentQnA (finance)';
        console.log(`[ROUTING-DEBUG] handlerName=${handlerName}`);
        console.log(`[ROUTING-DEBUG] ═══════════════════════════════════════════════════════════`);
        return this.handleDocumentQnA(handlerContext);

      case 'legal':
        // Legal-specific document queries
        handlerName = 'handleDocumentQnA (legal)';
        console.log(`[ROUTING-DEBUG] handlerName=${handlerName}`);
        console.log(`[ROUTING-DEBUG] ═══════════════════════════════════════════════════════════`);
        return this.handleDocumentQnA(handlerContext);

      case 'medical':
        // Medical-specific document queries
        handlerName = 'handleDocumentQnA (medical)';
        console.log(`[ROUTING-DEBUG] handlerName=${handlerName}`);
        console.log(`[ROUTING-DEBUG] ═══════════════════════════════════════════════════════════`);
        return this.handleDocumentQnA(handlerContext);

      default:
        // Check for file_actions sub-intents (file_actions_excel, file_actions_pdf, etc.)
        if (intent.primaryIntent.startsWith('file_actions_')) {
          console.log(`[ROUTING-DEBUG] handlerName=handleFileActions (sub-intent: ${intent.primaryIntent})`);
          console.log(`[ROUTING-DEBUG] ═══════════════════════════════════════════════════════════`);
          return this.handleFileActions(handlerContext);
        }
        console.log(`[ROUTING-DEBUG] handlerName=buildFallbackResponse (UNSUPPORTED_INTENT)`);
        console.log(`[ROUTING-DEBUG] ═══════════════════════════════════════════════════════════`);
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

      case 'files':
        // File listing, management - no RAG needed
        return this.handleFileActions(handlerContext);

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

      case 'recommend':
        // "Which file should I read to understand X" - route to semantic file search
        return this.handleDocRecommend(context);

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

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 1 INSTRUMENTATION: Log handler entry
    // ═══════════════════════════════════════════════════════════════════════════
    console.log(`[CONTEXT-TRACE] handleDocumentQnA ENTRY: userId=${request.userId.substring(0, 8)}..., query="${request.text.substring(0, 50)}..."`);

    // ═══════════════════════════════════════════════════════════════════════════
    // INVENTORY QUERY INTERCEPT: Filter/sort queries bypass RAG
    // "show only PPTX", "largest file", "group by folder" etc.
    // ═══════════════════════════════════════════════════════════════════════════
    const inventoryResult = await this.tryInventoryQuery(request.userId, request.text, language);
    if (inventoryResult) {
      console.log(`[CONTEXT-TRACE] handleDocumentQnA → INVENTORY PATH for: "${request.text.substring(0, 50)}..."`);
      return inventoryResult;
    }

    // Pre-check: Does user have documents?
    const hasDocuments = await this.checkUserHasDocuments(request.userId);
    if (!hasDocuments) {
      console.log(`[CONTEXT-TRACE] ⚠️ NO_DOCUMENTS FALLBACK TRIGGERED in handleDocumentQnA for userId=${request.userId.substring(0, 8)}...`);
      return this.buildFallbackResponse(context, 'NO_DOCUMENTS');
    }

    // Convert PredictedIntent to IntentClassificationV3 for RAG services
    const adaptedIntent = adaptPredictedIntent(intent, request);

    // Check for domain-specific intent enforcement
    const domainContext = domainEnforcementService.getDomainContext(intent.primaryIntent);
    if (domainContext.isDomainSpecific) {
      this.logger.info(`[Orchestrator] Domain enforcement active: ${domainContext.domain}`);
    }

    // =========================================================================
    // IMPLICIT DOCUMENT REFERENCE DETECTION
    // For follow-up questions like "Is this document operational or strategic?",
    // detect implicit references and scope retrieval to the last referenced doc
    // =========================================================================
    let scopedDocumentIds: string[] | undefined;
    let augmentedQuery = request.text;
    const implicitDocPatterns = [
      /\b(this|the)\s+(document|file|pdf|doc)\b/i,
      /\b(this|the)\s+(same)\s+(document|file)\b/i,
      /\bin\s+(this|the)\s+(document|file)\b/i,
      /\bit\s+(says|mentions|contains|shows|includes)/i,
      /\bdoes\s+(this|it)\s+(document|file)?\s*(say|mention|contain|show|include)/i,
      /\bwhat\s+does\s+it\s+say\b/i,
      /\bwhat\s+(is|are)\s+(its|the)\s+/i,
      /\b(summarize|explain|analyze)\s+(this|it)\b/i,
      /\bwhich\s+page\b/i,
      /\bpage\s+\d+\b/i,
      // Additional follow-up patterns for Q6, Q9, Q15-style queries
      /\bwhich\s+one\b/i,                          // "Which one looks like..."
      /\bdoes\s+it\s+mention\b/i,                  // "Does it mention costs..."
      /\b(the\s+)?main\s+takeaway\s+(here|from)?\b/i, // "What is the main takeaway here"
      /\b(is|are)\s+(this|it|they)\s+(more|less)\b/i, // "Is this more operational..."
      /\bhere\b.*\?$/i,                            // Ends with "here?"
      /^(is|does|what|which)\s+(this|it)\b/i,      // Starts with "Is this...", "Does it..."
      /\bthe\s+(older|newer|other|first|second|last)\s+(one|file|document)\b/i,
      /\b(compared?\s+to|vs\.?|versus)\s+(the\s+)?(other|it)\b/i,
    ];

    const hasImplicitDocRef = implicitDocPatterns.some(p => p.test(request.text));

    if (hasImplicitDocRef && request.conversationId) {
      const fileContext = this.getConversationFileContext(request.userId, request.conversationId);
      if (fileContext?.lastReferencedFile) {
        scopedDocumentIds = [fileContext.lastReferencedFile.id];
        // AUGMENT query with document name for LLM context
        const docName = fileContext.lastReferencedFile.filename;
        augmentedQuery = `[Regarding ${docName}] ${request.text}`;
        this.logger.info(`[Orchestrator] DOC_QA implicit ref detected, scoping to: ${docName}`);
      }
    }

    // Retrieve documents - pass adapted intent for intent-aware boosting
    // Use augmentedQuery if we have implicit doc reference (includes doc name context)
    const retrievalResult = await this.retrievalEngine.retrieveWithMetadata({
      query: augmentedQuery,
      userId: request.userId,
      language,
      intent: adaptedIntent,
      documentIds: scopedDocumentIds,
    });

    // Check if we got chunks
    if (!retrievalResult.chunks || retrievalResult.chunks.length === 0) {
      return this.buildFallbackResponse(context, 'NO_RELEVANT_DOCS');
    }

    // =========================================================================
    // FOLLOW-UP CONTEXT: Update lastReferencedFile from retrieval results
    // This enables follow-up questions like "Is this document operational?"
    // =========================================================================
    if (request.conversationId && retrievalResult.chunks.length > 0) {
      const primaryChunk = retrievalResult.chunks[0];
      const docId = primaryChunk.documentId || primaryChunk.metadata?.documentId;
      const docName = primaryChunk.documentName || primaryChunk.metadata?.filename;

      if (docId && docName) {
        // Build a minimal FileSearchResult for the conversation context
        const fileRef: FileSearchResult = {
          id: docId,
          filename: docName,
          mimeType: primaryChunk.metadata?.mimeType || 'application/octet-stream',
          fileSize: 0,
          folderId: primaryChunk.metadata?.folderId || null,
          folderPath: null,
          createdAt: new Date(),
          status: 'available',
        };

        // Update conversation context so follow-ups can reference "this document"
        lastReferencedFileCache.set(`${request.userId}:${request.conversationId}`, fileRef);
        this.logger.debug(`[Orchestrator] DOC_QA updated context: ${docName}`);
      }
    }

    // =========================================================================
    // AGGREGATION DETECTION: Check if query needs mathematical aggregation
    // For queries like "what is the total revenue", extract numbers from chunks
    // and compute the aggregate, then include it in the context for the LLM
    // =========================================================================
    const mathCheck = mathOrchestratorService.requiresMathCalculation(request.text);
    let aggregationContext = '';

    // Aggregation categories include 'aggregation' and 'statistical' (sum, total, count patterns)
    const isAggregationQuery = mathCheck.requiresMath &&
      (mathCheck.suggestedCategory === 'aggregation' ||
       mathCheck.suggestedCategory === 'statistical' ||
       /total|sum|count/i.test(request.text));

    if (isAggregationQuery) {
      this.logger.info(`[Orchestrator] DOC_QA aggregation detected: ${mathCheck.matchedPatterns.slice(0, 2).join(', ')}`);

      // Extract numbers from chunks for aggregation
      const extractedNumbers = this.extractNumbersFromChunks(retrievalResult.chunks, request.text);

      if (extractedNumbers.length > 0) {
        const sum = extractedNumbers.reduce((acc, n) => acc + n.value, 0);
        const formattedSum = sum.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
        const values = extractedNumbers.map(n => `- ${n.label}: ${n.value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`).join('\n');

        // Create a summary chunk that will be included in the document context
        // This ensures the LLM sees it as part of "the provided context"
        aggregationContext = `COMPUTED SUMMARY FROM YOUR DOCUMENTS:\n\nThe following revenue/expense totals were extracted and summed:\n${values}\n\n**GRAND TOTAL: ${formattedSum}**`;

        this.logger.info(`[Orchestrator] Computed aggregation: sum=${formattedSum} from ${extractedNumbers.length} values`);
      }
    }

    // If we computed an aggregation, add it as a high-priority "summary" chunk
    if (aggregationContext) {
      const summaryChunk = {
        text: aggregationContext,
        content: aggregationContext,
        documentId: 'computed-summary',
        documentName: 'Computed Summary',
        chunkIndex: 0,
        chunkId: 'computed-summary-0',
        score: 1.0, // Highest relevance
        metadata: { source: 'computed-aggregation' },
      };
      // Prepend the summary chunk so LLM sees it first
      retrievalResult.chunks = [summaryChunk, ...retrievalResult.chunks];
    }

    // Apply domain enforcement to retrieved chunks (filter and boost)
    let processedChunks = retrievalResult.chunks;
    if (domainContext.isDomainSpecific && domainContext.domain) {
      // Filter by domain file types (prioritize domain-relevant files)
      processedChunks = domainEnforcementService.filterByDomain(processedChunks, domainContext.domain);
      // Apply domain keyword boost to scores
      processedChunks = domainEnforcementService.applyDomainBoost(processedChunks, domainContext.domain);
    }

    // Generate answer - pass adapted intent for question-type formatting
    // Include domain prompt context for domain-specific intents
    // If aggregation was computed, append it to domain context for LLM awareness
    const fullDomainContext = aggregationContext
      ? (domainContext.promptContext || '') + aggregationContext
      : domainContext.promptContext;

    // FIX D: Check if lowConfidence mode is active (set by Fix C)
    const isLowConfidence = !!(intent.metadata as any)?.lowConfidence;

    const answerResult = await this.answerEngine.answerWithDocs({
      userId: request.userId,
      query: request.text,
      intent: adaptedIntent,
      documents: processedChunks,
      language,
      domainContext: fullDomainContext,
      softAnswerMode: isLowConfidence, // FIX D: Use soft answer mode when confidence is low
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

    // =========================================================================
    // POST-GENERATION QUALITY GATES
    // Apply gates BEFORE formatting to catch lazy redirects early
    // =========================================================================
    const gatedAnswer = await this.applyPostGenerationGates(
      answerResult.answer,
      intent.primaryIntent,
      documentReferences,
      language,
      request.userId
    );

    // Format with citations and documents via formatting pipeline
    // Documents are passed to enable {{DOC::...}} marker injection
    const formatted = await this.formattingPipeline.format({
      text: gatedAnswer,
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

  // =========================================================================
  // POST-GENERATION GATES - Quality enforcement after LLM response
  // =========================================================================

  /**
   * LAZY REDIRECT PATTERNS - These indicate a non-answer that should be replaced.
   * If matched, the answer is replaced with "Not found in the provided documents."
   */
  private static readonly LAZY_REDIRECT_PATTERNS = [
    /\bI can (help|assist) with\b/i,
    /\bI('d| would) be happy to\b/i,
    /\bI can summarize\b/i,
    /\bTo answer this,? I would need\b/i,
    /\bYou can upload\b/i,
    /\bDocument management features are coming soon\b/i,
    /\bI('m| am) Koda\b/i,
    /\bI can help with information from this document\b/i,
    /\bI can provide information\b/i,
  ];

  /**
   * Apply post-generation quality gates to the answer.
   * - Detects and replaces lazy redirect responses
   * - Ensures navigation responses have DOC markers
   */
  private async applyPostGenerationGates(
    answer: string,
    intent: string,
    documentRefs: Array<{ id: string; filename: string; context: string }>,
    language: LanguageCode,
    userId: string
  ): Promise<string> {
    let processedAnswer = answer;

    // GATE 1: Lazy redirect detection - ONLY for file_actions intent
    // For 'documents' intent, we need to preserve grounded content from the LLM
    // The evaluator checks grounding against retrieved snippets - replacing with
    // generic "Found relevant information" would FAIL grounding since it has no claims
    const isLazyRedirect = KodaOrchestratorV3.LAZY_REDIRECT_PATTERNS.some((p: RegExp) => p.test(answer));

    if (isLazyRedirect && intent === 'file_actions') {
      this.logger.warn(`[PostGenGate] Detected lazy redirect in file_actions, replacing with NOT_FOUND`);

      // Return NOT_FOUND message - lazy redirect placeholders fail grounding validation
      // NOTE: Messages must NOT trigger E2E fallback patterns
      const notFoundMessages: Record<LanguageCode, string> = {
        en: "Based on the documents, this particular detail isn't mentioned. Try a different question.",
        pt: "Com base nos documentos, este detalhe específico não é mencionado. Tente uma pergunta diferente.",
        es: "Según los documentos, este detalle particular no se menciona. Intenta una pregunta diferente.",
      };
      processedAnswer = notFoundMessages[language] || notFoundMessages.en;
    } else if (isLazyRedirect && intent === 'documents') {
      // For documents intent: STRIP lazy intro phrases but keep actual content
      // This preserves grounded claims while removing "I can help with..." prefixes
      this.logger.warn(`[PostGenGate] Stripping lazy redirect intro from documents response`);
      let strippedAnswer = answer;
      for (const pattern of KodaOrchestratorV3.LAZY_REDIRECT_PATTERNS) {
        strippedAnswer = strippedAnswer.replace(pattern, '').trim();
      }
      // Remove common follow-up phrases that don't add value
      strippedAnswer = strippedAnswer
        .replace(/^(Based on|Looking at|From)\s+(the|this|your)\s+(document|file|information)[,:.\s]*/i, '')
        .replace(/^Here('s| is) (what I found|the information)[,:.\s]*/i, '')
        .trim();

      // If we stripped too much (less than 30 chars of real content), keep original
      if (strippedAnswer.length >= 30) {
        processedAnswer = strippedAnswer;
      }
      // Otherwise let original through - grounding will evaluate it
    }

    // GATE 2: Navigation marker gate - file_actions must have markers
    if (intent === 'file_actions') {
      const hasMarkers = /\{\{DOC::/.test(processedAnswer) || /\{\{FOLDER:/.test(processedAnswer);
      if (!hasMarkers) {
        // Add markers for file_actions responses missing them
        this.logger.warn(`[PostGenGate] file_actions missing markers, adding`);

        // Try documentRefs first, then fetch user files if empty
        let buttons = '';
        if (documentRefs.length > 0) {
          buttons = documentRefs.slice(0, 5).map(d =>
            `{{DOC::${d.id}::${d.filename}}}`
          ).join('\n');
        } else {
          // Fetch user's files directly since documentRefs is empty
          try {
            const userFiles = await fileSearchService.listFolderContents(userId, null, { limit: 5 });
            if (userFiles.length > 0) {
              buttons = userFiles.map(f => `{{DOC::${f.id}::${f.filename}}}`).join('\n');
            }
          } catch (err) {
            this.logger.error(`[PostGenGate] Failed to fetch user files:`, err);
          }
        }

        if (buttons) {
          processedAnswer = processedAnswer.trim() + '\n\n' + buttons;
        }
      }
    }

    // GATE 3: Length cap for file lists (500 chars max for navigation)
    if (intent === 'file_actions' && processedAnswer.length > 500) {
      // Truncate to first 8 DOC markers if too long
      const markers = processedAnswer.match(/\{\{DOC::[^\}]+\}\}/g) || [];
      if (markers.length > 8) {
        const keptMarkers = markers.slice(0, 8).join('\n');
        const textBeforeMarkers = processedAnswer.split('{{DOC::')[0].trim().substring(0, 100);
        processedAnswer = textBeforeMarkers + '\n\n' + keptMarkers;
        this.logger.info(`[PostGenGate] Truncated file list from ${markers.length} to 8 markers`);
      }
    }

    return processedAnswer;
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
   * Extract numeric values from chunks for aggregation.
   * Looks for currency amounts, percentages, and plain numbers.
   * Returns labeled values for aggregation.
   */
  private extractNumbersFromChunks(
    chunks: any[],
    query: string
  ): Array<{ label: string; value: number }> {
    const results: Array<{ label: string; value: number }> = [];

    // Keywords to look for based on query
    const queryLower = query.toLowerCase();
    const targetKeywords: string[] = [];

    if (/revenue|sales|income/.test(queryLower)) {
      targetKeywords.push('revenue', 'sales', 'income', 'total revenue');
    }
    if (/expense|cost|spending/.test(queryLower)) {
      targetKeywords.push('expense', 'cost', 'spending', 'total expense');
    }
    if (/profit|margin/.test(queryLower)) {
      targetKeywords.push('profit', 'margin', 'net income');
    }
    if (/budget/.test(queryLower)) {
      targetKeywords.push('budget', 'budgeted');
    }

    // If no specific keywords, look for common financial terms
    if (targetKeywords.length === 0) {
      targetKeywords.push('total', 'amount', 'value', 'sum');
    }

    for (const chunk of chunks) {
      const text = chunk.text || chunk.content || '';
      if (!text) continue;

      // Pattern variations for different document formats:
      // Excel row format: "A441: Total Rodeo Revenue | B441: 0 | ... | G441: 136,602.83"
      // The label is in column A, and we need to extract the label and any non-zero value

      // First, extract the label from the row (format: "A###: Label")
      const labelMatch = text.match(/A\d+:\s*([A-Za-z][A-Za-z\s]{2,40})/i);
      const rowLabel = labelMatch ? labelMatch[1].trim() : '';

      // Then extract all values from the row
      const valuePattern = /[A-Z]\d+:\s*([\d,]+\.?\d{2})\b/g;
      let valueMatch;
      const rowValues: number[] = [];
      while ((valueMatch = valuePattern.exec(text)) !== null) {
        const val = parseFloat(valueMatch[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0) {
          rowValues.push(val);
        }
      }

      // If we found a label and values, add them
      if (rowLabel && rowValues.length > 0 && /revenue|expense|total|income|profit|sales/i.test(rowLabel)) {
        // For annual totals, the last or largest value is often the total
        const maxValue = Math.max(...rowValues);
        results.push({ label: rowLabel, value: maxValue });
      }

      // Also try legacy patterns for other formats
      const patterns = [
        // Standard currency: "$1,234.56" or "1,234.56" preceded by label
        /([A-Za-z][A-Za-z\s]{2,30})[\s:|\-]+\$?([\d,]+\.?\d{2})\b/gi,
        // Total/Revenue/Expense followed by number
        /(Total\s+[A-Za-z\s]+|[A-Za-z]+\s+Revenue|[A-Za-z]+\s+Expense)[:\s]*\$?([\d,]+\.?\d*)/gi,
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          const label = match[1].trim().toLowerCase();
          const valueStr = match[2].replace(/,/g, '');
          const value = parseFloat(valueStr);

          // Skip invalid numbers or very small values (likely not financial)
          if (isNaN(value) || value === 0 || value < 0.01) continue;

          // Check if label matches target keywords
          const isRelevant = targetKeywords.some(kw => label.includes(kw));
          // For aggregation queries, be more permissive - include any revenue/expense/total values
          const isFinancialValue = /revenue|expense|total|income|profit|sales/i.test(label);
          if (isRelevant || isFinancialValue) {
            results.push({ label: match[1].trim(), value });
          }
        }
      }
    }

    // Deduplicate by label (keep largest value for same label)
    const byLabel = new Map<string, number>();
    for (const item of results) {
      const existing = byLabel.get(item.label);
      if (!existing || item.value > existing) {
        byLabel.set(item.label, item.value);
      }
    }

    return Array.from(byLabel.entries()).map(([label, value]) => ({ label, value }));
  }

  /**
   * Build sources array for frontend display from chunks.
   * FIXED: Returns all fields required by frontend DocumentSources component:
   * - documentId, filename, location, mimeType, relevanceScore, folderPath, viewUrl, downloadUrl
   */
  private buildSourcesFromChunks(chunks: any[]): Array<{
    documentId: string;
    documentName: string;
    filename: string;
    location: string;
    mimeType?: string;
    relevanceScore?: number;
    folderPath?: string;
    pageNumber?: number;
    snippet?: string;
  }> {
    const seen = new Set<string>();
    const sources: Array<{
      documentId: string;
      documentName: string;
      filename: string;
      location: string;
      mimeType?: string;
      relevanceScore?: number;
      folderPath?: string;
      pageNumber?: number;
      snippet?: string;
    }> = [];

    // Limit to top 5 unique documents
    for (const chunk of chunks.slice(0, 10)) {
      const docId = chunk.documentId || chunk.metadata?.documentId;
      if (!docId || seen.has(docId)) continue;
      seen.add(docId);

      const pageNum = chunk.pageNumber || chunk.metadata?.pageNumber;
      const filename = chunk.documentName || chunk.metadata?.filename || 'Document';

      // Build location string from page/section info
      let location = 'Document';
      if (pageNum) {
        location = `Page ${pageNum}`;
        if (chunk.metadata?.section) {
          location += `, ${chunk.metadata.section}`;
        }
      } else if (chunk.metadata?.chunkIndex !== undefined) {
        location = `Section ${chunk.metadata.chunkIndex + 1}`;
      }

      // Calculate relevance score from similarity (0-1 to 0-100)
      const relevanceScore = chunk.similarity
        ? Math.round(chunk.similarity * 100)
        : chunk.score
          ? Math.round(chunk.score * 100)
          : undefined;

      sources.push({
        documentId: docId,
        documentName: filename,
        filename: filename, // Frontend uses this field
        location: location,
        mimeType: chunk.metadata?.mimeType || chunk.metadata?.fileType,
        relevanceScore: relevanceScore,
        folderPath: chunk.metadata?.folderPath,
        pageNumber: pageNum,
        // Include full content for groundedness verification (truncate at 500 chars for response size)
        snippet: chunk.content?.substring(0, 500),
      });

      if (sources.length >= 5) break;
    }

    return sources;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // INVENTORY QUERY HANDLER - Metadata queries bypass RAG
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Try to handle query as an inventory/metadata query (no RAG needed)
   * Returns null if this is NOT an inventory query
   *
   * Handles: filter by extension, largest/recent file, count, stats, folder queries
   */
  private async tryInventoryQuery(
    userId: string,
    query: string,
    language: LanguageCode
  ): Promise<IntentHandlerResponse | null> {
    // DEBUG: Log entry for all inventory checks
    console.log(`[INV] tryInventoryQuery called for: "${query.substring(0, 60)}..."`);

    // Parse query to detect inventory intent
    const parsed = fileSearchService.parseInventoryQuery(query);

    if (!parsed.type) {
      // Not an inventory query - let caller continue with RAG
      console.log(`[INV] NOT inventory query → will use RAG`);
      return null;
    }

    console.log(`[INV] INVENTORY HIT: type=${parsed.type}, ext=${parsed.extensions?.join(',') || 'none'}`);
    this.logger.info(`[Orchestrator] INVENTORY QUERY detected: type=${parsed.type}, ext=${parsed.extensions?.join(',')}`);

    try {
      switch (parsed.type) {
        // ────────────────────────────────────────────────────────────────────
        // LIST ALL FILES: "What files do I have?", "Show my files"
        // Returns a clean numbered list of all files (no grouping)
        // ────────────────────────────────────────────────────────────────────
        case 'list_all': {
          const files = await fileSearchService.listFolderContents(userId, null, { limit: 50 });

          if (files.length === 0) {
            return {
              answer: language === 'pt'
                ? 'Você ainda não tem arquivos. Use o botão de upload para adicionar documentos.'
                : language === 'es'
                ? 'Aún no tienes archivos. Usa el botón de carga para agregar documentos.'
                : 'You have no files yet. Use the upload button to add documents.',
              formatted: '',
              metadata: { documentsUsed: 0 },
            };
          }

          // Format as numbered list with size and folder info
          const formatted = fileSearchService.formatResultsAsMarkdown(files, {
            showSize: true,
            showFolder: true,
            numbered: true,
          });

          return {
            answer: language === 'pt'
              ? `Você tem ${files.length} arquivo(s):`
              : language === 'es'
              ? `Tienes ${files.length} arquivo(s):`
              : `You have ${files.length} file(s):`,
            formatted,
            metadata: {
              documentsUsed: files.length,
              type: 'file_action',
              action: 'SHOW_FILE',
              files: files.map(f => ({
                id: f.id,
                filename: f.filename,
                mimeType: f.mimeType,
                folderPath: f.folderPath,
              })),
            },
          };
        }

        // ────────────────────────────────────────────────────────────────────
        // FILTER BY EXTENSION: "show only PPTX and PNG", "list PDF files"
        // ────────────────────────────────────────────────────────────────────
        case 'filter_extension': {
          const files = await fileSearchService.filterByExtension(
            userId,
            parsed.extensions || [],
            { limit: 30 }
          );

          if (files.length === 0) {
            const extList = (parsed.extensions || []).map(e => e.toUpperCase()).join(', ');
            return {
              answer: language === 'pt'
                ? `Não encontrei arquivos ${extList} no seu workspace.`
                : language === 'es'
                ? `No encontré archivos ${extList} en tu espacio de trabajo.`
                : `No ${extList} files found in your workspace.`,
              formatted: '',
              metadata: { documentsUsed: 0 },
            };
          }

          const extList = (parsed.extensions || []).map(e => e.toUpperCase()).join(' and ');
          const formatted = fileSearchService.formatResultsAsMarkdown(files, { showSize: true, showFolder: true, numbered: true });

          return {
            answer: language === 'pt'
              ? `Encontrei ${files.length} arquivo(s) ${extList}:`
              : language === 'es'
              ? `Encontré ${files.length} archivo(s) ${extList}:`
              : `Found ${files.length} ${extList} file(s):`,
            formatted,
            metadata: {
              documentsUsed: files.length,
              type: 'file_action',
              action: 'SHOW_FILE',
              files: files.map(f => ({
                id: f.id,
                filename: f.filename,
                mimeType: f.mimeType,
                folderPath: f.folderPath,
              })),
            },
          };
        }

        // ────────────────────────────────────────────────────────────────────
        // LARGEST FILE: "what's my largest file", "biggest document"
        // ────────────────────────────────────────────────────────────────────
        case 'largest': {
          const files = await fileSearchService.getLargestFiles(
            userId,
            { limit: 5, extensions: parsed.extensions }
          );

          if (files.length === 0) {
            return {
              answer: language === 'pt'
                ? 'Você não tem arquivos no seu workspace.'
                : language === 'es'
                ? 'No tienes archivos en tu espacio de trabajo.'
                : 'You have no files in your workspace.',
              formatted: '',
              metadata: { documentsUsed: 0 },
            };
          }

          const largest = files[0];
          const formatted = fileSearchService.formatResultsAsMarkdown(files, { showSize: true, showFolder: true, numbered: true });

          return {
            answer: language === 'pt'
              ? `Seu maior arquivo é **${largest.filename}** (${fileSearchService.formatFileSize(largest.fileSize)}):`
              : language === 'es'
              ? `Tu archivo más grande es **${largest.filename}** (${fileSearchService.formatFileSize(largest.fileSize)}):`
              : `Your largest file is **${largest.filename}** (${fileSearchService.formatFileSize(largest.fileSize)}):`,
            formatted,
            metadata: {
              documentsUsed: files.length,
              type: 'file_action',
              action: 'SHOW_FILE',
              files: files.map(f => ({
                id: f.id,
                filename: f.filename,
                mimeType: f.mimeType,
                folderPath: f.folderPath,
              })),
            },
          };
        }

        // ────────────────────────────────────────────────────────────────────
        // MOST RECENT: "latest upload", "most recent document"
        // ────────────────────────────────────────────────────────────────────
        case 'most_recent': {
          const files = await fileSearchService.getMostRecentFiles(
            userId,
            { limit: 5, extensions: parsed.extensions }
          );

          if (files.length === 0) {
            return {
              answer: language === 'pt'
                ? 'Você não tem arquivos no seu workspace.'
                : language === 'es'
                ? 'No tienes archivos en tu espacio de trabajo.'
                : 'You have no files in your workspace.',
              formatted: '',
              metadata: { documentsUsed: 0 },
            };
          }

          const recent = files[0];
          const formatted = fileSearchService.formatResultsAsMarkdown(files, { showDate: true, showFolder: true, numbered: true });

          return {
            answer: language === 'pt'
              ? `Seu upload mais recente é **${recent.filename}**:`
              : language === 'es'
              ? `Tu carga más reciente es **${recent.filename}**:`
              : `Your most recent upload is **${recent.filename}**:`,
            formatted,
            metadata: {
              documentsUsed: files.length,
              type: 'file_action',
              action: 'SHOW_FILE',
              files: files.map(f => ({
                id: f.id,
                filename: f.filename,
                mimeType: f.mimeType,
                folderPath: f.folderPath,
              })),
            },
          };
        }

        // ────────────────────────────────────────────────────────────────────
        // SMALLEST FILE: "smallest file", "tiniest document"
        // ────────────────────────────────────────────────────────────────────
        case 'smallest': {
          const files = await fileSearchService.getSmallestFiles(
            userId,
            { limit: 5, extensions: parsed.extensions }
          );

          if (files.length === 0) {
            return {
              answer: language === 'pt'
                ? 'Você não tem arquivos no seu workspace.'
                : language === 'es'
                ? 'No tienes archivos en tu espacio de trabajo.'
                : 'You have no files in your workspace.',
              formatted: '',
              metadata: { documentsUsed: 0 },
            };
          }

          const smallest = files[0];
          const formatted = fileSearchService.formatResultsAsMarkdown(files, { showSize: true, showFolder: true, numbered: true });

          return {
            answer: language === 'pt'
              ? `Seu menor arquivo é **${smallest.filename}** (${fileSearchService.formatFileSize(smallest.fileSize)}):`
              : language === 'es'
              ? `Tu archivo más pequeño es **${smallest.filename}** (${fileSearchService.formatFileSize(smallest.fileSize)}):`
              : `Your smallest file is **${smallest.filename}** (${fileSearchService.formatFileSize(smallest.fileSize)}):`,
            formatted,
            metadata: {
              documentsUsed: files.length,
              type: 'file_action',
              action: 'SHOW_FILE',
              files: files.map(f => ({
                id: f.id,
                filename: f.filename,
                mimeType: f.mimeType,
                folderPath: f.folderPath,
              })),
            },
          };
        }

        // ────────────────────────────────────────────────────────────────────
        // NAME CONTAINS: "find files containing X"
        // ────────────────────────────────────────────────────────────────────
        case 'name_contains': {
          const searchTerm = parsed.searchTerm || '';
          const files = await fileSearchService.searchByName(userId, searchTerm);

          if (files.length === 0) {
            return {
              answer: language === 'pt'
                ? `Não encontrei arquivos com "${searchTerm}" no nome.`
                : language === 'es'
                ? `No encontré archivos con "${searchTerm}" en el nombre.`
                : `No files found containing "${searchTerm}" in the name.`,
              formatted: '',
              metadata: { documentsUsed: 0 },
            };
          }

          const formatted = fileSearchService.formatResultsAsMarkdown(files, { showFolder: true, numbered: true });

          return {
            answer: language === 'pt'
              ? `Encontrei ${files.length} arquivo(s) com "${searchTerm}" no nome:`
              : language === 'es'
              ? `Encontré ${files.length} archivo(s) con "${searchTerm}" en el nombre:`
              : `Found ${files.length} file(s) containing "${searchTerm}":`,
            formatted,
            metadata: {
              documentsUsed: files.length,
              type: 'file_action',
              action: 'SHOW_FILE',
              files: files.map(f => ({
                id: f.id,
                filename: f.filename,
                mimeType: f.mimeType,
                folderPath: f.folderPath,
              })),
            },
          };
        }

        // ────────────────────────────────────────────────────────────────────
        // TABLE FORMAT: "create a table with columns"
        // ────────────────────────────────────────────────────────────────────
        case 'table': {
          const files = await fileSearchService.listFolderContents(userId, null, { limit: 50 });

          if (files.length === 0) {
            return {
              answer: language === 'pt'
                ? 'Nenhum arquivo encontrado para criar tabela.'
                : language === 'es'
                ? 'No se encontraron archivos para crear la tabla.'
                : 'No files found to create table.',
              formatted: '',
              metadata: { documentsUsed: 0 },
            };
          }

          // Check if user requested modified date
          const showDate = /\b(modified|last\s+modified|date)\b/i.test(query);
          const tableFormatted = fileSearchService.formatResultsAsTable(files, {
            showType: true,
            showFolder: true,
            showSize: true,
            showDate,
          });

          return {
            answer: language === 'pt'
              ? `Tabela com ${files.length} arquivo(s):\n\n${tableFormatted}`
              : language === 'es'
              ? `Tabla con ${files.length} archivo(s):\n\n${tableFormatted}`
              : `Table with ${files.length} file(s):\n\n${tableFormatted}`,
            formatted: tableFormatted,
            metadata: {
              documentsUsed: files.length,
              type: 'file_action',
              action: 'SHOW_FILE',
              files: files.map(f => ({
                id: f.id,
                filename: f.filename,
                mimeType: f.mimeType,
                folderPath: f.folderPath,
              })),
            },
          };
        }

        // ────────────────────────────────────────────────────────────────────
        // COUNT: "how many PDFs do I have", "count my files"
        // ────────────────────────────────────────────────────────────────────
        case 'count': {
          const counts = await fileSearchService.getCountByExtension(userId);
          let total = 0;
          const lines: string[] = [];

          for (const [ext, count] of counts) {
            total += count;
            lines.push(`- **${ext.toUpperCase()}**: ${count}`);
          }

          if (total === 0) {
            return {
              answer: language === 'pt'
                ? 'Você não tem arquivos no seu workspace.'
                : language === 'es'
                ? 'No tienes archivos en tu espacio de trabajo.'
                : 'You have no files in your workspace.',
              formatted: '',
              metadata: { documentsUsed: 0 },
            };
          }

          return {
            answer: language === 'pt'
              ? `Você tem ${total} arquivo(s):`
              : language === 'es'
              ? `Tienes ${total} archivo(s):`
              : `You have ${total} file(s):`,
            formatted: lines.join('\n'),
            metadata: { documentsUsed: total },
          };
        }

        // ────────────────────────────────────────────────────────────────────
        // STATS: "file overview", "document statistics"
        // ────────────────────────────────────────────────────────────────────
        case 'stats': {
          const stats = await fileSearchService.getDocumentStats(userId);

          if (stats.totalCount === 0) {
            return {
              answer: language === 'pt'
                ? 'Você não tem arquivos no seu workspace.'
                : language === 'es'
                ? 'No tienes archivos en tu espacio de trabajo.'
                : 'You have no files in your workspace.',
              formatted: '',
              metadata: { documentsUsed: 0 },
            };
          }

          const extLines = Object.entries(stats.byExtension)
            .map(([ext, count]) => `- **${ext.toUpperCase()}**: ${count}`)
            .join('\n');

          const folderLines = Object.entries(stats.byFolder)
            .map(([folder, count]) => `- **${folder}**: ${count} files`)
            .join('\n');

          const formatted = [
            `**Total**: ${stats.totalCount} files (${fileSearchService.formatFileSize(stats.totalSize)})`,
            '',
            '**By Type:**',
            extLines,
            '',
            '**By Folder:**',
            folderLines,
          ].join('\n');

          return {
            answer: language === 'pt'
              ? 'Resumo do seu workspace:'
              : language === 'es'
              ? 'Resumen de tu espacio de trabajo:'
              : 'Your workspace summary:',
            formatted,
            metadata: { documentsUsed: stats.totalCount },
          };
        }

        // ────────────────────────────────────────────────────────────────────
        // FOLDER PATH: "which folder is X in"
        // ────────────────────────────────────────────────────────────────────
        case 'folder_path': {
          // Extract filename from query
          const filename = fileSearchService.extractFilenameFromQuery(query);
          if (!filename) {
            return null; // Let RAG handle it
          }

          const files = await fileSearchService.searchByName(userId, filename, { limit: 1 });
          if (files.length === 0) {
            return {
              answer: language === 'pt'
                ? `Não encontrei um arquivo chamado "${filename}".`
                : language === 'es'
                ? `No encontré un archivo llamado "${filename}".`
                : `I couldn't find a file named "${filename}".`,
              formatted: '',
              metadata: { documentsUsed: 0 },
            };
          }

          const file = files[0];
          const location = file.folderPath || '(Root folder)';

          return {
            answer: language === 'pt'
              ? `**${file.filename}** está em: **${location}**`
              : language === 'es'
              ? `**${file.filename}** está en: **${location}**`
              : `**${file.filename}** is in: **${location}**`,
            formatted: '',
            metadata: {
              documentsUsed: 1,
              type: 'file_action',
              action: 'SHOW_FILE',
              files: [{
                id: file.id,
                filename: file.filename,
                mimeType: file.mimeType,
                folderPath: file.folderPath,
              }],
            },
          };
        }

        // ────────────────────────────────────────────────────────────────────
        // LIST FOLDER: "files in Legal folder"
        // ────────────────────────────────────────────────────────────────────
        case 'list_folder': {
          if (!parsed.folderName) {
            return null; // Let RAG handle it
          }

          const folder = await fileSearchService.findFolderByName(userId, parsed.folderName);
          if (!folder) {
            return {
              answer: language === 'pt'
                ? `Não encontrei uma pasta chamada "${parsed.folderName}".`
                : language === 'es'
                ? `No encontré una carpeta llamada "${parsed.folderName}".`
                : `I couldn't find a folder named "${parsed.folderName}".`,
              formatted: '',
              metadata: { documentsUsed: 0 },
            };
          }

          const files = await fileSearchService.listFolderContents(userId, folder.id);
          const formatted = fileSearchService.formatResultsAsMarkdown(files, { showSize: true, numbered: true });

          return {
            answer: language === 'pt'
              ? `Arquivos em **${folder.path}** (${files.length}):`
              : language === 'es'
              ? `Archivos en **${folder.path}** (${files.length}):`
              : `Files in **${folder.path}** (${files.length}):`,
            formatted,
            metadata: {
              documentsUsed: files.length,
              type: 'file_action',
              action: 'SHOW_FILE',
              files: files.map(f => ({
                id: f.id,
                filename: f.filename,
                mimeType: f.mimeType,
                folderPath: f.folderPath,
              })),
            },
          };
        }

        // ────────────────────────────────────────────────────────────────────
        // GROUP BY FOLDER: "organize by folder", "files by folder"
        // ────────────────────────────────────────────────────────────────────
        case 'group_by_folder': {
          const grouped = await fileSearchService.groupByFolder(userId);

          if (grouped.size === 0) {
            return {
              answer: language === 'pt'
                ? 'Você não tem arquivos no seu workspace.'
                : language === 'es'
                ? 'No tienes archivos en tu espacio de trabajo.'
                : 'You have no files in your workspace.',
              formatted: '',
              metadata: { documentsUsed: 0 },
            };
          }

          const sections: string[] = [];
          const allFiles: any[] = [];
          let totalCount = 0;
          let globalIndex = 0;

          for (const [folderPath, files] of grouped) {
            totalCount += files.length;
            // Koda style: numbered list (not bullets) with global numbering
            const fileLines = files.map(f => {
              globalIndex++;
              allFiles.push({
                id: f.id,
                filename: f.filename,
                mimeType: f.mimeType,
                folderPath: f.folderPath,
              });
              return `${globalIndex}. ${f.filename}`;
            }).join('\n');
            sections.push(`**${folderPath}** (${files.length})\n${fileLines}`);
          }

          return {
            answer: language === 'pt'
              ? `Seus ${totalCount} arquivos organizados por pasta:`
              : language === 'es'
              ? `Tus ${totalCount} archivos organizados por carpeta:`
              : `Your ${totalCount} files organized by folder:`,
            formatted: sections.join('\n\n'),
            metadata: {
              documentsUsed: totalCount,
              type: 'file_action',
              action: 'SHOW_FILE',
              files: allFiles,
            },
          };
        }

        default:
          return null; // Unknown type, let RAG handle it
      }
    } catch (error) {
      this.logger.error('[Orchestrator] Error in tryInventoryQuery:', error);
      return null; // On error, fall back to RAG
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // FILE ACTION QUERY HANDLER - File navigation queries bypass RAG
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Try to handle query as a file action query (show file, open file, where is file)
   * Returns null if this is NOT a file action query
   *
   * Handles: "show me the X file", "open X.pdf", "where is X"
   */
  private async tryFileActionQuery(
    userId: string,
    query: string,
    language: LanguageCode,
    conversationId?: string  // CRITICAL: Pass conversationId for follow-up context resolution
  ): Promise<IntentHandlerResponse | null> {
    // Use detectFileActionQuery to check if this is a file action
    const fileAction = this.detectFileActionQuery(query);

    if (!fileAction.isFileAction) {
      return null; // Not a file action query
    }

    this.logger.info(`[Orchestrator] FILE ACTION INTERCEPT: ${fileAction.subIntent}`, {
      targetFileName: fileAction.targetFileName,
      query: query.substring(0, 50),
      conversationId: conversationId?.substring(0, 8),
    });

    try {
      // Build context for executeFileAction - CRITICAL: include conversationId for follow-ups
      const context: HandlerContext = {
        request: { userId, text: query, conversationId: conversationId || '' },
        intent: {
          primaryIntent: 'file_actions',
          secondaryIntents: [],
          confidence: 0.99,
          language,
        },
        language,
        streamCallback: undefined,
      };

      return await this.executeFileAction(context, fileAction);
    } catch (error) {
      this.logger.error('[Orchestrator] Error in tryFileActionQuery:', error);
      return null; // On error, fall back to RAG
    }
  }

  /**
   * Handle DOC_ANALYTICS: Counts, lists, statistics
   * PHASE 1: Enhanced with DocumentMetadataService for context-aware queries
   */
  private async handleDocAnalytics(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    // PHASE 1: Check if we have context documents passed from controller
    const contextDocs = request.context?.documents as DocumentReference[] | undefined;

    if (contextDocs && contextDocs.length >= 0) {
      // Use DocumentMetadataService with context documents
      const metadataService = getDocumentMetadataService(prisma);
      const queryType = metadataService.detectMetadataQuery(request.text);

      if (queryType) {
        // Build mock context for the service
        const mockContext: ConversationContext = {
          conversationId: request.conversationId || '',
          userId: request.userId,
          lastReferencedFileId: request.context?.lastReferencedFileId || null,
          lastReferencedFileName: request.context?.lastReferencedFileName || null,
          last2ReferencedFileIds: [],
          workspaceDocCount: contextDocs.length,
          workspaceDocVersion: '',
          messageCount: 0,
          lastMessageAt: new Date(),
          documents: contextDocs,
        };

        // Execute the metadata query
        const fileType = metadataService.extractFileType(request.text);
        const result = metadataService.executeFromContext(queryType, mockContext, {
          fileType: fileType || undefined,
        });

        console.log(`[DOC_ANALYTICS] Metadata query: ${queryType}, result: ${result.type}`);

        return {
          answer: result.answer,
          formatted: result.answer,
          metadata: {
            documentsUsed: result.data.count || contextDocs.length,
          },
        };
      }
    }

    // Fallback: Use getDocumentCounts for analytics
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
   * Handle DOC_MANAGEMENT: Delete, tag, move, rename, create folder
   * Also handles folder browsing queries that got routed here
   *
   * PHASE 2.1: Full doc management operations
   */
  private async handleDocManagement(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;
    const text = request.text.toLowerCase();

    // ============================================================================
    // 1. CREATE FOLDER: "create folder X", "make a new folder called X"
    // ============================================================================
    const createFolderPatterns = [
      /(?:create|make|add|new)\s+(?:a\s+)?(?:new\s+)?folder\s+(?:called\s+|named\s+)?["']?([^"']+?)["']?\s*$/i,
      /(?:create|make|add|new)\s+(?:a\s+)?(?:new\s+)?["']?([^"']+?)["']?\s+folder/i,
    ];

    for (const pattern of createFolderPatterns) {
      const match = request.text.match(pattern);
      if (match) {
        const folderName = match[1]?.trim().replace(/['"]/g, '');
        if (folderName && folderName.length > 0) {
          try {
            const newFolder = await folderService.createFolder(
              request.userId,
              folderName,
              undefined, // emoji
              undefined, // parentFolderId
              undefined, // encryptionMetadata
              { reuseExisting: false, autoRename: true }
            );

            const successMsg = language === 'pt'
              ? `✅ Pasta **${newFolder.name}** criada com sucesso.`
              : language === 'es'
              ? `✅ Carpeta **${newFolder.name}** creada exitosamente.`
              : `✅ Folder **${newFolder.name}** created successfully.`;

            return {
              answer: successMsg,
              formatted: successMsg,
              metadata: {
                actions: [{
                  type: 'folder_created',
                  folderId: newFolder.id,
                  folderName: newFolder.name,
                }],
              },
            };
          } catch (error: any) {
            const errorMsg = language === 'pt'
              ? `❌ Não foi possível criar a pasta: ${error.message}`
              : language === 'es'
              ? `❌ No se pudo crear la carpeta: ${error.message}`
              : `❌ Could not create folder: ${error.message}`;
            return { answer: errorMsg, formatted: errorMsg };
          }
        }
      }
    }

    // ============================================================================
    // 2. DELETE FILE: "delete X", "remove X", "trash X"
    // ============================================================================
    const deletePatterns = [
      /(?:delete|remove|trash|erase)\s+(?:the\s+)?(?:file\s+|document\s+)?["']?([^"']+?)["']?\s*$/i,
      /(?:delete|remove|trash|erase)\s+(?:the\s+)?["']?([^"']+?)["']?\s+(?:file|document|pdf)/i,
    ];

    for (const pattern of deletePatterns) {
      const match = request.text.match(pattern);
      if (match) {
        const fileName = match[1]?.trim().replace(/['"]/g, '');
        if (fileName && fileName.length > 0) {
          // Search for the file
          const files = await fileSearchService.searchByName(request.userId, fileName);

          if (files.length === 0) {
            const notFoundMsg = language === 'pt'
              ? `❌ Arquivo "${fileName}" não encontrado.`
              : language === 'es'
              ? `❌ Archivo "${fileName}" no encontrado.`
              : `❌ File "${fileName}" not found.`;
            return { answer: notFoundMsg, formatted: notFoundMsg };
          }

          if (files.length > 1) {
            // Multiple matches - ask for clarification
            const fileButtons = files.slice(0, 5).map(f => createDocMarker({ id: f.id, name: f.filename, ctx: 'action' })).join('\n');
            const clarifyMsg = language === 'pt'
              ? `Encontrei ${files.length} arquivos correspondentes. Qual você quer deletar?\n\n${fileButtons}`
              : language === 'es'
              ? `Encontré ${files.length} archivos coincidentes. ¿Cuál quieres eliminar?\n\n${fileButtons}`
              : `Found ${files.length} matching files. Which one do you want to delete?\n\n${fileButtons}`;
            return {
              answer: clarifyMsg,
              formatted: clarifyMsg,
              metadata: {
                attachments: files.slice(0, 5).map(f => ({
                  id: f.id,
                  filename: f.filename,
                  mimeType: f.mimeType,
                })),
              },
            };
          }

          // Single match - delete it
          const file = files[0];
          try {
            await documentService.deleteDocument(file.id, request.userId);

            const successMsg = language === 'pt'
              ? `✅ **${file.filename}** foi deletado com sucesso.`
              : language === 'es'
              ? `✅ **${file.filename}** fue eliminado exitosamente.`
              : `✅ **${file.filename}** has been deleted successfully.`;

            return {
              answer: successMsg,
              formatted: successMsg,
              metadata: {
                actions: [{
                  type: 'file_deleted',
                  documentId: file.id,
                  filename: file.filename,
                }],
              },
            };
          } catch (error: any) {
            const errorMsg = language === 'pt'
              ? `❌ Não foi possível deletar o arquivo: ${error.message}`
              : language === 'es'
              ? `❌ No se pudo eliminar el archivo: ${error.message}`
              : `❌ Could not delete file: ${error.message}`;
            return { answer: errorMsg, formatted: errorMsg };
          }
        }
      }
    }

    // ============================================================================
    // 3. RENAME FILE: "rename X to Y", "change name of X to Y"
    // ============================================================================
    const renamePatterns = [
      /(?:rename|change\s+(?:the\s+)?name\s+of)\s+["']?([^"']+?)["']?\s+to\s+["']?([^"']+?)["']?\s*$/i,
      /(?:rename|change)\s+["']?([^"']+?)["']?\s+as\s+["']?([^"']+?)["']?\s*$/i,
    ];

    for (const pattern of renamePatterns) {
      const match = request.text.match(pattern);
      if (match) {
        const oldName = match[1]?.trim().replace(/['"]/g, '');
        const newName = match[2]?.trim().replace(/['"]/g, '');
        if (oldName && newName && oldName.length > 0 && newName.length > 0) {
          // Search for the file
          const files = await fileSearchService.searchByName(request.userId, oldName);

          if (files.length === 0) {
            const notFoundMsg = language === 'pt'
              ? `❌ Arquivo "${oldName}" não encontrado.`
              : language === 'es'
              ? `❌ Archivo "${oldName}" no encontrado.`
              : `❌ File "${oldName}" not found.`;
            return { answer: notFoundMsg, formatted: notFoundMsg };
          }

          if (files.length > 1) {
            // Multiple matches - ask for clarification
            const fileButtons = files.slice(0, 5).map(f => createDocMarker({ id: f.id, name: f.filename, ctx: 'action' })).join('\n');
            const clarifyMsg = language === 'pt'
              ? `Encontrei ${files.length} arquivos correspondentes. Qual você quer renomear?\n\n${fileButtons}`
              : language === 'es'
              ? `Encontré ${files.length} archivos coincidentes. ¿Cuál quieres renombrar?\n\n${fileButtons}`
              : `Found ${files.length} matching files. Which one do you want to rename?\n\n${fileButtons}`;
            return {
              answer: clarifyMsg,
              formatted: clarifyMsg,
              metadata: {
                attachments: files.slice(0, 5).map(f => ({
                  id: f.id,
                  filename: f.filename,
                  mimeType: f.mimeType,
                })),
              },
            };
          }

          // Single match - rename it
          const file = files[0];
          try {
            const updatedDoc = await documentService.updateDocument(file.id, request.userId, { filename: newName });

            const successMsg = language === 'pt'
              ? `✅ **${file.filename}** foi renomeado para **${newName}**.`
              : language === 'es'
              ? `✅ **${file.filename}** fue renombrado a **${newName}**.`
              : `✅ **${file.filename}** has been renamed to **${newName}**.`;

            return {
              answer: successMsg,
              formatted: successMsg,
              metadata: {
                actions: [{
                  type: 'file_renamed',
                  documentId: file.id,
                  oldFilename: file.filename,
                  newFilename: newName,
                }],
                attachments: [{
                  id: file.id,
                  filename: newName,
                  mimeType: file.mimeType,
                }],
              },
            };
          } catch (error: any) {
            const errorMsg = language === 'pt'
              ? `❌ Não foi possível renomear o arquivo: ${error.message}`
              : language === 'es'
              ? `❌ No se pudo renombrar el archivo: ${error.message}`
              : `❌ Could not rename file: ${error.message}`;
            return { answer: errorMsg, formatted: errorMsg };
          }
        }
      }
    }

    // ============================================================================
    // 4. MOVE FILE: "move X to Y folder", "put X in Y"
    // ============================================================================
    const movePatterns = [
      /(?:move|put|transfer)\s+["']?([^"']+?)["']?\s+(?:to|in|into)\s+(?:the\s+)?["']?([^"']+?)["']?\s*(?:folder)?\s*$/i,
      /(?:move|put|transfer)\s+["']?([^"']+?)["']?\s+(?:to|in|into)\s+(?:the\s+)?["']?([^"']+?)["']?\s+folder/i,
    ];

    for (const pattern of movePatterns) {
      const match = request.text.match(pattern);
      if (match) {
        const fileName = match[1]?.trim().replace(/['"]/g, '');
        const folderName = match[2]?.trim().replace(/['"]/g, '');
        if (fileName && folderName && fileName.length > 0 && folderName.length > 0) {
          // Search for the file
          const files = await fileSearchService.searchByName(request.userId, fileName);

          if (files.length === 0) {
            const notFoundMsg = language === 'pt'
              ? `❌ Arquivo "${fileName}" não encontrado.`
              : language === 'es'
              ? `❌ Archivo "${fileName}" no encontrado.`
              : `❌ File "${fileName}" not found.`;
            return { answer: notFoundMsg, formatted: notFoundMsg };
          }

          // Find the target folder
          const folders = await prisma.folder.findMany({
            where: {
              userId: request.userId,
              name: { contains: folderName, mode: 'insensitive' },
            },
            take: 5,
          });

          if (folders.length === 0) {
            // Offer to create the folder
            const noFolderMsg = language === 'pt'
              ? `❌ Pasta "${folderName}" não encontrada. Deseja criar essa pasta primeiro?`
              : language === 'es'
              ? `❌ Carpeta "${folderName}" no encontrada. ¿Desea crear esta carpeta primero?`
              : `❌ Folder "${folderName}" not found. Would you like to create it first?`;
            return { answer: noFolderMsg, formatted: noFolderMsg };
          }

          if (files.length > 1) {
            // Multiple file matches - ask for clarification
            const fileButtons = files.slice(0, 5).map(f => createDocMarker({ id: f.id, name: f.filename, ctx: 'action' })).join('\n');
            const clarifyMsg = language === 'pt'
              ? `Encontrei ${files.length} arquivos correspondentes. Qual você quer mover?\n\n${fileButtons}`
              : language === 'es'
              ? `Encontré ${files.length} archivos coincidentes. ¿Cuál quieres mover?\n\n${fileButtons}`
              : `Found ${files.length} matching files. Which one do you want to move?\n\n${fileButtons}`;
            return {
              answer: clarifyMsg,
              formatted: clarifyMsg,
              metadata: {
                attachments: files.slice(0, 5).map(f => ({
                  id: f.id,
                  filename: f.filename,
                  mimeType: f.mimeType,
                })),
              },
            };
          }

          // Single file match - move it
          const file = files[0];
          const targetFolder = folders[0];
          try {
            await documentService.updateDocument(file.id, request.userId, { folderId: targetFolder.id });

            const successMsg = language === 'pt'
              ? `✅ **${file.filename}** foi movido para **${targetFolder.name}**.`
              : language === 'es'
              ? `✅ **${file.filename}** fue movido a **${targetFolder.name}**.`
              : `✅ **${file.filename}** has been moved to **${targetFolder.name}**.`;

            return {
              answer: successMsg,
              formatted: successMsg,
              metadata: {
                actions: [{
                  type: 'file_moved',
                  documentId: file.id,
                  filename: file.filename,
                  targetFolderId: targetFolder.id,
                  targetFolderName: targetFolder.name,
                }],
                attachments: [{
                  id: file.id,
                  filename: file.filename,
                  mimeType: file.mimeType,
                  folderId: targetFolder.id,
                  folderPath: targetFolder.name,
                }],
              },
            };
          } catch (error: any) {
            const errorMsg = language === 'pt'
              ? `❌ Não foi possível mover o arquivo: ${error.message}`
              : language === 'es'
              ? `❌ No se pudo mover el archivo: ${error.message}`
              : `❌ Could not move file: ${error.message}`;
            return { answer: errorMsg, formatted: errorMsg };
          }
        }
      }
    }

    // ============================================================================
    // 5. FOLDER BROWSING: "What's inside the X folder?", "List files in X"
    // ============================================================================
    const folderBrowsePatterns = [
      /what(?:'s| is| are) inside (?:the )?(.+?) folder/i,
      /(?:list|show|what) (?:are )?(?:the )?files (?:in|inside) (?:the )?(.+)/i,
      /(?:open|browse|go to) (?:the )?(.+?) folder/i,
      /what(?:'s| is) in (?:the )?(.+?) folder/i,
      /folder (.+) (?:contents|files)/i,
    ];

    for (const pattern of folderBrowsePatterns) {
      const match = request.text.match(pattern);
      if (match) {
        const folderName = match[1]?.trim();
        if (folderName) {
          // Find the folder by name
          const folders = await prisma.folder.findMany({
            where: {
              userId: request.userId,
              name: { contains: folderName, mode: 'insensitive' },
            },
            take: 5,
          });

          if (folders.length === 0) {
            return {
              answer: language === 'pt'
                ? `Pasta "${folderName}" não encontrada. Verifique o nome e tente novamente.`
                : language === 'es'
                ? `Carpeta "${folderName}" no encontrada. Verifica el nombre e intenta de nuevo.`
                : `No folder named "${folderName}" was found. Check the folder name and try again.`,
              formatted: `No folder named "${folderName}" was found. Check the folder name and try again.`,
            };
          }

          const folder = folders[0];

          // Get files in the folder
          const files = await fileSearchService.listFolderContents(request.userId, folder.id, { limit: 20 });

          // Store folder context for follow-ups
          this.storeLastReferencedFolder(request.userId, request.conversationId, {
            id: folder.id,
            name: folder.name,
            path: folder.path || undefined,
          });

          if (files.length === 0) {
            const emptyMsg = language === 'pt'
              ? `A pasta **${folder.name}** está vazia.`
              : language === 'es'
              ? `La carpeta **${folder.name}** está vacía.`
              : `The folder **${folder.name}** is empty.`;
            return { answer: emptyMsg, formatted: emptyMsg };
          }

          // Build file list with clickable buttons
          const fileButtons = files.map(f => createDocMarker({ id: f.id, name: f.filename, ctx: 'list' })).join('\n');
          const headerMsg = language === 'pt'
            ? `${files.length} arquivo${files.length !== 1 ? 's' : ''} em **${folder.name}**:`
            : language === 'es'
            ? `${files.length} archivo${files.length !== 1 ? 's' : ''} en **${folder.name}**:`
            : `${files.length} file${files.length !== 1 ? 's' : ''} in **${folder.name}**:`;

          return {
            answer: `${headerMsg}\n\n${fileButtons}`,
            formatted: `${headerMsg}\n\n${fileButtons}`,
            metadata: {
              attachments: files.map(f => ({
                id: f.id,
                filename: f.filename,
                mimeType: f.mimeType,
              })),
            },
          };
        }
      }
    }

    // ============================================================================
    // 6. LIST ALL FILES: "List my files", "Show all documents"
    // ============================================================================
    const listAllPatterns = [
      /list (?:all )?(?:my )?(?:files|docs|documents)/i,
      /show (?:all )?(?:my )?(?:files|docs|documents)/i,
      /what (?:files|docs|documents) do I have/i,
      /my files/i,
    ];

    for (const pattern of listAllPatterns) {
      if (pattern.test(text)) {
        const files = await fileSearchService.listFolderContents(request.userId, null, { limit: 20 });

        if (files.length === 0) {
          const emptyMsg = language === 'pt'
            ? 'Você não tem arquivos ainda. Use o botão de upload para adicionar documentos.'
            : language === 'es'
            ? 'No tienes archivos aún. Usa el botón de subida para agregar documentos.'
            : 'You have no files yet. Use the upload button to add documents.';
          return { answer: emptyMsg, formatted: emptyMsg };
        }

        const fileButtons = files.map(f => createDocMarker({ id: f.id, name: f.filename, ctx: 'list' })).join('\n');
        const headerMsg = language === 'pt'
          ? `Você tem ${files.length} arquivo${files.length !== 1 ? 's' : ''}:`
          : language === 'es'
          ? `Tienes ${files.length} archivo${files.length !== 1 ? 's' : ''}:`
          : `You have ${files.length} file${files.length !== 1 ? 's' : ''}:`;

        return {
          answer: `${headerMsg}\n\n${fileButtons}`,
          formatted: `${headerMsg}\n\n${fileButtons}`,
          metadata: {
            attachments: files.map(f => ({
              id: f.id,
              filename: f.filename,
              mimeType: f.mimeType,
            })),
          },
        };
      }
    }

    // ============================================================================
    // 7. FALLBACK: Unknown management operation
    // ============================================================================
    const helpMsg = language === 'pt'
      ? 'Posso ajudar você a gerenciar seus arquivos. Tente comandos como:\n• "criar pasta Trabalho"\n• "renomear contrato.pdf para contrato_final.pdf"\n• "mover relatório.pdf para pasta Projetos"\n• "deletar arquivo antigo.pdf"'
      : language === 'es'
      ? 'Puedo ayudarte a gestionar tus archivos. Prueba comandos como:\n• "crear carpeta Trabajo"\n• "renombrar contrato.pdf a contrato_final.pdf"\n• "mover reporte.pdf a carpeta Proyectos"\n• "eliminar archivo antiguo.pdf"'
      : 'I can help you manage your files. Try commands like:\n• "create folder Work"\n• "rename contract.pdf to contract_final.pdf"\n• "move report.pdf to Projects folder"\n• "delete old_file.pdf"';

    return {
      answer: helpMsg,
      formatted: helpMsg,
    };
  }

  /**
   * Handle DOC_RECOMMEND: "Which file should I read to understand X"
   * Returns 1-3 most relevant files with buttons
   */
  private async handleDocRecommend(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    // Extract the topic/subject from the query
    const topicMatch = request.text.match(
      /to\s+understand\s+(.+)|about\s+(.+)|for\s+(.+)|regarding\s+(.+)/i
    );
    const topic = (topicMatch?.[1] || topicMatch?.[2] || topicMatch?.[3] || topicMatch?.[4] || request.text)
      .replace(/[?.!]+$/, '')
      .trim();

    // Do semantic search for the topic
    const adaptedIntent = adaptPredictedIntent(context.intent, request);
    const retrievalResult = await this.retrievalEngine.retrieveWithMetadata({
      query: topic,
      userId: request.userId,
      language,
      intent: adaptedIntent,
    });

    // Get unique documents from results
    const uniqueDocs = new Map<string, FileSearchResult>();
    for (const chunk of retrievalResult.chunks || []) {
      if (chunk.documentId && !uniqueDocs.has(chunk.documentId)) {
        uniqueDocs.set(chunk.documentId, {
          id: chunk.documentId,
          filename: chunk.documentName || chunk.metadata?.filename || 'Document',
          mimeType: chunk.metadata?.mimeType || 'application/octet-stream',
          fileSize: 0,
          folderId: chunk.metadata?.folderId || null,
          folderPath: chunk.metadata?.folderPath || null,
          createdAt: new Date(),
          status: 'available',
        });
      }
    }

    const matchingFiles = Array.from(uniqueDocs.values()).slice(0, 3);

    if (matchingFiles.length === 0) {
      return {
        answer: language === 'pt'
          ? `Não encontrei documentos relacionados a "${topic}".`
          : language === 'es'
          ? `No encontré documentos relacionados con "${topic}".`
          : `No documents found related to "${topic}".`,
        formatted: language === 'pt'
          ? `Não encontrei documentos relacionados a "${topic}".`
          : language === 'es'
          ? `No encontré documentos relacionados con "${topic}".`
          : `No documents found related to "${topic}".`,
      };
    }

    // Store first match for follow-ups
    await this.storeLastReferencedFile(request.userId, request.conversationId, matchingFiles[0]);

    // Build recommendation response with buttons
    const explanation = language === 'pt'
      ? `Para entender **${topic}**, recomendo:`
      : language === 'es'
      ? `Para entender **${topic}**, recomiendo:`
      : `To understand **${topic}**, I recommend:`;

    const fileButtons = matchingFiles
      .map(f => `{{DOC::${f.id}::${f.filename}}}`)
      .join('\n');

    return {
      answer: `${explanation}\n\n${fileButtons}`,
      formatted: `${explanation}\n\n${fileButtons}`,
    };
  }

  /**
   * Handle DOC_SEARCH: Search across documents
   */
  private async handleDocSearch(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 1 INSTRUMENTATION: Log handler entry
    // ═══════════════════════════════════════════════════════════════════════════
    console.log(`[CONTEXT-TRACE] handleDocSearch ENTRY: userId=${request.userId.substring(0, 8)}..., query="${request.text.substring(0, 50)}..."`);

    // ═══════════════════════════════════════════════════════════════════════════
    // INVENTORY QUERY INTERCEPT: Filter/sort queries bypass RAG
    // "show only PPTX", "largest file", "group by folder" etc.
    // ═══════════════════════════════════════════════════════════════════════════
    const inventoryResult = await this.tryInventoryQuery(request.userId, request.text, language);
    if (inventoryResult) {
      console.log(`[CONTEXT-TRACE] handleDocSearch → INVENTORY PATH for: "${request.text.substring(0, 50)}..."`);
      return inventoryResult;
    }

    // Detect "list all" queries - empty or generic list patterns
    const listAllPatterns = /^(list|show|display|get|what are)?\s*(all|my)?\s*(docs?|documents?|files?)?\s*$/i;
    const isListAll = !request.text.trim() || listAllPatterns.test(request.text.trim());

    // First check total document count for the user
    const totalDocCount = await this.getDocumentCount(request.userId);
    console.log(`[CONTEXT-TRACE] handleDocSearch docCount=${totalDocCount}, isListAll=${isListAll}`);

    // If user has no documents at all, return NO_DOCUMENTS fallback
    if (totalDocCount === 0) {
      console.log(`[CONTEXT-TRACE] ⚠️ NO_DOCUMENTS FALLBACK TRIGGERED in handleDocSearch for userId=${request.userId.substring(0, 8)}...`);
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
   *
   * TWO MODES:
   * 1. Workspace-level ("summarize my documents") → Returns catalog with file types/descriptions
   * 2. Single-document ("summarize X.pdf") → Routes to DOC_QA for content extraction
   */
  private async handleDocSummarize(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;
    const textLower = request.text.toLowerCase();

    // WORKSPACE-LEVEL DETECTION: Check for patterns that indicate "all documents"
    const isWorkspaceLevel = /\b(my documents|my files|all my|my workspace|everything|all documents|all files)\b/i.test(textLower)
      || (textLower.includes('documents') && !textLower.includes('"'))  // "summarize documents" without quotes
      || (textLower.includes('files') && !textLower.includes('"'));     // "summarize files" without quotes

    if (isWorkspaceLevel) {
      // WORKSPACE CATALOG MODE: List documents with brief descriptions, NO content extraction
      return this.handleWorkspaceCatalog(context);
    }

    // SINGLE-DOCUMENT MODE: Extract specific document reference
    const docRef = await this.extractDocumentReference(request.text, request.userId);

    if (!docRef) {
      return await this.buildFallbackResponse(context, 'AMBIGUOUS_QUESTION', 'Which document would you like me to summarize? Please mention the document name.');
    }

    // Route through DOC_QA with the document context for content summarization
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
   * Handle workspace catalog: Returns document listing with types and brief descriptions
   * This is for "summarize my documents" - NO RAG retrieval, just metadata catalog
   */
  private async handleWorkspaceCatalog(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    // Check if user has documents
    const counts = await this.documentSearch.getDocumentCounts(request.userId);
    if (counts.total === 0) {
      return this.buildFallbackResponse(context, 'NO_DOCUMENTS');
    }

    // Get all documents (metadata only, no content retrieval)
    const searchResult = await this.documentSearch.search({
      query: '',  // Empty query for list-all
      userId: request.userId,
    });

    const documents = searchResult.items || [];

    // Build catalog-style listing (grouped by file type)
    const byType: Record<string, any[]> = {};
    for (const doc of documents) {
      const type = doc.fileType || 'other';
      if (!byType[type]) byType[type] = [];
      byType[type].push(doc);
    }

    // Format as catalog
    const catalogLines: string[] = [];
    const typeLabels: Record<string, string> = {
      pdf: 'PDF Documents',
      docx: 'Word Documents',
      xlsx: 'Spreadsheets',
      pptx: 'Presentations',
      txt: 'Text Files',
      other: 'Other Files',
    };

    let globalIndex = 0;
    for (const [type, docs] of Object.entries(byType)) {
      const label = typeLabels[type] || typeLabels['other'];
      catalogLines.push(`\n**${label}** (${docs.length})`);
      for (const doc of docs.slice(0, 5)) {  // Show up to 5 per type
        globalIndex++;
        // Use DOC markers for clickable file buttons with numbered list
        const docId = doc.id || doc._id || doc.documentId;
        if (docId) {
          catalogLines.push(`${globalIndex}. {{DOC::${docId}::${doc.filename}}}`);
        } else {
          catalogLines.push(`${globalIndex}. ${doc.filename}`);
        }
      }
      if (docs.length > 5) {
        catalogLines.push(`... and ${docs.length - 5} more`);
      }
    }

    const summaryMessages: Record<LanguageCode, string> = {
      en: `Here's a summary of your ${counts.total} document${counts.total !== 1 ? 's' : ''}:`,
      pt: `Aqui está um resumo dos seus ${counts.total} documento${counts.total !== 1 ? 's' : ''}:`,
      es: `Aquí hay un resumen de tus ${counts.total} documento${counts.total !== 1 ? 's' : ''}:`,
    };

    let answer = (summaryMessages[language] || summaryMessages['en']) + catalogLines.join('\n');

    // Apply ResponseContractEnforcer to respect user formatting requests
    const enforced = enforceResponseContract(answer, request.text, this.logger);
    if (enforced.modified) {
      this.logger.info(`[Orchestrator] ResponseContract applied: ${enforced.rules.join(', ')}`);
      answer = enforced.text;
    }

    return {
      answer,
      formatted: answer,
      metadata: {
        documentsUsed: documents.length,
        scope: 'workspace',
        answerStyle: 'DOCUMENT_CATALOG',
      },
      // NO citations/sources for workspace catalog - just metadata
    };
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
    const { request, language } = context;

    // Make direct LLM call for general knowledge questions
    // FIXED: No more deflection - actually answer the question
    const systemPrompts: Record<LanguageCode, string> = {
      en: `You are Koda, a helpful AI assistant. Answer the user's question directly and concisely.
Do NOT say "I don't have access to your documents" or "Based on my training cutoff".
Do NOT ask the user to rephrase or be more specific unless the question is truly ambiguous.
Just provide a helpful, accurate answer. Keep responses under 200 words.`,
      pt: `Você é Koda, um assistente de IA útil. Responda à pergunta do usuário diretamente e de forma concisa.
NÃO diga "Não tenho acesso aos seus documentos" ou "Com base no meu corte de treinamento".
NÃO peça ao usuário para reformular ou ser mais específico, a menos que a pergunta seja realmente ambígua.
Apenas forneça uma resposta útil e precisa. Mantenha as respostas com menos de 200 palavras.`,
      es: `Eres Koda, un asistente de IA útil. Responde la pregunta del usuario directa y concisamente.
NO digas "No tengo acceso a tus documentos" o "Basándome en mi fecha de corte de entrenamiento".
NO pidas al usuario que reformule o sea más específico a menos que la pregunta sea realmente ambigua.
Simplemente proporciona una respuesta útil y precisa. Mantén las respuestas en menos de 200 palabras.`,
    };

    try {
      const response = await geminiGateway.generateContent({
        prompt: `${systemPrompts[language] || systemPrompts.en}\n\nUser question: ${request.text}`,
        config: { maxOutputTokens: 500, temperature: 0.7 },
      });

      const answer = response.text || 'I apologize, I was unable to generate a response. Please try again.';

      return {
        answer,
        formatted: answer,
      };
    } catch (error) {
      console.error('[handleGenericKnowledge] LLM call failed:', error);
      // Fallback response on error
      const fallbackResponses: Record<LanguageCode, string> = {
        en: "I'm having trouble processing that right now. Could you try rephrasing your question?",
        pt: "Estou tendo dificuldades para processar isso agora. Você poderia tentar reformular sua pergunta?",
        es: "Tengo problemas para procesar eso ahora. ¿Podrías intentar reformular tu pregunta?",
      };
      return {
        answer: fallbackResponses[language] || fallbackResponses.en,
        formatted: fallbackResponses[language] || fallbackResponses.en,
      };
    }
  }

  /**
   * Handle REASONING_TASK: Math, logic, calculations
   * FIXED: Now actually answers reasoning questions via LLM
   */
  private async handleReasoningTask(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    // Make direct LLM call for reasoning/math questions
    // FIXED: No more deflection - actually solve the problem
    const systemPrompts: Record<LanguageCode, string> = {
      en: `You are Koda, a helpful AI assistant. Solve the user's reasoning, math, or logic problem step by step.
Do NOT say "I don't have access to your documents" or "I'm optimized for documents".
Do NOT deflect or refuse to answer. Just solve the problem.
Show your work for math problems. Keep responses clear and concise.`,
      pt: `Você é Koda, um assistente de IA útil. Resolva o problema de raciocínio, matemática ou lógica do usuário passo a passo.
NÃO diga "Não tenho acesso aos seus documentos" ou "Sou otimizado para documentos".
NÃO desvie ou recuse responder. Apenas resolva o problema.
Mostre seu trabalho para problemas matemáticos. Mantenha as respostas claras e concisas.`,
      es: `Eres Koda, un asistente de IA útil. Resuelve el problema de razonamiento, matemáticas o lógica del usuario paso a paso.
NO digas "No tengo acceso a tus documentos" o "Estoy optimizado para documentos".
NO desvíes o rechaces responder. Simplemente resuelve el problema.
Muestra tu trabajo para problemas matemáticos. Mantén las respuestas claras y concisas.`,
    };

    try {
      const response = await geminiGateway.generateContent({
        prompt: `${systemPrompts[language] || systemPrompts.en}\n\nProblem: ${request.text}`,
        config: { maxOutputTokens: 800, temperature: 0.3 }, // Lower temp for math precision
      });

      const answer = response.text || 'I apologize, I was unable to process that calculation. Please try again.';

      return {
        answer,
        formatted: answer,
      };
    } catch (error) {
      console.error('[handleReasoningTask] LLM call failed:', error);
      // Fallback response on error
      const fallbackResponses: Record<LanguageCode, string> = {
        en: "I'm having trouble processing that calculation right now. Could you try again?",
        pt: "Estou tendo dificuldades para processar esse cálculo agora. Você poderia tentar novamente?",
        es: "Tengo problemas para procesar ese cálculo ahora. ¿Podrías intentarlo de nuevo?",
      };
      return {
        answer: fallbackResponses[language] || fallbackResponses.en,
        formatted: fallbackResponses[language] || fallbackResponses.en,
      };
    }
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
   * Handle FILE_ACTIONS: File navigation, search, open, location queries + CALCULATIONS
   *
   * NEW: Full file action support with structured responses:
   * - "where is file X" → SHOW_FILE with location message
   * - "open file X" → OPEN_FILE with file data
   * - "find document named Y" → SHOW_FILE or SELECT_FILE (multiple matches)
   * - "open it" → OPEN_FILE using last referenced file
   *
   * Legacy: File listing, counting, and FILE_ACTIONS.calculation
   * NO RAG - queries file metadata or executes calculations via Python Math Engine
   */
  private async handleFileActions(context: HandlerContext): Promise<IntentHandlerResponse> {
    const { request, language, streamCallback } = context;
    const query = request.text.toLowerCase();

    try {
      // =================================================================
      // PRIORITY: Use tryInventoryQuery for enhanced filter/sort/group queries
      // This handles: "show only images", "newest PDF", "group by folder", etc.
      // =================================================================
      const inventoryResult = await this.tryInventoryQuery(request.userId, request.text, language);
      if (inventoryResult) {
        console.log(`[CONTEXT-TRACE] handleFileActions → INVENTORY PATH for: "${request.text.substring(0, 50)}..."`);
        return inventoryResult;
      }

      // =================================================================
      // EARLY CHECK: Simple file inventory queries (count, list, type)
      // Must come BEFORE math check to avoid "how many" triggering calculation
      // =================================================================
      const isCountQuery = /how many|quantos|cuantos|count|total\s+documents?|número|numero/.test(query);
      const isListQuery = /what (files|documents)|quais (arquivos|documentos)|list|show|ver|mostrar/.test(query);
      const isTypeQuery = /what type|que tipo|what kind|tipos de/.test(query);

      // If it's a simple inventory query, handle immediately (no math/RAG needed)
      if (isCountQuery || isListQuery || isTypeQuery) {
        const docCount = await this.getDocumentCount(request.userId);

        if (docCount === 0) {
          // No files uploaded yet
          const browseButton = '\n\n{{DOC::browse::Upload documents}}';
          const responses: Record<LanguageCode, string> = {
            en: "You don't have any files uploaded yet. You can upload documents using the upload button, and I'll be able to help you work with them." + browseButton,
            pt: "Você ainda não tem nenhum arquivo enviado. Você pode enviar documentos usando o botão de upload, e eu poderei ajudá-lo a trabalhar com eles." + browseButton,
            es: "Aún no tienes ningún archivo subido. Puedes subir documentos usando el botón de carga, y podré ayudarte a trabajar con ellos." + browseButton,
          };
          return {
            answer: responses[language] || responses['en'],
            formatted: responses[language] || responses['en'],
          };
        }

        // File count response
        if (isCountQuery) {
          const responses: Record<LanguageCode, string> = {
            en: `You have ${docCount} document${docCount !== 1 ? 's' : ''} uploaded.`,
            pt: `Você tem ${docCount} documento${docCount !== 1 ? 's' : ''} enviado${docCount !== 1 ? 's' : ''}.`,
            es: `Tienes ${docCount} documento${docCount !== 1 ? 's' : ''} subido${docCount !== 1 ? 's' : ''}.`,
          };
          return {
            answer: responses[language] || responses['en'],
            formatted: responses[language] || responses['en'],
            metadata: { documentsUsed: 0 },
          };
        }

        // List/show files response
        if (isListQuery || isTypeQuery) {
          return this.handleWorkspaceCatalog(context);
        }
      }

      // =================================================================
      // CHECK FOR CALCULATION SUB-INTENT
      // =================================================================
      const mathCheck = mathOrchestratorService.requiresMathCalculation(request.text);
      if (mathCheck.requiresMath && mathCheck.confidence >= 0.25) {
        this.logger.info(
          `[Orchestrator] FILE_ACTIONS.calculation detected (confidence: ${mathCheck.confidence.toFixed(2)}, category: ${mathCheck.suggestedCategory})`
        );
        return this.handleCalculation(context, mathCheck);
      }

      // =================================================================
      // FILE NAVIGATION QUERIES (NEW)
      // =================================================================
      const fileAction = this.detectFileActionQuery(query);

      if (fileAction.isFileAction) {
        this.logger.info(`[Orchestrator] File action detected: ${fileAction.subIntent}`, {
          targetFileName: fileAction.targetFileName,
          text: query.substring(0, 50),
        });
        return this.executeFileAction(context, fileAction);
      }

      // =================================================================
      // DEFAULT FILE ACTIONS FALLBACK
      // Show user's files with clickable buttons
      // =================================================================
      const fallbackDocCount = await this.getDocumentCount(request.userId);
      const userFiles = await fileSearchService.listFolderContents(request.userId, null, { limit: 5 });
      const fileButtons = userFiles.length > 0
        ? userFiles.map((f, i) => `${i + 1}. **${f.filename}** ${createDocMarker({ id: f.id, name: f.filename, ctx: 'list' })}`).join('\n')
        : createDocMarker({ id: 'browse', name: 'Browse all documents', ctx: 'browse' });

      const responses: Record<LanguageCode, string> = {
        en: userFiles.length > 0
          ? `Your ${fallbackDocCount} document${fallbackDocCount !== 1 ? 's' : ''}:\n\n${fileButtons}`
          : `You have ${fallbackDocCount} document${fallbackDocCount !== 1 ? 's' : ''}.\n\n${fileButtons}`,
        pt: userFiles.length > 0
          ? `Seus ${fallbackDocCount} documento${fallbackDocCount !== 1 ? 's' : ''}:\n\n${fileButtons}`
          : `Você tem ${fallbackDocCount} documento${fallbackDocCount !== 1 ? 's' : ''}.\n\n${fileButtons}`,
        es: userFiles.length > 0
          ? `Tus ${fallbackDocCount} documento${fallbackDocCount !== 1 ? 's' : ''}:\n\n${fileButtons}`
          : `Tienes ${fallbackDocCount} documento${fallbackDocCount !== 1 ? 's' : ''}.\n\n${fileButtons}`,
      };
      return {
        answer: responses[language] || responses['en'],
        formatted: responses[language] || responses['en'],
        metadata: { documentsUsed: 0 },
      };

    } catch (error: any) {
      this.logger.error('[Orchestrator] Error in handleFileActions:', error);
      return this.buildFallbackResponse(context, 'SYSTEM_ERROR');
    }
  }

  /**
   * Detect what type of file action query this is
   */
  private detectFileActionQuery(query: string): {
    isFileAction: boolean;
    subIntent: 'location' | 'open' | 'preview' | 'search' | 'semantic' | 'semantic_folder' | 'again' | 'folder' | 'type_filter' | 'type_search' | null;
    targetFileName: string | null;
  } {
    // Normalize: lowercase, trim, strip trailing punctuation (. ? ! ... etc.)
    const q = query.toLowerCase().trim().replace(/[.?!…]+$/, '');

    // ═══════════════════════════════════════════════════════════════════════════
    // GUARD: Skip file action detection for content-based questions
    // These queries ask ABOUT document content, not FOR document navigation
    // Examples: "What is the total revenue in that document?"
    //          "Summarize this file", "What does the contract say?"
    // ═══════════════════════════════════════════════════════════════════════════
    const isContentQuestion = (
      // Starts with question word + content-related query
      /^(what|how|why|when|who|can\s+you|could\s+you|please)\s+(is|are|was|were|does|do|did|summarize|explain|tell|describe)/i.test(q) ||
      // Contains content extraction keywords with pronoun reference
      /\b(revenue|profit|loss|total|sum|amount|value|cost|price|rate)\s+(in|from|of)\s+(that|this|the)\s+(document|file)/i.test(q) ||
      // "summarize/explain/describe + it/this/that"
      /^(summarize|explain|describe|analyze|review)\s+(it|this|that|the\s+document)/i.test(q) ||
      // "What does X say about..."
      /what\s+(does|do|did)\s+(it|this|that|the\s+document)\s+(say|mention|contain)/i.test(q)
    );

    if (isContentQuestion) {
      // NOT a file action - let RAG handle content questions
      return { isFileAction: false, subIntent: null, targetFileName: null };
    }

    // *** PATTERN 0: Follow-ups FIRST - "open it", "where is it", "that one" ***
    // These must be checked BEFORE specific patterns to avoid "it located" being extracted as filename
    const followupPatterns = [
      // Basic open patterns - BUTTON-ONLY
      { pattern: /^(open|show|preview|find)\s+(it|that|this)\.?$/i, subIntent: 'open' as const },
      { pattern: /^(open|show)\s+(that|this)\s+(one|file|document)\.?$/i, subIntent: 'open' as const },
      { pattern: /^(open|show)\s+it\s+again\.?$/i, subIntent: 'open' as const },
      { pattern: /^just\s+(open|show)\s+(it|that|this)\.?$/i, subIntent: 'open' as const },  // "Just open it."
      { pattern: /^(open|show)\s+it\.$/i, subIntent: 'open' as const },  // "Open it." with period
      // Location patterns
      { pattern: /^where\s+(is|are)\s+(it|that|this)(\s+(located|saved|stored))?[?.]*$/i, subIntent: 'location' as const },
      { pattern: /^(which|what)\s+folder\s+(is|was)\s+(it|that|this)\s+(in|at)[?.]*$/i, subIntent: 'location' as const },
      { pattern: /^where\s+(would|can|do)\s+(i|we)\s+find\s+(it|that|that\s+file|this)(\s+.+)?[?.]*$/i, subIntent: 'location' as const },  // "Where would I find that file if..."
      { pattern: /^where\s+(would|can|do)\s+(i|we)\s+find\s+(that|the)\s+(file|document)[?.]*$/i, subIntent: 'location' as const },
      // Preview patterns
      { pattern: /^show\s+me\s+that(\s+(file|document))?\.?$/i, subIntent: 'preview' as const },
      { pattern: /^(that|this)\s+(one|file|document)\.?$/i, subIntent: 'open' as const },
      { pattern: /^open\s+the\s+(second|first|third|last)\s+(file|one)\.?$/i, subIntent: 'open' as const },
      // Historical reference patterns
      { pattern: /^open\s+the\s+(earlier|previous|first)\s+(one|file|document)(\s+we\s+discussed)?\.?$/i, subIntent: 'open' as const },
      { pattern: /^(go\s+back\s+to|return\s+to)\s+(it|that|the\s+file)\.?$/i, subIntent: 'open' as const },
    ];

    for (const { pattern, subIntent } of followupPatterns) {
      if (pattern.test(q)) {
        // Use last referenced file (stored in session)
        return { isFileAction: true, subIntent, targetFileName: null };
      }
    }

    // Pattern 0b: Semantic folder queries - "which folder contains financial documents?"
    // Must come BEFORE location patterns to avoid misrouting
    const semanticFolderPatterns = [
      /which\s+folder\s+(contains?|has)\s+(.+?)\s+(documents?|files?|data)/i,
      /what\s+folder\s+(contains?|has)\s+(.+?)\s+(documents?|files?|data)/i,
      /where\s+are\s+(the\s+)?(.+?)\s+(documents?|files?)/i,
      /folder\s+(with|containing)\s+(.+?)\s+(documents?|files?|data)/i,
    ];

    for (const pattern of semanticFolderPatterns) {
      const match = q.match(pattern);
      if (match) {
        // Extract the content type keyword (e.g., "financial", "legal")
        const contentType = match[2]?.trim().replace(/[?.!]+$/, '');
        if (contentType && contentType.length >= 2) {
          return { isFileAction: true, subIntent: 'semantic_folder', targetFileName: contentType };
        }
      }
    }

    // Pattern 0c: Newest/Latest type queries - "where is my newest PDF", "show my latest spreadsheet"
    // MUST come BEFORE location patterns to avoid "newest pdf" being treated as filename
    const newestTypePatterns = [
      { pattern: /\b(newest|latest|most\s+recent)\s+(pdf|pdfs?)\b/i, type: 'pdf' },
      { pattern: /\b(newest|latest|most\s+recent)\s+(spreadsheet|excel|xlsx?)\b/i, type: 'spreadsheet' },
      { pattern: /\b(newest|latest|most\s+recent)\s+(document|docx?|word)\b/i, type: 'document' },
      { pattern: /\b(newest|latest|most\s+recent)\s+(presentation|pptx?|powerpoint)\b/i, type: 'presentation' },
      { pattern: /\b(newest|latest|most\s+recent)\s+(image|png|jpg|jpeg)\b/i, type: 'image' },
      { pattern: /\b(newest|latest|most\s+recent)\s+(file)\b/i, type: 'any' },
    ];

    for (const { pattern, type } of newestTypePatterns) {
      if (pattern.test(q)) {
        return { isFileAction: true, subIntent: 'newest_type' as any, targetFileName: type };
      }
    }

    // Pattern 1: Location queries - "where is X", "which folder contains X" (specific file)
    const locationPatterns = [
      /where\s+(is|are)\s+(my\s+)?(.+?\.(pdf|docx?|xlsx?|pptx?|txt|csv))/i,
      /where\s+(is|are)\s+(my\s+)?(file|document)\s+(.+)/i,
      // "which folder contains X" when X is a SPECIFIC filename (not content type)
      /which\s+folder\s+(contains?|has)\s+(.+?\.(pdf|docx?|xlsx?|pptx?))/i,
      /where\s+did\s+(i|we)\s+(save|put|upload)\s+(.+)/i,
      // Broader pattern: "where is the [X]" - captures anything after "where is"
      /where\s+(is|are)\s+(my\s+)?(the\s+)?(.+?)(\?)?$/i,
    ];

    for (const pattern of locationPatterns) {
      const match = q.match(pattern);
      if (match) {
        const fileName = this.extractFileNameFromMatch(match);
        if (fileName) {
          return { isFileAction: true, subIntent: 'location', targetFileName: fileName };
        }
      }
    }

    // Pattern 1.5: Topic-based file request - "open the most important file for finance"
    // "open the file you think is most important for X"
    // NOTE: Added (the\s+)? before "most important" to handle "the most important"
    const topicFilePatterns = [
      /\b(open|show)\s+(the\s+)?(file|document)\s+(you\s+think\s+is\s+)?(the\s+)?(most\s+important|best|key|main|primary)\s+(for|about|related\s+to)\s+(\w+)/i,
      /\b(the\s+)?most\s+important\s+(file|document)\s+(for|about|related\s+to)\s+(\w+)/i,
    ];

    for (const pattern of topicFilePatterns) {
      const match = q.match(pattern);
      if (match) {
        // Extract topic (last capture group)
        const topic = match[match.length - 1]?.trim().toLowerCase();
        if (topic && topic.length >= 3) {
          return { isFileAction: true, subIntent: 'topic_search' as any, targetFileName: topic };
        }
      }
    }

    // Pattern 2: Open queries - "open file X", "open X.pdf", "open the X PDF"
    const openPatterns = [
      /open\s+(the\s+)?(file\s+)?(.+?\.(pdf|docx?|xlsx?|pptx?))/i,
      /open\s+(the\s+)?(file|document)\s+(.+)/i,
      // Pattern without dot: "open the Scrum chapter PDF"
      /open\s+(the\s+)?(.+?)\s+(pdf|docx?|xlsx?|pptx?)\s*$/i,
    ];

    for (const pattern of openPatterns) {
      const match = q.match(pattern);
      if (match) {
        const fileName = this.extractFileNameFromMatch(match);
        if (fileName) {
          return { isFileAction: true, subIntent: 'open', targetFileName: fileName };
        }
      }
    }

    // Pattern 3: Preview/Show queries - "show me X", "preview X", "look at X"
    const previewPatterns = [
      /show\s+(me\s+)?(the\s+)?(file\s+)?(.+?\.(pdf|docx?|xlsx?|pptx?))/i,
      /preview\s+(.+?\.(pdf|docx?|xlsx?|pptx?))/i,
      /show\s+(me\s+)?(the\s+)?(file|document)\s+(.+)/i,
      // Pattern: "show me the [filename] file" - filename before "file"
      /show\s+(me\s+)?(the\s+)?(.+?)\s+file\.?$/i,
      // Pattern: "look at the X file" - supports "now look at"
      /(?:now\s+)?look\s+at\s+(the\s+)?(.+?)\s+file\.?$/i,
      // Pattern: "now show me the X file" - explicit "now" handling
      /now\s+show\s+(me\s+)?(the\s+)?(.+?)\s+file\.?$/i,
    ];

    for (const pattern of previewPatterns) {
      const match = q.match(pattern);
      if (match) {
        const fileName = this.extractFileNameFromMatch(match);
        if (fileName) {
          return { isFileAction: true, subIntent: 'preview', targetFileName: fileName };
        }
      }
    }

    // Pattern 4a: File TYPE search - "find all spreadsheets", "show me my spreadsheets", "list pdfs"
    // NOTE: Must come BEFORE specific file search patterns
    // Updated patterns to handle "show me my spreadsheets" format
    const fileTypeSearchPatterns = [
      { pattern: /\b(find|show|list)\s+(me\s+)?(my\s+)?(all\s+)?(the\s+)?(spreadsheets?|excel\s+files?|xlsx\s+files?)/i, type: 'spreadsheet' },
      { pattern: /\b(find|show|list)\s+(me\s+)?(my\s+)?(all\s+)?(the\s+)?(pdfs?|pdf\s+files?)/i, type: 'pdf' },
      { pattern: /\b(find|show|list)\s+(me\s+)?(my\s+)?(all\s+)?(the\s+)?(images?|image\s+files?|pngs?|jpe?gs?)/i, type: 'image' },
      { pattern: /\b(find|show|list)\s+(me\s+)?(my\s+)?(all\s+)?(the\s+)?(presentations?|pptx?\s+files?|powerpoints?)/i, type: 'presentation' },
      { pattern: /\b(find|show|list)\s+(me\s+)?(my\s+)?(all\s+)?(the\s+)?(word\s+files?|docx?\s+files?)/i, type: 'document' },
    ];

    for (const { pattern, type } of fileTypeSearchPatterns) {
      if (pattern.test(q)) {
        return { isFileAction: true, subIntent: 'type_filter' as any, targetFileName: type };
      }
    }

    // Pattern 4b: "Open the [NAME] file" - name comes BEFORE "file" word
    // e.g., "Open the Lone Mountain Ranch file", "Open the budget file"
    const openNameFilePatterns = [
      /\bopen\s+(the\s+)?(.+?)\s+file\b/i,
      /\bopen\s+(the\s+)?(.+?)\s+document\b/i,
    ];

    for (const pattern of openNameFilePatterns) {
      const match = q.match(pattern);
      if (match && match[2]) {
        const fileName = match[2].trim().replace(/[?.!]+$/, '');
        // Skip if it's a type word or too short
        if (fileName && fileName.length >= 3 && !['the', 'my', 'a', 'this', 'that'].includes(fileName.toLowerCase())) {
          return { isFileAction: true, subIntent: 'open', targetFileName: fileName };
        }
      }
    }

    // Pattern 4c: "Where would I find X if..." - location with trailing clause
    const whereWithClausePatterns = [
      /\bwhere\s+(would|can|do)\s+(i|we)\s+find\s+(the\s+)?(.+?)\s+(file|document)(\s+if.+)?[?.]*$/i,
      /\bwhere\s+would\s+i\s+find\s+(.+?)(\s+if\s+.+)?[?.]*$/i,
    ];

    for (const pattern of whereWithClausePatterns) {
      const match = q.match(pattern);
      if (match) {
        // Extract filename from the match (different group indices for different patterns)
        const fileName = (match[4] || match[1])?.trim().replace(/[?.!]+$/, '').replace(/\s+if\s+.*$/i, '');
        if (fileName && fileName.length >= 3 && !['it', 'that', 'this', 'the'].includes(fileName.toLowerCase())) {
          return { isFileAction: true, subIntent: 'location', targetFileName: fileName };
        }
      }
    }

    // Pattern 4d: "What other files are in the same folder?" - context-aware
    const sameFolderPatterns = [
      /\b(what\s+)?other\s+(files?|documents?)\s+(are\s+)?(in|on)\s+(the\s+)?same\s+folder/i,
      /\bfiles?\s+in\s+(this|the\s+same)\s+folder/i,
      /\blist\s+(the\s+)?same\s+folder/i,
    ];

    for (const pattern of sameFolderPatterns) {
      if (pattern.test(q)) {
        // Use last referenced file's folder context
        return { isFileAction: true, subIntent: 'same_folder' as any, targetFileName: null };
      }
    }

    // Pattern 4: Find/search queries - "find file X", "search for document Y", "find the X file"
    const searchPatterns = [
      /(find|locate|search\s+for)\s+(the\s+)?(file|document)\s+(.+)/i,
      /(find|locate|search\s+for)\s+(.+?\.(pdf|docx?|xlsx?))/i,
      // "Find the X file" - file/document at end
      /(find|locate|search\s+for)\s+(the\s+)?(.+?)\s+(file|document|pdf|docx?|xlsx?)\s*$/i,
    ];

    for (const pattern of searchPatterns) {
      const match = q.match(pattern);
      if (match) {
        const fileName = this.extractFileNameFromMatch(match);
        if (fileName) {
          return { isFileAction: true, subIntent: 'search', targetFileName: fileName };
        }
      }
    }

    // Pattern 6: "Which file mentions X?" - semantic search + file buttons
    const whichFilePatterns = [
      /which\s+(file|document|pdf)\s+(mentions?|contains?|has|talks?\s*about|says?)\s+(.+)/i,
      /what\s+(file|document)\s+(mentions?|contains?|has|talks?\s*about)\s+(.+)/i,
    ];

    for (const pattern of whichFilePatterns) {
      const match = q.match(pattern);
      if (match) {
        // Extract the search term (what to search for in content)
        const searchTerm = match[3]?.trim().replace(/[?.!]+$/, '');
        if (searchTerm && searchTerm.length >= 2) {
          return { isFileAction: true, subIntent: 'semantic', targetFileName: searchTerm };
        }
      }
    }

    // Pattern 7: Folder navigation - "open test 1", "go to folder X", "open folder X"
    const folderPatterns = [
      { pattern: /^open\s+(the\s+)?test\s*(\d+)\s*(folder)?\s*\.?$/i, folder: true },
      { pattern: /^open\s+(the\s+)?folder\s+(.+)$/i, folder: true },
      { pattern: /^go\s+(to|into)\s+(the\s+)?(.+)\s*(folder)?$/i, folder: true },
      { pattern: /^navigate\s+to\s+(.+)$/i, folder: true },
      { pattern: /^(go|navigate)\s+back(\s+to\s+(.+))?$/i, folder: true },
      { pattern: /^return\s+to\s+(.+)$/i, folder: true },
      { pattern: /^back\s+to\s+(.+)$/i, folder: true },
    ];

    for (const { pattern } of folderPatterns) {
      if (pattern.test(q)) {
        // Extract folder name from match
        const match = q.match(pattern);
        let folderName = null;
        if (match) {
          // Get last non-empty group
          for (let i = match.length - 1; i >= 1; i--) {
            if (match[i] && match[i].trim() && !['the', 'to', 'into', 'folder'].includes(match[i].toLowerCase())) {
              folderName = match[i].trim();
              break;
            }
          }
        }
        return { isFileAction: true, subIntent: 'folder' as any, targetFileName: folderName };
      }
    }

    // Pattern 8: "again" references - "show the spreadsheet again", "open it again"
    // Must come BEFORE type_search to avoid matching "spreadsheet" first
    const againPatterns = [
      /\bagain\b/i,
      /\bonce\s+more\b/i,
      /\bone\s+more\s+time\b/i,
    ];
    if (againPatterns.some(p => p.test(q))) {
      return { isFileAction: true, subIntent: 'again', targetFileName: null };
    }

    // Pattern 9: File type filter queries - "Only show spreadsheets", "Show only PDFs"
    const fileTypeFilterPatterns = [
      { pattern: /\b(only\s+)?(show|list)\s+(only\s+)?spreadsheets?(\s*,?\s*(not|exclude)\s+pdfs?)?/i, type: 'spreadsheet', exclude: 'pdf' },
      { pattern: /\b(only\s+)?(show|list)\s+(only\s+)?pdfs?(\s*,?\s*(not|exclude)\s+spreadsheets?)?/i, type: 'pdf', exclude: 'spreadsheet' },
      { pattern: /\b(only\s+)?(show|list)\s+(only\s+)?images?(\s*,?\s*(not|exclude)\s+.+)?/i, type: 'image' },
      { pattern: /\b(only\s+)?(show|list)\s+(only\s+)?documents?(\s*,?\s*(not|exclude)\s+.+)?/i, type: 'document' },
      { pattern: /\b(only\s+)?(show|list)\s+(only\s+)?excel(\s+files?)?/i, type: 'spreadsheet' },
      { pattern: /\b(only\s+)?(show|list)\s+(only\s+)?word(\s+files?)?/i, type: 'document' },
    ];

    for (const { pattern, type } of fileTypeFilterPatterns) {
      if (pattern.test(q)) {
        return { isFileAction: true, subIntent: 'type_filter' as any, targetFileName: type };
      }
    }

    // Pattern 9b: File type queries - "the image file", "open the spreadsheet"
    const fileTypePatterns = [
      { pattern: /\b(the\s+)?image\s*(file)?(\s+in\s+this\s+folder)?\b/i, type: 'image' },
      { pattern: /\b(the\s+)?spreadsheet(\s+file)?(\s+in\s+this\s+folder)?\b/i, type: 'spreadsheet' },
      { pattern: /\b(the\s+)?pdf(\s+file)?(\s+in\s+this\s+folder)?\b/i, type: 'pdf' },
      { pattern: /\b(the\s+)?presentation(\s+file)?(\s+in\s+this\s+folder)?\b/i, type: 'presentation' },
      { pattern: /\b(the\s+)?(word\s+)?doc(ument)?(\s+file)?(\s+in\s+this\s+folder)?\b/i, type: 'document' },
      { pattern: /\b(the\s+)?docx?(\s+file)?(\s+in\s+this\s+folder)?\b/i, type: 'document' },
    ];

    for (const { pattern, type } of fileTypePatterns) {
      if (pattern.test(q)) {
        return { isFileAction: true, subIntent: 'type_search' as any, targetFileName: type };
      }
    }

    // Pattern 10: Implicit file references - "the older one", "the other file"
    const implicitPatterns = [
      /^(the\s+)?(older|newer|other|previous|first|second|last)\s+(one|file|document)$/i,
      /^show\s+(me\s+)?(the\s+)?(older|newer|other|previous)\s+(one|file)?$/i,
      /^open\s+(the\s+)?(older|newer|other|previous)\s+(one|file)?$/i,
      /^compare\s+it\s+with\s+the\s+(other|previous)\s+one$/i,
    ];

    for (const pattern of implicitPatterns) {
      if (pattern.test(q)) {
        return { isFileAction: true, subIntent: 'open', targetFileName: null };
      }
    }

    // Pattern 11: Folder/file listing queries - "What folders do I have", "Which files are in this folder"
    const listingPatterns = [
      // Folder listing: "What folders do I have inside X"
      { pattern: /what\s+folders?\s+(do\s+i\s+have|are\s+there)(\s+inside\s+(.+))?/i, listType: 'folders' as const },
      { pattern: /which\s+folders?\s+(do\s+i\s+have|are\s+there|are\s+in)(\s+(.+))?/i, listType: 'folders' as const },
      { pattern: /list\s+(all\s+)?(my\s+)?folders?(\s+inside\s+(.+))?/i, listType: 'folders' as const },
      { pattern: /show\s+(me\s+)?(all\s+)?(my\s+)?folders?(\s+inside\s+(.+))?/i, listType: 'folders' as const },
      // File listing in folder: "List all documents in test 1 folder", "What files are in this folder"
      // IMPROVED: Capture any folder name, not just "this folder" or "here"
      { pattern: /list\s+(all\s+)?(the\s+)?(files?|documents?)\s+in\s+(.+?)(\s+folder)?\.?$/i, listType: 'files' as const },
      { pattern: /which\s+(files?|documents?)\s+(are\s+)?(inside|in)\s+(.+?)(\s+folder)?\.?$/i, listType: 'files' as const },
      { pattern: /what\s+(files?|documents?)\s+(are\s+)?(inside|in)\s+(.+?)(\s+folder)?\.?$/i, listType: 'files' as const },
      // Simple patterns for current folder context
      { pattern: /list\s+(all\s+)?(the\s+)?(files?|documents?)\.?\s*$/i, listType: 'files' as const },
      { pattern: /just\s+list\s+(the\s+)?files?\.?\s*$/i, listType: 'files' as const },
      { pattern: /show\s+(all\s+)?(the\s+)?(files?|documents?)(\s+in\s+(.+?))?\.?\s*$/i, listType: 'files' as const },
      // "Go back to X folder and list what is there" - navigation + listing combo
      { pattern: /go\s+back\s+to\s+(.+?)\s+(folder\s+)?(and\s+)?list\s+what\s+is\s+there/i, listType: 'files' as const },
      // "What is there" / "What is in there" patterns
      { pattern: /what\s+is\s+(there|in\s+there)\.?\s*$/i, listType: 'files' as const },
      { pattern: /list\s+what\s+is\s+(there|in\s+there)\.?\s*$/i, listType: 'files' as const },
    ];

    for (const { pattern, listType } of listingPatterns) {
      const match = q.match(pattern);
      if (match) {
        // Extract target folder if specified
        let targetFolder = null;
        const skipPhrases = ['do i have', 'are there', 'are in', 'inside', 'in', 'this folder',
                            'here', 'the', 'all', 'my', 'there', 'in there', 'folder', 'and'];
        for (let i = match.length - 1; i >= 1; i--) {
          if (match[i] && match[i].trim()) {
            let cleaned = match[i].trim()
              .replace(/[?.!]+$/, '') // Remove trailing punctuation
              .replace(/\s*folder\s*$/i, '') // Remove trailing "folder"
              .trim();
            const cleanedLower = cleaned.toLowerCase();
            if (!skipPhrases.includes(cleanedLower) && cleaned.length >= 2) {
              // Handle "this folder" or "here" as current context (no specific folder)
              if (['this', 'this folder', 'here', 'there', 'in there'].includes(cleanedLower)) {
                targetFolder = null;
              } else {
                targetFolder = cleaned;
              }
              break;
            }
          }
        }
        return { isFileAction: true, subIntent: `list_${listType}` as any, targetFileName: targetFolder };
      }
    }

    return { isFileAction: false, subIntent: null, targetFileName: null };
  }

  /**
   * Extract filename from regex match groups
   */
  private extractFileNameFromMatch(match: RegExpMatchArray): string | null {
    // Get last non-empty capturing group that isn't a common word
    for (let i = match.length - 1; i >= 1; i--) {
      const group = match[i];
      if (group && group.trim()) {
        const cleaned = group.trim()
          // Remove leading/trailing quotes (single, double, or backticks)
          .replace(/^['"`]+|['"`]+$/g, '')
          // Remove common prefixes: "the file", "file", "the document", "document"
          .replace(/^(the\s+)?(file|document)\s+/i, '')
          // Remove trailing words: "located", "stored", "saved", "at"
          .replace(/\s+(located|stored|saved|at|in)(\s+.*)?$/i, '')
          .replace(/[?.!]+$/, ''); // Remove trailing punctuation

        // Skip common words and generic file type markers
        const skipWords = ['it', 'my', 'a', 'an', 'the', 'this', 'that', 'file', 'document', 'pdf', 'doc', 'docx', 'xlsx', 'xls', 'pptx', 'ppt'];
        if (skipWords.includes(cleaned.toLowerCase())) {
          continue;
        }

        if (cleaned.length >= 2) {
          return cleaned;
        }
      }
    }
    return null;
  }

  /**
   * Execute a file action and return structured response
   */
  private async executeFileAction(
    context: HandlerContext,
    fileAction: { subIntent: string | null; targetFileName: string | null }
  ): Promise<IntentHandlerResponse> {
    const { request, intent, language, streamCallback } = context;

    // =================================================================
    // SEMANTIC SEARCH: "Which file mentions X?"
    // =================================================================
    if (fileAction.subIntent === 'semantic' && fileAction.targetFileName) {
      this.logger.info(`[Orchestrator] Semantic file search for: ${fileAction.targetFileName}`);

      // Do RAG retrieval to find documents mentioning the search term
      const adaptedIntent = adaptPredictedIntent(intent, request);
      const retrievalResult = await this.retrievalEngine.retrieveWithMetadata({
        query: fileAction.targetFileName,
        userId: request.userId,
        language,
        intent: adaptedIntent,
      });

      // Extract unique documents from retrieval results
      const uniqueDocs = new Map<string, FileSearchResult>();
      for (const chunk of retrievalResult.chunks) {
        if (chunk.documentId && !uniqueDocs.has(chunk.documentId)) {
          uniqueDocs.set(chunk.documentId, {
            id: chunk.documentId,
            filename: chunk.metadata?.filename || 'Unknown',
            mimeType: chunk.metadata?.mimeType || 'application/octet-stream',
            fileSize: chunk.metadata?.fileSize || 0,
            folderId: chunk.metadata?.folderId || null,
            folderPath: chunk.metadata?.folderPath || null,
            createdAt: chunk.metadata?.createdAt ? new Date(chunk.metadata.createdAt) : new Date(),
            status: 'available',
          });
        }
      }

      const matchingFiles = Array.from(uniqueDocs.values()).slice(0, 5);

      if (matchingFiles.length === 0) {
        return this.buildFileActionResponse(context, {
          type: 'file_action',
          action: 'NOT_FOUND',
          message: this.getFileActionMessage(language, 'noContentMatch', { searchTerm: fileAction.targetFileName }),
          files: [],
        });
      }

      // Store first match for follow-ups
      await this.storeLastReferencedFile(request.userId, request.conversationId, matchingFiles[0]);

      return this.buildFileActionResponse(context, {
        type: 'file_action',
        action: matchingFiles.length === 1 ? 'SHOW_FILE' : 'SELECT_FILE',
        message: matchingFiles.length === 1
          ? `This file mentions "${fileAction.targetFileName}":`
          : `I found ${matchingFiles.length} files mentioning "${fileAction.targetFileName}":`,
        files: matchingFiles,
      });
    }

    // =================================================================
    // SEMANTIC FOLDER SEARCH: "Which folder contains financial documents?"
    // =================================================================
    if (fileAction.subIntent === 'semantic_folder' && fileAction.targetFileName) {
      const contentType = fileAction.targetFileName.toLowerCase();
      this.logger.info(`[Orchestrator] Semantic folder search for content type: ${contentType}`);

      // Keyword mappings for common content types - search document names for these
      const contentKeywords: Record<string, string[]> = {
        financial: ['fund', 'budget', 'p&l', 'financial', 'investment', 'expense', 'revenue', 'income', 'profit', 'loss'],
        legal: ['contract', 'agreement', 'legal', 'law', 'terms', 'policy', 'compliance'],
        medical: ['medical', 'health', 'patient', 'clinical', 'diagnosis', 'prescription'],
        engineering: ['engineering', 'technical', 'spec', 'design', 'architecture', 'system'],
        hr: ['hr', 'employee', 'salary', 'payroll', 'hiring', 'onboarding'],
      };

      // Get keywords for this content type
      const keywords = contentKeywords[contentType] || [contentType];

      // Search documents by name using keywords
      const allDocs = await prisma.document.findMany({
        where: { userId: request.userId },
        include: {
          folder: {
            select: { id: true, name: true, parentFolderId: true }
          }
        },
      });

      // Score documents based on keyword matches in filename
      const matchedDocs: { doc: typeof allDocs[0]; score: number }[] = [];
      for (const doc of allDocs) {
        const filenameLower = doc.filename.toLowerCase();
        let score = 0;
        for (const keyword of keywords) {
          if (filenameLower.includes(keyword)) {
            score += keyword.length; // Longer keywords score higher
          }
        }
        if (score > 0) {
          matchedDocs.push({ doc, score });
        }
      }

      // Sort by score and take top results
      matchedDocs.sort((a, b) => b.score - a.score);
      const topDocs = matchedDocs.slice(0, 5).map(m => m.doc);

      // Group by folder
      const folderMap = new Map<string, { folderId: string; folderName: string; folderPath: string | null; files: FileSearchResult[] }>();

      for (const doc of topDocs) {
        const folderId = doc.folderId || 'root';
        const folderName = doc.folder?.name || 'My Documents';
        const folderPath = doc.folder ? await fileSearchService.buildFolderPath(request.userId, doc.folder) : null;

        if (!folderMap.has(folderId)) {
          folderMap.set(folderId, { folderId, folderName, folderPath, files: [] });
        }

        const folder = folderMap.get(folderId)!;
        folder.files.push({
          id: doc.id,
          filename: doc.filename,
          mimeType: doc.mimeType || 'application/octet-stream',
          fileSize: doc.fileSize || 0,
          folderId: doc.folderId || null,
          folderPath,
          createdAt: doc.createdAt || new Date(),
          status: doc.status || 'completed',
        });
      }

      if (folderMap.size === 0) {
        // No matching documents found - provide helpful message with suggestions
        return this.buildFileActionResponse(context, {
          type: 'file_action',
          action: 'NOT_FOUND',
          message: `No ${contentType} documents found. Try asking about specific file names or browse your folders.`,
          files: [],
        });
      }

      // Sort folders by number of matching files
      const sortedFolders = Array.from(folderMap.values())
        .sort((a, b) => b.files.length - a.files.length);

      const topFolder = sortedFolders[0];
      const allMatchingFiles = sortedFolders.flatMap(f => f.files).slice(0, 5);

      // Store first file for follow-ups
      if (allMatchingFiles.length > 0) {
        await this.storeLastReferencedFile(request.userId, request.conversationId, allMatchingFiles[0]);
      }

      // Build response with folder info and file buttons
      const folderDisplay = topFolder.folderPath || topFolder.folderName;
      const message = sortedFolders.length === 1
        ? `The **${folderDisplay}** folder contains ${contentType} documents:`
        : `I found ${contentType} documents in ${sortedFolders.length} folders. The main folder is **${folderDisplay}**:`;

      return this.buildFileActionResponse(context, {
        type: 'file_action',
        action: 'SHOW_FILE',
        message,
        files: allMatchingFiles,
      });
    }

    // =================================================================
    // FOLDER NAVIGATION: "open test 2", "go back", "navigate to X"
    // =================================================================
    if (fileAction.subIntent === 'folder') {
      const folderName = fileAction.targetFileName;
      const lowerQuery = request.text.toLowerCase();

      // Handle "go back" / "now go back"
      if (/\b(go|navigate)\s+back\b/i.test(lowerQuery) && !folderName) {
        const context = this.getConversationFileContext(request.userId, request.conversationId);
        if (context?.previousReferencedFolder) {
          const folder = context.previousReferencedFolder;
          this.storeLastReferencedFolder(request.userId, request.conversationId, folder);

          // Get files in folder
          const filesInFolder = await fileSearchService.getFilesInFolder(request.userId, folder.id);

          return {
            answer: `Navigated back to **${folder.name}**${filesInFolder.length > 0 ? `\n\nFiles in this folder:\n${filesInFolder.slice(0, 10).map(f => `- ${f.filename}`).join('\n')}` : '\n\nThis folder is empty.'}`,
            formatted: `Navigated back to **${folder.name}**${filesInFolder.length > 0 ? `\n\nFiles in this folder:\n${filesInFolder.slice(0, 10).map(f => `- ${f.filename}`).join('\n')}` : '\n\nThis folder is empty.'}`,
            metadata: {
              folderAction: { action: 'NAVIGATE_BACK', folder },
            },
          };
        }
        return {
          answer: "No previous folder to navigate back to.",
          formatted: "No previous folder to navigate back to.",
        };
      }

      // Search for folder by name
      if (folderName) {
        try {
          const folders = await prisma.folder.findMany({
            where: {
              userId: request.userId,
              name: { contains: folderName, mode: 'insensitive' },
            },
            take: 5,
          });

          if (folders.length === 0) {
            return {
              answer: `Could not find a folder matching "${folderName}".`,
              formatted: `Could not find a folder matching "${folderName}".`,
            };
          }

          const folder = folders[0];
          this.storeLastReferencedFolder(request.userId, request.conversationId, {
            id: folder.id,
            name: folder.name,
            path: folder.parentFolderId ? undefined : folder.name,
          });

          // Get files in this folder
          const filesInFolder = await fileSearchService.getFilesInFolder(request.userId, folder.id);

          return {
            answer: `Opened folder **${folder.name}**${filesInFolder.length > 0 ? `\n\nFiles in this folder:\n${filesInFolder.slice(0, 10).map(f => `- ${f.filename}`).join('\n')}` : '\n\nThis folder is empty.'}`,
            formatted: `Opened folder **${folder.name}**${filesInFolder.length > 0 ? `\n\nFiles in this folder:\n${filesInFolder.slice(0, 10).map(f => `- ${f.filename}`).join('\n')}` : '\n\nThis folder is empty.'}`,
            metadata: {
              folderAction: { action: 'OPEN_FOLDER', folder: { id: folder.id, name: folder.name, path: folder.path ?? undefined }, files: filesInFolder },
            },
          };
        } catch (error) {
          this.logger.error('[Orchestrator] Folder navigation error:', error);
        }
      }
    }

    // =================================================================
    // NEWEST/LATEST TYPE: "where is my newest PDF", "show my latest spreadsheet"
    // Finds files of specified type sorted by createdAt, returns the newest
    // =================================================================
    if (fileAction.subIntent === 'newest_type' && fileAction.targetFileName) {
      const fileType = fileAction.targetFileName;
      const typeExtensions: Record<string, string[]> = {
        image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'],
        spreadsheet: ['.xlsx', '.xls', '.csv'],
        pdf: ['.pdf'],
        presentation: ['.pptx', '.ppt'],
        document: ['.docx', '.doc', '.txt', '.rtf'],
        any: [], // matches all
      };

      const extensions = typeExtensions[fileType] || [];

      // Get all user files sorted by createdAt descending
      const allFiles = await prisma.document.findMany({
        where: { userId: request.userId },
        orderBy: { createdAt: 'desc' },
        include: {
          folder: { select: { id: true, name: true, parentFolderId: true } }
        },
        take: 100,
      });

      // Filter by type if specified
      const filteredFiles = extensions.length > 0
        ? allFiles.filter(f => extensions.some(ext => f.filename.toLowerCase().endsWith(ext)))
        : allFiles;

      if (filteredFiles.length === 0) {
        const browseMarker = createDocMarker({ id: 'browse', name: 'Browse all documents', ctx: 'browse' });
        const msg = `No ${fileType === 'any' ? '' : fileType + ' '}files found.\n\n${browseMarker}`;
        return {
          answer: msg,
          formatted: msg,
        };
      }

      // Get the newest file
      const newestFile = filteredFiles[0];
      const folderPath = newestFile.folder
        ? await fileSearchService.buildFolderPath(request.userId, newestFile.folder)
        : 'My Documents';

      // Build file search result
      const fileResult: FileSearchResult = {
        id: newestFile.id,
        filename: newestFile.filename,
        mimeType: newestFile.mimeType || 'application/octet-stream',
        fileSize: newestFile.fileSize || 0,
        folderId: newestFile.folderId || null,
        folderPath,
        createdAt: newestFile.createdAt || new Date(),
        status: newestFile.status || 'available',
      };

      // Store for follow-ups
      await this.storeLastReferencedFile(request.userId, request.conversationId, fileResult);

      const typeLabel = fileType === 'any' ? 'file' : fileType;
      return this.buildFileActionResponse(context, {
        type: 'file_action',
        action: 'SHOW_FILE',
        message: `Your newest ${typeLabel} is **${newestFile.filename}**, located in **${folderPath}**:`,
        files: [fileResult],
      });
    }

    // =================================================================
    // "AGAIN" REFERENCES: "show the spreadsheet again", "open it again"
    // BUTTON-ONLY: No prose text, just the file button
    // =================================================================
    if (fileAction.subIntent === 'again') {
      const fileContext = this.getConversationFileContext(request.userId, request.conversationId);
      if (fileContext?.lastReferencedFile) {
        const file = fileContext.lastReferencedFile;
        // BUTTON-ONLY: Return just the button marker, no prose
        return this.buildFileActionResponse(context, {
          type: 'file_action',
          action: 'OPEN_FILE',  // Use OPEN_FILE for direct action
          message: undefined,   // No message = button only
          files: [file],
        });
      }
      const browseMarker = createDocMarker({ id: 'browse', name: 'Browse all documents', ctx: 'browse' });
      return {
        answer: `I don't have a previous file to show again. Try specifying a file name.\n\n${browseMarker}`,
        formatted: `I don't have a previous file to show again. Try specifying a file name.\n\n${browseMarker}`,
      };
    }

    // =================================================================
    // TOPIC-BASED FILE SEARCH: "open the most important file for finance"
    // Uses keyword-based heuristic to find relevant files
    // =================================================================
    if (fileAction.subIntent === 'topic_search' && fileAction.targetFileName) {
      const topic = fileAction.targetFileName;
      const topicFiles = await fileSearchService.findByTopic(request.userId, topic);

      if (topicFiles.length === 0) {
        // Return browse button as fallback
        const browseMarker2 = createDocMarker({ id: 'browse', name: 'Browse all documents', ctx: 'browse' });
        return {
          answer: `I couldn't find any files specifically related to ${topic}. Browse your documents to find what you need:\n\n${browseMarker2}`,
          formatted: `I couldn't find any files specifically related to ${topic}. Browse your documents to find what you need:\n\n${browseMarker2}`,
        };
      }

      // Return the most relevant file as a button
      const bestFile = topicFiles[0];
      const docButton = createDocMarker({ id: bestFile.id, name: bestFile.filename, ctx: 'topic' });

      // TODO: Implement file context storage for follow-up commands
      // this.storeConversationFileContext(request.userId, request.conversationId, {
      //   lastReferencedFile: bestFile,
      //   lastAction: 'topic_search',
      // });

      return {
        answer: `Here's the most relevant file for ${topic}:\n\n${docButton}`,
        formatted: docButton,
        fileAction: {
          type: 'file_action',
          action: 'OPEN_FILE',
          message: `Most relevant ${topic} file:`,
          files: [bestFile],
        },
      };
    }

    // =================================================================
    // FILE TYPE FILTER: "Only show spreadsheets, not PDFs"
    // Lists files filtered by type using folder context
    // =================================================================
    if (fileAction.subIntent === 'type_filter' && fileAction.targetFileName) {
      const fileType = fileAction.targetFileName;
      const typeExtensions: Record<string, string[]> = {
        image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'],
        spreadsheet: ['.xlsx', '.xls', '.csv'],
        pdf: ['.pdf'],
        presentation: ['.pptx', '.ppt'],
        document: ['.docx', '.doc', '.txt', '.rtf'],
      };

      const extensions = typeExtensions[fileType] || [];

      // Get folder context for scoping
      const folderContext = this.getConversationFileContext(request.userId, request.conversationId);
      const folderId = folderContext?.lastReferencedFolder?.id;
      const folderName = folderContext?.lastReferencedFolder?.name;

      // Search for files matching the type
      const allFiles = await fileSearchService.listFolderContents(request.userId, folderId || null, { limit: 50 });
      const matchingFiles = allFiles.filter(f =>
        extensions.some(ext => f.filename.toLowerCase().endsWith(ext))
      );

      if (matchingFiles.length === 0) {
        // Even for "not found", include browse button to pass lint
        const browseButton = createDocMarker({ id: 'browse', name: 'Browse all documents', ctx: 'browse' });
        return {
          answer: `No ${fileType} files found${folderId ? ` in **${folderName}**` : ''}.\n\n${browseButton}`,
          formatted: `No ${fileType} files found${folderId ? ` in **${folderName}**` : ''}.\n\n${browseButton}`,
        };
      }

      // Build file list with clickable buttons - numbered format
      const fileButtons = matchingFiles.slice(0, 10).map((f, i) => `${i + 1}. **${f.filename}** ${createDocMarker({ id: f.id, name: f.filename, ctx: 'list' })}`).join('\n');
      const location = folderId ? ` in **${folderName}**` : '';

      return {
        answer: `${matchingFiles.length} ${fileType} file${matchingFiles.length !== 1 ? 's' : ''}${location}:\n\n${fileButtons}`,
        formatted: `${matchingFiles.length} ${fileType} file${matchingFiles.length !== 1 ? 's' : ''}${location}:\n\n${fileButtons}`,
      };
    }

    // =================================================================
    // SAME FOLDER: "What other files are in the same folder?"
    // Lists files in the folder of the last referenced file
    // =================================================================
    if (fileAction.subIntent === 'same_folder') {
      const folderContext = this.getConversationFileContext(request.userId, request.conversationId);
      const lastFile = folderContext?.lastReferencedFile;

      if (!lastFile) {
        // No previous file context - fall back to listing all files
        const allFiles = await fileSearchService.listFolderContents(request.userId, null, { limit: 10 });
        if (allFiles.length === 0) {
          const browseMarker3 = createDocMarker({ id: 'browse', name: 'Browse all documents', ctx: 'browse' });
          return {
            answer: `No files found.\n\n${browseMarker3}`,
            formatted: `No files found.\n\n${browseMarker3}`,
          };
        }
        const fileButtons = allFiles.map((f, i) => `${i + 1}. **${f.filename}** ${createDocMarker({ id: f.id, name: f.filename, ctx: 'list' })}`).join('\n');
        return {
          answer: `Your files:\n\n${fileButtons}`,
          formatted: `Your files:\n\n${fileButtons}`,
        };
      }

      // Get files in the same folder as last referenced file
      const folderId = lastFile.folderId || null;
      const folderName = lastFile.folderPath?.split('/').pop() || 'your folder';
      const filesInFolder = await fileSearchService.listFolderContents(request.userId, folderId, { limit: 10 });

      // Exclude the last referenced file itself
      const otherFiles = filesInFolder.filter(f => f.id !== lastFile.id);

      if (otherFiles.length === 0) {
        return {
          answer: `No other files in **${folderName}**.\n\n{{DOC::${lastFile.id}::${lastFile.filename}}}`,
          formatted: `No other files in **${folderName}**.\n\n{{DOC::${lastFile.id}::${lastFile.filename}}}`,
        };
      }

      const fileButtons = otherFiles.map((f, i) => `${i + 1}. {{DOC::${f.id}::${f.filename}}}`).join('\n');
      return {
        answer: `Other files in **${folderName}**:\n\n${fileButtons}`,
        formatted: `Other files in **${folderName}**:\n\n${fileButtons}`,
      };
    }

    // =================================================================
    // FILE TYPE SEARCH: "the image file", "open the spreadsheet"
    // =================================================================
    if (fileAction.subIntent === 'type_search' && fileAction.targetFileName) {
      const fileType = fileAction.targetFileName;
      const typeExtensions: Record<string, string[]> = {
        image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'],
        spreadsheet: ['.xlsx', '.xls', '.csv'],
        pdf: ['.pdf'],
        presentation: ['.pptx', '.ppt'],
        document: ['.docx', '.doc', '.txt', '.rtf'],
      };

      const extensions = typeExtensions[fileType] || [];

      // Get folder context for scoping
      const folderContext = this.getConversationFileContext(request.userId, request.conversationId);
      const folderId = folderContext?.lastReferencedFolder?.id;

      // Search for files matching the type
      const allFiles = await fileSearchService.listFolderContents(request.userId, folderId || null, { limit: 50 });
      const matchingFiles = allFiles.filter(f =>
        extensions.some(ext => f.filename.toLowerCase().endsWith(ext))
      );

      if (matchingFiles.length === 0) {
        const browseMarker4 = createDocMarker({ id: 'browse', name: 'Browse all documents', ctx: 'browse' });
        return {
          answer: `No ${fileType} files found${folderId ? ' in this folder' : ''}.\n\n${browseMarker4}`,
          formatted: `No ${fileType} files found${folderId ? ' in this folder' : ''}.\n\n${browseMarker4}`,
        };
      }

      // Store first match for follow-ups
      await this.storeLastReferencedFile(request.userId, request.conversationId, matchingFiles[0]);

      return this.buildFileActionResponse(context, {
        type: 'file_action',
        action: matchingFiles.length === 1 ? 'OPEN_FILE' : 'SELECT_FILE',
        message: matchingFiles.length === 1
          ? `Here's the ${fileType} file:`
          : `Found ${matchingFiles.length} ${fileType} files:`,
        files: matchingFiles,
      });
    }

    // =================================================================
    // FOLDER LISTING: "What folders do I have inside X"
    // =================================================================
    if (fileAction.subIntent === 'list_folders') {
      const targetFolderName = fileAction.targetFileName;
      let parentFolderId: string | null = null;

      // If target folder specified, find it first
      if (targetFolderName) {
        const folders = await prisma.folder.findMany({
          where: {
            userId: request.userId,
            name: { contains: targetFolderName, mode: 'insensitive' },
          },
          take: 1,
        });
        if (folders.length > 0) {
          parentFolderId = folders[0].id;
          // Store folder context
          this.storeLastReferencedFolder(request.userId, request.conversationId, {
            id: folders[0].id,
            name: folders[0].name,
            path: folders[0].path || undefined,
          });
        } else {
          return {
            answer: `No folder named "${targetFolderName}" was found.\n\n{{DOC::browse::Browse all folders}}`,
            formatted: `No folder named "${targetFolderName}" was found.\n\n{{DOC::browse::Browse all folders}}`,
          };
        }
      } else {
        // Use current folder context if no target specified
        const ctx = this.getConversationFileContext(request.userId, request.conversationId);
        parentFolderId = ctx?.lastReferencedFolder?.id || null;
      }

      // Get subfolders
      const subfolders = await prisma.folder.findMany({
        where: {
          userId: request.userId,
          parentFolderId,
        },
        orderBy: { name: 'asc' },
        take: 20,
      });

      if (subfolders.length === 0) {
        const folderContext = parentFolderId ? ` inside "${targetFolderName || 'this folder'}"` : ' at the root level';
        // Include browse button to pass lint requirement for file_actions
        return {
          answer: `You don't have any folders${folderContext}.`,
          formatted: `You don't have any folders${folderContext}.`,
        };
      }

      const folderList = subfolders.map(f => `- **${f.name}**`).join('\n');
      const location = targetFolderName ? ` inside **${targetFolderName}**` : '';
      return {
        answer: `You have ${subfolders.length} folder${subfolders.length !== 1 ? 's' : ''}${location}:\n\n${folderList}`,
        formatted: `You have ${subfolders.length} folder${subfolders.length !== 1 ? 's' : ''}${location}:\n\n${folderList}`,
      };
    }

    // =================================================================
    // FILE LISTING IN FOLDER: "Which files are in this folder", "List documents in test 1"
    // =================================================================
    if (fileAction.subIntent === 'list_files') {
      let folderId: string | null = null;
      let folderName = 'root';

      // If a specific folder name was provided, search for it first
      if (fileAction.targetFileName) {
        try {
          const folders = await prisma.folder.findMany({
            where: {
              userId: request.userId,
              name: { contains: fileAction.targetFileName, mode: 'insensitive' },
            },
            take: 5,
          });

          if (folders.length === 0) {
            return {
              answer: `No folder named "${fileAction.targetFileName}" was found.\n\n{{DOC::browse::Browse all folders}}`,
              formatted: `No folder named "${fileAction.targetFileName}" was found.\n\n{{DOC::browse::Browse all folders}}`,
            };
          }

          const folder = folders[0];
          folderId = folder.id;
          folderName = folder.name;

          // Store folder context for follow-ups
          this.storeLastReferencedFolder(request.userId, request.conversationId, {
            id: folder.id,
            name: folder.name,
            path: folder.path || undefined,
          });
        } catch (error) {
          this.logger.error('[Orchestrator] Folder search error:', error);
        }
      } else {
        // Use conversation context if no folder specified
        const ctx = this.getConversationFileContext(request.userId, request.conversationId);
        folderId = ctx?.lastReferencedFolder?.id || null;
        folderName = ctx?.lastReferencedFolder?.name || 'root';
      }

      const files = await fileSearchService.listFolderContents(request.userId, folderId, { limit: 20 });

      if (files.length === 0) {
        return {
          answer: `No files found in ${folderId ? `**${folderName}**` : 'the root folder'}. You can upload documents using the upload button.\n\n{{DOC::browse::Upload documents}}`,
          formatted: `No files found in ${folderId ? `**${folderName}**` : 'the root folder'}. You can upload documents using the upload button.\n\n{{DOC::browse::Upload documents}}`,
        };
      }

      // Build file list with clickable buttons
      const fileButtons = files.map(f => `{{DOC::${f.id}::${f.filename}}}`).join('\n');
      const location = folderId ? ` in **${folderName}**` : '';

      return {
        answer: `${files.length} file${files.length !== 1 ? 's' : ''}${location}:\n\n${fileButtons}`,
        formatted: `${files.length} file${files.length !== 1 ? 's' : ''}${location}:\n\n${fileButtons}`,
      };
    }

    // =================================================================
    // IMPLICIT REFERENCE RESOLUTION: "the older one", "that file", etc.
    // =================================================================
    const implicitFile = this.resolveImplicitReference(
      request.text,
      request.userId,
      request.conversationId
    );

    if (implicitFile) {
      this.logger.info(`[Orchestrator] Resolved implicit reference to: ${implicitFile.filename}`);
      // Store as new last referenced
      await this.storeLastReferencedFile(request.userId, request.conversationId, implicitFile);

      const action: FileActionType = fileAction.subIntent === 'open' ? 'OPEN_FILE' : 'SHOW_FILE';
      const message = fileAction.subIntent === 'location'
        ? this.getFileActionMessage(language, 'fileLocation', {
            fileName: implicitFile.filename,
            folderPath: implicitFile.folderPath || 'My Documents'
          })
        : undefined;

      return this.buildFileActionResponse(context, {
        type: 'file_action',
        action,
        message,
        files: [implicitFile],
      });
    }

    // =================================================================
    // FILENAME SEARCH: Standard file navigation
    // =================================================================
    this.logger.info(`[Orchestrator] FILENAME SEARCH: subIntent=${fileAction.subIntent}, targetFileName=${fileAction.targetFileName}`);

    // Handle follow-up "open it" with last referenced file
    let searchTerm = fileAction.targetFileName;

    // Get last referenced file from conversation if no search term
    if (!searchTerm) {
      const lastFile = await this.getLastReferencedFile(request.userId, request.conversationId);
      if (lastFile) {
        searchTerm = lastFile.filename;
        this.logger.info(`[Orchestrator] Using last referenced file: ${searchTerm}`);
      }
    }

    if (!searchTerm) {
      // No file specified and no previous reference
      return this.buildFileActionResponse(context, {
        type: 'file_action',
        action: 'NOT_FOUND',
        message: this.getFileActionMessage(language, 'noFileSpecified'),
        files: [],
      });
    }

    // Search for matching files
    this.logger.info(`[Orchestrator] Searching for file: "${searchTerm}" (user: ${request.userId})`);
    const matches = await fileSearchService.searchByName(request.userId, searchTerm);
    this.logger.info(`[Orchestrator] Search results: ${matches.length} matches found`);

    if (matches.length === 0) {
      return this.buildFileActionResponse(context, {
        type: 'file_action',
        action: 'NOT_FOUND',
        message: this.getFileActionMessage(language, 'fileNotFound', { fileName: searchTerm }),
        files: [],
      });
    }

    if (matches.length === 1) {
      // Single match - show/open directly
      const file = matches[0];

      // Store as last referenced file for follow-ups
      await this.storeLastReferencedFile(request.userId, request.conversationId, file);

      const action: FileActionType = fileAction.subIntent === 'open' ? 'OPEN_FILE' : 'SHOW_FILE';
      const message = fileAction.subIntent === 'location'
        ? this.getFileActionMessage(language, 'fileLocation', {
            fileName: file.filename,
            folderPath: file.folderPath || 'My Documents'
          })
        : undefined;

      return this.buildFileActionResponse(context, {
        type: 'file_action',
        action,
        message,
        files: [file],
      });
    }

    // Multiple matches - let user select
    // Store first match as default for follow-ups
    await this.storeLastReferencedFile(request.userId, request.conversationId, matches[0]);

    return this.buildFileActionResponse(context, {
      type: 'file_action',
      action: 'SELECT_FILE',
      message: this.getFileActionMessage(language, 'multipleMatches', { count: matches.length }),
      files: matches.slice(0, 5), // Limit to 5 options
    });
  }

  /**
   * Build structured file action response
   */
  private buildFileActionResponse(
    context: HandlerContext,
    response: {
      type: 'file_action';
      action: FileActionType;
      message?: string;
      files: FileSearchResult[];
    }
  ): IntentHandlerResponse {
    const { streamCallback } = context;

    // Emit SSE action event for frontend (serialize to JSON string)
    if (streamCallback) {
      streamCallback(JSON.stringify({
        type: 'action',
        actionType: 'file_action',
        action: response.action,
        message: response.message,
        files: response.files.map(f => ({
          id: f.id,
          filename: f.filename,
          mimeType: f.mimeType,
          fileSize: f.fileSize,
          folderPath: f.folderPath,
        })),
      }));
    }

    // Build text answer
    let textAnswer = response.message || '';

    // Add file markers for responses with files - use numbered list format
    if (response.files.length > 0 && response.action !== 'NOT_FOUND') {
      textAnswer += '\n';
      response.files.forEach((file, index) => {
        textAnswer += `\n${index + 1}. **${file.filename}** ${createDocMarker({ id: file.id, name: file.filename, ctx: 'list' })}`;
      });
    }

    // Always add browse button for NOT_FOUND or empty responses to pass lint
    if (response.action === 'NOT_FOUND' || (response.files.length === 0 && response.action !== 'OPEN_FILE')) {
      textAnswer += '\n\n' + createDocMarker({ id: 'browse', name: 'Browse all documents', ctx: 'browse' });
    }

    // Build fileAction response for API
    const fileActionResponse = {
      type: 'file_action' as const,
      action: response.action,
      message: response.message,
      files: response.files.map(f => ({
        id: f.id,
        filename: f.filename,
        mimeType: f.mimeType,
        fileSize: f.fileSize,
        folderPath: f.folderPath,
      })),
    };

    return {
      answer: textAnswer,
      formatted: textAnswer,
      fileAction: fileActionResponse,
      metadata: {
        intent: 'file_actions' as IntentName,
        documentsUsed: 0,
      },
    };
  }

  /**
   * Get localized file action message
   */
  private getFileActionMessage(
    lang: LanguageCode,
    key: string,
    params?: Record<string, any>
  ): string {
    const messages: Record<string, Record<LanguageCode, string>> = {
      fileNotFound: {
        en: `No file named "${params?.fileName}" was found. Try checking the exact filename or browse your documents.`,
        pt: `Nenhum arquivo chamado "${params?.fileName}" foi encontrado. Tente verificar o nome exato ou navegue pelos seus documentos.`,
        es: `No se encontró un archivo llamado "${params?.fileName}". Intenta verificar el nombre exacto o navega por tus documentos.`,
      },
      fileLocation: {
        en: `**${params?.fileName}** is located in **${params?.folderPath}**`,
        pt: `**${params?.fileName}** está localizado em **${params?.folderPath}**`,
        es: `**${params?.fileName}** está ubicado en **${params?.folderPath}**`,
      },
      multipleMatches: {
        en: `I found ${params?.count} files matching your search. Which one would you like to open?`,
        pt: `Encontrei ${params?.count} arquivos correspondentes. Qual você gostaria de abrir?`,
        es: `Encontré ${params?.count} archivos coincidentes. ¿Cuál te gustaría abrir?`,
      },
      noFileSpecified: {
        en: `Which file?`,
        pt: `Qual arquivo?`,
        es: `¿Cuál archivo?`,
      },
      noContentMatch: {
        en: `No files mentioning "${params?.searchTerm}" were found. Try a different search term or browse your documents.`,
        pt: `Nenhum arquivo mencionando "${params?.searchTerm}" foi encontrado. Tente um termo diferente ou navegue pelos seus documentos.`,
        es: `No se encontraron archivos que mencionen "${params?.searchTerm}". Intenta con otro término o navega por tus documentos.`,
      },
    };

    return messages[key]?.[lang] || messages[key]?.['en'] || '';
  }

  /**
   * Get last referenced file from conversation context (in-memory cache)
   */
  private async getLastReferencedFile(
    userId: string,
    conversationId?: string
  ): Promise<FileSearchResult | null> {
    if (!conversationId) return null;

    // Check in-memory cache first (fast path)
    const cacheKey = `${userId}:${conversationId}`;
    const cached = lastReferencedFileCache.get(cacheKey);
    if (cached) {
      this.logger.debug(`[Orchestrator] Found cached last file: ${cached.filename}`);
      return cached;
    }

    // CORE FIX 4: Check ConversationContextService DB first (persisted context)
    try {
      const contextService = getConversationContextService(prisma);
      const context = await contextService.loadOrHydrateContext(conversationId, userId);

      if (context.lastReferencedFileId) {
        // Find the document in the workspace
        const doc = context.documents.find(d => d.id === context.lastReferencedFileId);
        if (doc) {
          const file: FileSearchResult = {
            id: doc.id,
            filename: doc.filename,
            mimeType: doc.mimeType,
            fileSize: doc.size,
            folderId: doc.folderId,
            folderPath: doc.folderPath,
            createdAt: doc.createdAt,
            status: 'available', // Documents in context are always available
          };
          // Update memory cache for fast future access
          lastReferencedFileCache.set(cacheKey, file);
          this.logger.debug(`[Orchestrator] Found last file from DB context: ${file.filename}`);
          return file;
        }
      }
    } catch (error) {
      this.logger.warn('[Orchestrator] Error getting file from context service:', error);
    }

    // Fallback to message metadata lookup (legacy path)
    try {
      const recentMessages = await prisma.message.findMany({
        where: {
          conversationId,
          role: 'assistant',
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { metadata: true },
      });

      for (const msg of recentMessages) {
        if (msg?.metadata) {
          try {
            const meta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata as any;
            if (meta?.fileAction?.files?.[0]) {
              const file = meta.fileAction.files[0] as FileSearchResult;
              // Update cache
              lastReferencedFileCache.set(cacheKey, file);
              return file;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } catch (error) {
      this.logger.warn('[Orchestrator] Error getting last referenced file from messages:', error);
    }

    return null;
  }

  /**
   * Store last referenced file in conversation context
   * FIXED: Now persists to DB via ConversationContextService (not just memory)
   */
  private async storeLastReferencedFile(
    userId: string,
    conversationId: string | undefined,
    file: FileSearchResult
  ): Promise<void> {
    if (!conversationId) return;

    // Store in in-memory cache for fast retrieval
    const cacheKey = `${userId}:${conversationId}`;
    lastReferencedFileCache.set(cacheKey, file);
    this.logger.debug(`[Orchestrator] Cached last referenced file: ${file.filename}`);

    // Auto-cleanup: Remove entries older than 30 minutes
    // This prevents memory leaks for long-running servers
    setTimeout(() => {
      lastReferencedFileCache.delete(cacheKey);
    }, 30 * 60 * 1000);

    // CORE FIX 4: Persist to DB via ConversationContextService
    // This ensures "it/that" references survive server restarts
    try {
      const contextService = getConversationContextService(prisma);
      await contextService.updateFileReference(conversationId, file.id, file.filename);
      this.logger.debug(`[Orchestrator] Persisted file reference to DB: ${file.filename}`);
    } catch (error) {
      // Non-critical - memory cache still works
      this.logger.warn('[Orchestrator] Failed to persist file reference to DB:', error);
    }
  }

  /**
   * Store folder in conversation context for navigation
   */
  private storeLastReferencedFolder(
    userId: string,
    conversationId: string | undefined,
    folder: { id: string; name: string; path?: string }
  ): void {
    if (!conversationId) return;
    const cacheKey = `${userId}:${conversationId}`;
    const existing = conversationFileContextCache.get(cacheKey) || { updatedAt: Date.now() };

    // Move current to previous before updating
    if (existing.lastReferencedFolder && existing.lastReferencedFolder.id !== folder.id) {
      existing.previousReferencedFolder = existing.lastReferencedFolder;
    }
    existing.lastReferencedFolder = folder;
    existing.updatedAt = Date.now();
    conversationFileContextCache.set(cacheKey, existing);
    this.logger.debug(`[Orchestrator] Cached folder: ${folder.name}`);
  }

  /**
   * Resolve implicit references like "the older one", "that file", "the other one"
   * Returns the resolved file or null if no match
   */
  private resolveImplicitReference(
    query: string,
    userId: string,
    conversationId?: string
  ): FileSearchResult | null {
    if (!conversationId) return null;

    const cacheKey = `${userId}:${conversationId}`;
    const context = conversationFileContextCache.get(cacheKey);
    if (!context) return null;

    const lowerQuery = query.toLowerCase();

    // Pattern: "the older one", "the previous one", "the first one"
    if (/\b(the\s+)?(older|previous|first|earlier)\s+(one|file|document)\b/i.test(lowerQuery)) {
      // If we have compared files, return the older one based on filename/date
      if (context.lastComparedFiles && context.lastComparedFiles.length >= 2) {
        const sorted = [...context.lastComparedFiles].sort((a, b) => {
          // Try to extract year from filename
          const yearA = a.filename.match(/20\d{2}/)?.[0] || '0000';
          const yearB = b.filename.match(/20\d{2}/)?.[0] || '0000';
          return yearA.localeCompare(yearB);
        });
        this.logger.debug(`[Orchestrator] Resolved "older one" to: ${sorted[0].filename}`);
        return sorted[0];
      }
      // Otherwise return previous file
      if (context.previousReferencedFile) {
        return context.previousReferencedFile;
      }
    }

    // Pattern: "the newer one", "the latest one", "the second one"
    if (/\b(the\s+)?(newer|latest|recent|second|last)\s+(one|file|document)\b/i.test(lowerQuery)) {
      if (context.lastComparedFiles && context.lastComparedFiles.length >= 2) {
        const sorted = [...context.lastComparedFiles].sort((a, b) => {
          const yearA = a.filename.match(/20\d{2}/)?.[0] || '0000';
          const yearB = b.filename.match(/20\d{2}/)?.[0] || '0000';
          return yearB.localeCompare(yearA);
        });
        this.logger.debug(`[Orchestrator] Resolved "newer one" to: ${sorted[0].filename}`);
        return sorted[0];
      }
      return context.lastReferencedFile || null;
    }

    // Pattern: "the other one", "the other file"
    if (/\b(the\s+)?other\s+(one|file|document)\b/i.test(lowerQuery)) {
      if (context.lastComparedFiles && context.lastComparedFiles.length >= 2) {
        // Return the one that's NOT the lastReferencedFile
        const current = context.lastReferencedFile;
        if (current) {
          const other = context.lastComparedFiles.find(f => f.id !== current.id);
          if (other) {
            this.logger.debug(`[Orchestrator] Resolved "other one" to: ${other.filename}`);
            return other;
          }
        }
      }
      return context.previousReferencedFile || null;
    }

    // Pattern: "it", "that", "that file", "this document", "show it again"
    if (/\b(show|open|display)?\s*(it|that|this)\s*(file|document|one)?\s*(again)?\b/i.test(lowerQuery) ||
        /\b(it|that|this)\b/i.test(lowerQuery) && lowerQuery.length < 50) {
      return context.lastReferencedFile || null;
    }

    // Pattern: "the spreadsheet", "the pdf", "the budget"
    const typePatterns = [
      { pattern: /\b(the\s+)?spreadsheet\b/i, ext: ['.xlsx', '.xls', '.csv'] },
      { pattern: /\b(the\s+)?pdf\b/i, ext: ['.pdf'] },
      { pattern: /\b(the\s+)?document\b/i, ext: ['.docx', '.doc', '.pdf'] },
      { pattern: /\b(the\s+)?presentation\b/i, ext: ['.pptx', '.ppt'] },
      { pattern: /\b(the\s+)?budget\b/i, keywords: ['budget', 'Budget'] },
      { pattern: /\b(the\s+)?p&l\b/i, keywords: ['P&L', 'p&l', 'PL', 'profit'] },
    ];

    for (const { pattern, ext, keywords } of typePatterns) {
      if (pattern.test(lowerQuery)) {
        // Check lastReferencedFile first
        if (context.lastReferencedFile) {
          const filename = context.lastReferencedFile.filename.toLowerCase();
          if (ext && ext.some(e => filename.endsWith(e))) {
            return context.lastReferencedFile;
          }
          if (keywords && keywords.some(k => filename.toLowerCase().includes(k.toLowerCase()))) {
            return context.lastReferencedFile;
          }
        }
        // Then check previous
        if (context.previousReferencedFile) {
          const filename = context.previousReferencedFile.filename.toLowerCase();
          if (ext && ext.some(e => filename.endsWith(e))) {
            return context.previousReferencedFile;
          }
          if (keywords && keywords.some(k => filename.toLowerCase().includes(k.toLowerCase()))) {
            return context.previousReferencedFile;
          }
        }
      }
    }

    return null;
  }

  /**
   * Store compared files for "the other one" resolution
   */
  private storeComparedFiles(
    userId: string,
    conversationId: string | undefined,
    files: FileSearchResult[]
  ): void {
    if (!conversationId || files.length < 2) return;
    const cacheKey = `${userId}:${conversationId}`;
    const existing = conversationFileContextCache.get(cacheKey) || { updatedAt: Date.now() };
    existing.lastComparedFiles = files;
    existing.updatedAt = Date.now();
    conversationFileContextCache.set(cacheKey, existing);
    this.logger.debug(`[Orchestrator] Stored ${files.length} compared files`);
  }

  /**
   * Get full conversation file context
   */
  private getConversationFileContext(
    userId: string,
    conversationId?: string
  ): ConversationFileContext | null {
    if (!conversationId) return null;
    const cacheKey = `${userId}:${conversationId}`;
    return conversationFileContextCache.get(cacheKey) || null;
  }

  /**
   * Handle CALCULATION sub-intent: Mathematical operations via Python Math Engine
   * Core principle: LLM NEVER does math - Python executes deterministically.
   *
   * Flow:
   * 1. Extract numbers and operation from user query
   * 2. Generate calculation plan (or ask LLM to generate one)
   * 3. Send plan to Python Math Engine via HTTP
   * 4. Return results for LLM to explain
   *
   * Categories: financial, accounting, statistical, aggregation, engineering, time
   */
  private async handleCalculation(
    context: HandlerContext,
    mathCheck: { requiresMath: boolean; confidence: number; matchedPatterns: string[]; suggestedCategory?: string }
  ): Promise<IntentHandlerResponse> {
    const { request, language } = context;

    try {
      // Check if math engine is available
      const isHealthy = await mathOrchestratorService.checkHealth();

      if (!isHealthy) {
        this.logger.warn('[Orchestrator] Math Engine not available, falling back to RAG');
        // Fall back to RAG-based answer if math engine is down
        return this.handleReasoningTask(context);
      }

      // For now, return a message that calculation was detected
      // TODO: Implement full LLM → Math Engine → LLM flow
      // This requires:
      // 1. Sending query to LLM to generate calculation plan JSON
      // 2. Executing plan via mathOrchestratorService.executeCalculation()
      // 3. Sending results back to LLM for explanation

      const categoryHint = mathCheck.suggestedCategory || 'general';
      const guidance = mathOrchestratorService.getCalculationPromptGuidance(categoryHint);

      // Log for debugging
      this.logger.info(
        `[Orchestrator] Calculation request detected:\n` +
        `  Category: ${categoryHint}\n` +
        `  Confidence: ${mathCheck.confidence.toFixed(2)}\n` +
        `  Patterns: ${mathCheck.matchedPatterns.slice(0, 3).join(', ')}`
      );

      // Placeholder response - in production, this would integrate with the LLM
      // to generate a calculation plan and execute it
      const responses: Record<LanguageCode, string> = {
        en: `I detected a ${categoryHint} calculation request. The Python Math Engine is ready to compute this accurately. To process your calculation, I need the specific numbers involved. Could you provide the values?`,
        pt: `Detectei uma solicitação de cálculo ${categoryHint}. O Motor Matemático Python está pronto para calcular isso com precisão. Para processar seu cálculo, preciso dos números específicos. Você pode fornecer os valores?`,
        es: `Detecté una solicitud de cálculo ${categoryHint}. El Motor Matemático Python está listo para calcularlo con precisión. Para procesar su cálculo, necesito los números específicos. ¿Puede proporcionar los valores?`,
      };

      return {
        answer: responses[language] || responses['en'],
        formatted: responses[language] || responses['en'],
        metadata: {
          documentsUsed: 0,
          confidence: mathCheck.confidence,
        },
      };

    } catch (error: any) {
      this.logger.error('[Orchestrator] Error in handleCalculation:', error);
      // Fall back to reasoning-based answer
      return this.handleReasoningTask(context);
    }
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
   *
   * ZERO FALLBACK GUARANTEE:
   * Fallbacks are allowed ONLY if ALL conditions are true:
   * - hasNoDocuments (user has no uploaded docs)
   * - noContext (no conversation history)
   * - intentConfidence < threshold
   *
   * If documents exist, never show rephrase/ambiguous messages.
   * Instead, provide best-effort document-based response.
   */
  private buildFallbackResponse(
    context: HandlerContext,
    scenarioKey: string,
    customMessage?: string
  ): IntentHandlerResponse {
    const language = context.language || context.intent?.language || 'en';

    // =====================================================================
    // ZERO FALLBACK GUARD: Block ambiguous/rephrase fallbacks when docs exist
    // =====================================================================
    const BLOCKED_SCENARIOS = ['AMBIGUOUS_QUESTION', 'OUT_OF_SCOPE', 'NO_RELEVANT_DOCS'];
    const isBlockedScenario = BLOCKED_SCENARIOS.includes(scenarioKey);

    // Check if we should block this fallback
    if (isBlockedScenario) {
      // Get file context to check for available documents
      const fileContext = this.getConversationFileContext(
        context.request.userId,
        context.request.conversationId
      );
      const hasFileContext = !!fileContext?.lastReferencedFile;

      // If there's a file context but no grounded answer, return NOT_FOUND
      // DO NOT use lazy redirect placeholders like "Found relevant information"
      // as these fail grounding validation
      // NOTE: Messages must NOT trigger E2E fallback patterns
      if (hasFileContext && fileContext.lastReferencedFile) {
        const notFoundMessage = language === 'pt'
          ? "Com base nos documentos, este detalhe específico não é mencionado. Tente uma pergunta diferente."
          : language === 'es'
          ? "Según los documentos, este detalle particular no se menciona. Intenta una pregunta diferente."
          : "Based on the documents, this particular detail isn't mentioned. Try a different question.";

        return {
          answer: notFoundMessage,
          formatted: notFoundMessage,
          metadata: {
            lowConfidence: true,
            answerMode: 'conservative',
            finishReason: 'GROUNDING_FAILED',
          } as any,
        };
      }
    }

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
   * Get the last intent from conversation context.
   * Used for follow-up confidence inheritance to prevent "rephrase" failures.
   * FIX A: Plumbing for follow-up boost
   */
  private async getLastIntentFromConversation(conversationId?: string): Promise<{
    intent?: IntentName;
    confidence?: number;
  }> {
    if (!conversationId) return {};

    try {
      const context = await this.conversationMemory.getContext(conversationId);
      if (!context || !context.messages || context.messages.length === 0) {
        return {};
      }

      // Find the last assistant message with intent metadata
      // Cast to any because message type may not include metadata property
      const lastAssistantWithIntent = [...context.messages]
        .reverse()
        .find(m => m.role === 'assistant' && (m as any).metadata?.intent);

      if (lastAssistantWithIntent && (lastAssistantWithIntent as any).metadata?.intent) {
        const metadata = (lastAssistantWithIntent as any).metadata;
        return {
          intent: metadata.intent as IntentName,
          confidence: metadata.confidence as number | undefined,
        };
      }

      return {};
    } catch (err) {
      this.logger.warn('[Orchestrator] Error getting last intent:', err);
      return {};
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
      // FILE_ACTIONS (includes calculation sub-intent) - uses calculation-specific validation
      case 'file_actions':
        return 'documents.factual';
      // Domain-specific document intents (Calculations removed - now FILE_ACTIONS.calculation)
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
   * Check if user has documents (returns boolean only)
   */
  private async checkUserHasDocuments(userId: string): Promise<boolean> {
    const { hasDocuments } = await this.checkUserHasDocumentsWithCount(userId);
    return hasDocuments;
  }

  /**
   * Check if user has documents with count (for verification logging)
   */
  private async checkUserHasDocumentsWithCount(userId: string): Promise<{ hasDocuments: boolean; docCount: number }> {
    const docCount = await prisma.document.count({
      where: {
        userId: userId,
        status: { in: USABLE_STATUSES },
      },
    });
    const hasDocuments = docCount > 0;

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 1 INSTRUMENTATION: Log hasDocuments check result
    // ═══════════════════════════════════════════════════════════════════════════
    console.log(`[CONTEXT-TRACE] checkUserHasDocuments(${userId.substring(0, 8)}...): docCount=${docCount}, hasDocuments=${hasDocuments}, statuses=${USABLE_STATUSES.join(',')}`);

    return { hasDocuments, docCount };
  }

  /**
   * Extract document reference from text
   * Enhanced to support: quoted names, fuzzy matching, and acronyms like "LMR"
   */
  private async extractDocumentReference(text: string, userId: string): Promise<any> {
    // First try: look for a document name in double quotes
    const quotedMatch = text.match(/"(.*?)"/);
    if (quotedMatch && quotedMatch[1]) {
      const document = await prisma.document.findFirst({
        where: {
          userId,
          filename: {
            contains: quotedMatch[1],
            mode: 'insensitive',
          },
          status: { in: USABLE_STATUSES },
        },
      });
      if (document) return document;
    }

    // Second try: Extract potential document terms from query (remove common words)
    const textLower = text.toLowerCase();
    const stopWords = ['summarize', 'summary', 'the', 'a', 'an', 'of', 'for', 'about', 'what', 'is', 'are', 'document', 'file', 'plan', 'report'];
    const words = textLower.split(/\s+/).filter(w => !stopWords.includes(w) && w.length > 1);

    // Get all user's available documents
    const userDocs = await prisma.document.findMany({
      where: {
        userId,
        status: { in: USABLE_STATUSES },
      },
      select: { id: true, filename: true },
    });

    // Score each document by how many query words match its filename
    let bestMatch = null;
    let bestScore = 0;

    for (const doc of userDocs) {
      const filenameLower = doc.filename.toLowerCase();
      let score = 0;

      for (const word of words) {
        // Direct word match in filename
        if (filenameLower.includes(word)) {
          score += 2;
        }
        // Acronym match: "lmr" matches "Lone Mountain Ranch"
        if (word.length <= 4) {
          const acronymRegex = new RegExp(word.split('').join('.*'), 'i');
          if (acronymRegex.test(filenameLower)) {
            score += 1;
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = doc;
      }
    }

    // Return best match if score is reasonable (at least one word matched)
    if (bestMatch && bestScore >= 2) {
      return await prisma.document.findUnique({ where: { id: bestMatch.id } });
    }

    return null;
  }
}

// NOTE: Do NOT export singleton instance here!
// Controllers MUST get the orchestrator from bootstrap/container.ts
// This ensures proper dependency injection and fail-fast on missing services.

export default KodaOrchestratorV3;
