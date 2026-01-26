/**
 * RAG Controller V3
 *
 * Clean RAG implementation using the V3 pipeline:
 * - Central orchestration via KodaOrchestratorV3
 * - Intent classification via KodaIntentEngineV3
 * - Retrieval via KodaRetrievalEngineV3
 * - Answer generation via KodaAnswerEngineV3
 * - Formatting via KodaFormattingPipelineV3
 *
 * Supports 25 intents (V3):
 * DOC_QA, DOC_ANALYTICS, DOC_MANAGEMENT, DOC_SEARCH, DOC_SUMMARIZE,
 * PREFERENCE_UPDATE, MEMORY_STORE, MEMORY_RECALL,
 * ANSWER_REWRITE, ANSWER_EXPAND, ANSWER_SIMPLIFY,
 * FEEDBACK_POSITIVE, FEEDBACK_NEGATIVE,
 * PRODUCT_HELP, ONBOARDING_HELP, FEATURE_REQUEST,
 * GENERIC_KNOWLEDGE, REASONING_TASK, TEXT_TRANSFORM,
 * CHITCHAT, META_AI, OUT_OF_SCOPE, AMBIGUOUS, SAFETY_CONCERN, MULTI_INTENT, UNKNOWN
 */

import { Request, Response } from 'express';
import prisma from '../config/database';
// cacheService now accessed via getContainer().getCache()
import { generateConversationTitle } from '../services/openai.service';

// V3 Services - Get from container (proper DI)
import { getContainer } from '../bootstrap/container';
import { KodaOrchestratorV3, OrchestratorRequest } from '../services/core/kodaOrchestratorV3.service';
import { KodaIntentEngineV3 } from '../services/core/kodaIntentEngineV3.service';
import { LanguageCode } from '../types/intentV3.types';

// CRITICAL: ConversationContextService - Single source of truth for context
import { getConversationContextService, ConversationContext } from '../services/conversationContext.service';
// P1 FIX: Unified context loader - combines DB context + memory context
import { loadUnifiedContext, buildOrchestratorContext } from '../services/conversationUnifiedContext.service';

// IMPORTANT: Get services from container (not singleton imports)
// This ensures proper dependency injection
function getOrchestrator(): KodaOrchestratorV3 {
  return getContainer().getOrchestrator();
}

function getIntentEngine(): KodaIntentEngineV3 {
  return getContainer().getIntentEngine();
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Ensure conversation exists before creating messages
 */
async function ensureConversationExists(conversationId: string, userId: string) {
  let conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    console.log(`[RAG V3] Creating conversation ${conversationId}`);
    conversation = await prisma.conversation.create({
      data: {
        id: conversationId,
        userId,
        title: 'New Chat',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  return conversation;
}

// ============================================================================
// Main RAG Endpoint
// ============================================================================

/**
 * POST /api/rag/query
 * Generate an answer using RAG V3
 */
export const queryWithRAG = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      query,
      conversationId,
      language = 'en',
      attachedDocuments = [],
      documentId,
    } = req.body;

    if (!query || !conversationId) {
      res.status(400).json({ error: 'Query and conversationId are required' });
      return;
    }

    console.log(`[RAG V3] Query: "${query.substring(0, 50)}..."`);

    // P1 FIX: Use unified context loader (combines DB + memory)
    // This ensures lastDocumentIds and lastIntent are passed for follow-up queries
    const unifiedContext = await loadUnifiedContext(prisma, conversationId, userId);
    console.log(`[RAG V3] Context: ${unifiedContext.documentCount} docs, ${unifiedContext.messageCount} messages, lastDocIds=${unifiedContext.lastDocumentIds.length}`);

    // Handle document attachments
    let attachedDocumentIds: string[] = [];
    if (attachedDocuments && attachedDocuments.length > 0) {
      attachedDocumentIds = attachedDocuments
        .map((doc: any) => (typeof doc === 'string' ? doc : doc.id))
        .filter(Boolean);
      console.log(`[RAG V3] ${attachedDocumentIds.length} documents attached`);
    } else if (documentId) {
      attachedDocumentIds = [documentId];
      console.log(`[RAG V3] Single document attached: ${documentId}`);
    }

    // Ensure conversation exists
    await ensureConversationExists(conversationId, userId);

    // Build V3 request with unified context (includes lastDocumentIds for follow-ups)
    const request: OrchestratorRequest = {
      userId,
      text: query,
      language: (language as LanguageCode) || 'en',
      conversationId,
      context: {
        ...buildOrchestratorContext(unifiedContext),
        attachedDocumentIds: attachedDocumentIds.length > 0 ? attachedDocumentIds : undefined,
      },
    };

    // Call V3 orchestrator
    const response = await getOrchestrator().orchestrate(request);

    console.log(`[RAG V3] Intent: ${response.metadata?.intent}, Time: ${Date.now() - startTime}ms`);

    // Save user message
    const userMessage = await prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        content: query,
        metadata: attachedDocumentIds.length > 0
          ? JSON.stringify({ attachedFiles: attachedDocumentIds })
          : null,
      },
    });

    // Save assistant message
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: response.answer,
        metadata: JSON.stringify({
          primaryIntent: response.metadata?.intent,
          language: request.language,
          sourceDocumentIds: response.metadata?.sourceDocumentIds || [],
          sources: response.sources || [],
          citations: response.citations || [],
          confidenceScore: response.metadata?.confidence,
          documentsUsed: response.metadata?.documentsUsed,
        }),
      },
    });

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // PHASE 1: Increment message count in ConversationContextStore
    await getConversationContextService(prisma).incrementMessageCount(conversationId);

    // NOTE: DO NOT invalidate conversation memory cache here!
    // The orchestrator saves lastIntent and lastDocumentIds to cache for follow-up queries.
    // Invalidating here would destroy that metadata and break context continuity.
    // (See q16/q40 conversation chain failures when this was active)

    // Generate title if first message
    const messageCount = await prisma.message.count({ where: { conversationId } });
    if (messageCount <= 2) {
      try {
        const title = await generateConversationTitle(query);
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { title },
        });
        console.log(`[RAG V3] Generated title: "${title}"`);
      } catch (err) {
        console.warn('[RAG V3] Title generation failed:', err);
      }
    }

    // Invalidate cache
    const cacheKey = getContainer().getCache().generateKey('conversation', conversationId, userId);
    await getContainer().getCache().set(cacheKey, null, { ttl: 0 });

    // Return response with sources, citations, and file actions
    res.status(200).json({
      answer: response.answer,
      formatted: response.formatted,  // Formatted text with {{DOC::...}} markers
      sources: response.sources || [], // Sources from orchestrator for frontend display
      citations: response.citations || [], // Citations for detailed reference
      intent: response.metadata?.intent,
      // File action response for file discovery mode
      fileAction: response.fileAction || null,
      userMessage: {
        id: userMessage.id,
        content: userMessage.content,
      },
      assistantMessage: {
        id: assistantMessage.id,
        content: assistantMessage.content,
      },
      metadata: {
        primaryIntent: response.metadata?.intent,
        language: request.language,
        confidenceScore: response.metadata?.confidence,
        totalTimeMs: Date.now() - startTime,
        documentsUsed: response.metadata?.documentsUsed,
        sourceDocumentIds: response.metadata?.sourceDocumentIds,
      },
    });
  } catch (error: any) {
    console.error('[RAG V3] Error:', error);
    res.status(500).json({
      error: error.message || 'Internal server error',
      answer: 'Sorry, an error occurred while processing your question. Please try again.',
    });
  }
};

// ============================================================================
// Follow-up Endpoint
// ============================================================================

/**
 * POST /api/rag/follow-up
 * Answer a follow-up question
 */
export const answerFollowUp = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { query, conversationId, language = 'en' } = req.body;
    if (!query || !conversationId) {
      res.status(400).json({ error: 'Query and conversationId are required' });
      return;
    }

    // P1 FIX: Load unified context (was completely missing!)
    // Without this, follow-up queries would NOT have access to lastDocumentIds/lastIntent
    const unifiedContext = await loadUnifiedContext(prisma, conversationId, userId);
    console.log(`[RAG V3] Follow-up context: ${unifiedContext.documentCount} docs, lastDocIds=${unifiedContext.lastDocumentIds.length}, lastIntent=${unifiedContext.lastIntent}`);

    const request: OrchestratorRequest = {
      userId,
      text: query,
      language: (language as LanguageCode) || 'en',
      conversationId,
      context: buildOrchestratorContext(unifiedContext),
    };

    const response = await getOrchestrator().orchestrate(request);

    res.status(200).json({
      answer: response.answer,
      sources: response.sources || [],
      metadata: {
        primaryIntent: response.metadata?.intent,
        confidenceScore: response.metadata?.confidence,
        sourceDocumentIds: response.metadata?.sourceDocumentIds || [],
      },
    });
  } catch (error: any) {
    console.error('[RAG V3] Follow-up error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================================
// Streaming Endpoint
// ============================================================================

/**
 * POST /api/rag/query/stream
 * Generate answer with SSE streaming
 *
 * TRUE STREAMING with instant feel:
 * - AbortController propagated to LLM for clean cancellation
 * - DB writes deferred until AFTER streaming for optimal TTFT
 * - Single done event with all metadata for client persistence
 */
export const queryWithRAGStreaming = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { query, conversationId, language = 'en' } = req.body;
    if (!query || !conversationId) {
      res.status(400).json({ error: 'Query and conversationId are required' });
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // P1 FIX: Use unified context loader (combines DB + memory in one call)
    // This ensures ALL endpoints use the same context loading logic.
    // ═══════════════════════════════════════════════════════════════════════════
    const unifiedContext = await loadUnifiedContext(prisma, conversationId, userId);

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`[CONTEXT-TRACE] ${requestId}`);
    console.log(`├── userId: ${userId}`);
    console.log(`├── conversationId: ${conversationId}`);
    console.log(`├── query: "${query.substring(0, 60)}..."`);
    console.log(`├── docCount (HYDRATED): ${unifiedContext.documentCount}`);
    console.log(`├── messageCount: ${unifiedContext.messageCount}`);
    console.log(`├── hasDocuments: ${unifiedContext.documentCount > 0}`);
    console.log(`├── lastReferencedFile: ${unifiedContext.lastReferencedFileName || 'none'}`);
    console.log(`├── lastDocumentIds (MEMORY): ${unifiedContext.lastDocumentIds.length} docs`);
    console.log(`├── lastIntent (MEMORY): ${unifiedContext.lastIntent || 'none'}`);
    console.log(`└── timestamp: ${new Date().toISOString()}`);
    console.log(`${'═'.repeat(70)}\n`);
    // ═══════════════════════════════════════════════════════════════════════════

    // TTFT OPTIMIZATION: Ensure conversation exists BEFORE setting up SSE
    // This is a fast DB check that must happen before streaming starts
    await ensureConversationExists(conversationId, userId);

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Create AbortController for clean cancellation
    const abortController = new AbortController();
    const { signal } = abortController;

    // Handle client disconnect - trigger abort signal
    let aborted = false;
    req.on('close', () => {
      if (!aborted) {
        aborted = true;
        abortController.abort();
        console.log('[RAG V3] Client disconnected, abort signal sent');
      }
    });

    const request: OrchestratorRequest = {
      userId,
      text: query,
      language: (language as LanguageCode) || 'en',
      conversationId,
      abortSignal: signal, // Pass abort signal to orchestrator
      // P1 FIX: Use unified context for all context data
      context: buildOrchestratorContext(unifiedContext),
    };

    // TRUE STREAMING: Use orchestrator's async generator
    const stream = getOrchestrator().orchestrateStream(request);

    let fullAnswer = '';
    let streamResult: any = {};
    let citations: any[] = [];

    // FIXED: Consume generator with manual iteration to capture return value
    // Forward all events EXCEPT done (we'll send a combined done with message IDs)
    let iterResult = await stream.next();
    while (!iterResult.done) {
      // Check abort signal (more reliable than flag)
      if (signal.aborted) {
        console.log('[RAG V3] Stream aborted by client (signal)');
        break;
      }

      const event = iterResult.value;

      // Accumulate content for saving
      if (event.type === 'content') {
        fullAnswer += (event as any).content;
        // Forward content events immediately - NO BUFFERING
        // P1 FIX: Add requestId to ALL SSE events for stream correlation
        res.write(`data: ${JSON.stringify({ ...event, requestId })}\n\n`);
      } else if (event.type === 'citation') {
        // Capture and forward citation events
        citations = (event as any).citations || [];
        res.write(`data: ${JSON.stringify({ ...event, requestId })}\n\n`);
      } else if (event.type === 'done') {
        // Capture done event metadata but DON'T forward (we'll send combined done later)
        const doneEvent = event as any;
        fullAnswer = doneEvent.fullAnswer || fullAnswer;
        streamResult = {
          intent: doneEvent.intent,
          confidence: doneEvent.confidence,
          documentsUsed: doneEvent.documentsUsed,
          tokensUsed: doneEvent.tokensUsed,
          processingTime: doneEvent.processingTime,
          wasTruncated: doneEvent.wasTruncated,
          citations: doneEvent.citations || citations,
          sources: doneEvent.sources || [], // FIXED: Capture sources for frontend
          sourceDocumentIds: doneEvent.sourceDocumentIds || [],
          formatted: doneEvent.formatted, // Formatted answer with {{DOC::...}} markers
          // QW1: Capture structured file action fields for deterministic rendering
          attachments: doneEvent.attachments || [],
          actions: doneEvent.actions || [],
          referencedFileIds: doneEvent.referencedFileIds || [],
          // REDO 3: CHATGPT-LIKE source buttons for frontend rendering as clickable pills
          sourceButtons: doneEvent.sourceButtons || null,
          // CERTIFICATION: Capture fileList for inventory queries
          fileList: doneEvent.fileList || null,
          // PREFLIGHT GATE 1: Capture composedBy stamp from orchestrator done event
          composedBy: doneEvent.composedBy || undefined,
          // CHATGPT-LIKE INSTRUMENTATION: Capture certification fields from orchestrator
          operator: doneEvent.operator || undefined,
          templateId: doneEvent.templateId || undefined,
          languageDetected: doneEvent.languageDetected || undefined,
          languageLocked: doneEvent.languageLocked || undefined,
          truncationRepairApplied: doneEvent.truncationRepairApplied ?? undefined,
          docScope: doneEvent.docScope || undefined,
          scopeDocIds: doneEvent.scopeDocIds || undefined,
          anchorTypes: doneEvent.anchorTypes || undefined,
          attachmentsTypes: doneEvent.attachmentsTypes || undefined,
          // TRUST GATE: Anti-hallucination validation results (required for ChatGPT parity)
          trustCheck: doneEvent.trustCheck || undefined,
        };
      } else {
        // Forward other events (intent, retrieving, generating, metadata, etc.)
        // P1 FIX: Add requestId to ALL SSE events for stream correlation
        res.write(`data: ${JSON.stringify({ ...event, requestId })}\n\n`);
      }

      iterResult = await stream.next();
    }

    // Also capture generator return value as fallback
    if (iterResult.done && iterResult.value) {
      const returnValue = iterResult.value;
      fullAnswer = returnValue.fullAnswer || fullAnswer;
      if (!streamResult.intent) {
        streamResult = {
          ...streamResult,
          intent: returnValue.intent,
          confidence: returnValue.confidence,
          documentsUsed: returnValue.documentsUsed,
          tokensUsed: returnValue.tokensUsed,
          processingTime: returnValue.processingTime,
          wasTruncated: returnValue.wasTruncated,
          citations: returnValue.citations || citations,
        };
      }
    }

    // Don't save if aborted - just end the response
    if (signal.aborted) {
      console.log('[RAG V3] Stream aborted, skipping DB writes');
      res.end();
      return;
    }

    // TTFT OPTIMIZATION: DB writes happen AFTER streaming is complete
    // This ensures the user sees tokens immediately without waiting for DB
    const userMessage = await prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        content: query,
      },
    });

    const assistantMessage = await prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: fullAnswer,
        metadata: JSON.stringify({
          primaryIntent: streamResult.intent,
          confidence: streamResult.confidence,
          processingTime: streamResult.processingTime,
          documentsUsed: streamResult.documentsUsed,
          tokensUsed: streamResult.tokensUsed,
          wasTruncated: streamResult.wasTruncated,
          citations: streamResult.citations || citations,
          sourceDocumentIds: streamResult.sourceDocumentIds || [],
          // QW1: Persist structured file action fields
          attachments: streamResult.attachments || [],
          actions: streamResult.actions || [],
          referencedFileIds: streamResult.referencedFileIds || [],
        }),
      },
    });

    // PHASE 1: Increment message count in ConversationContextStore
    await getConversationContextService(prisma).incrementMessageCount(conversationId);

    // NOTE: DO NOT invalidate conversation memory cache here!
    // The orchestrator saves lastIntent and lastDocumentIds to cache for follow-up queries (line 2343-2352).
    // Invalidating here would destroy that metadata and break conversation context continuity.
    // The original comment was misleading - getLastIntentFromConversation reads from cache metadata,
    // not from DB assistant messages. Cache must persist across requests for follow-ups to work.

    // Send SINGLE combined done event with message IDs, citations, sources, and full metadata
    // IMPORTANT: formatted field contains the answer with {{DOC::...}} markers for frontend rendering
    // CRITICAL: 'sources' field is required by frontend DocumentSources component
    // QW1: 'attachments', 'actions', 'referencedFileIds' for deterministic file button rendering
    // Build constraints object for frontend rendering
    const constraints = streamResult.constraints || {};
    // Also check for buttonOnly in metadata (legacy field)
    if ((streamResult as any).metadata?.buttonOnly) {
      constraints.buttonsOnly = true;
    }

    // P1 FIX: Add requestId to done event for stream correlation
    res.write(
      `data: ${JSON.stringify({
        type: 'done',
        requestId, // S1.1: Every SSE event includes requestId
        messageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        conversationId,
        fullAnswer,
        formatted: streamResult.formatted || fullAnswer, // Formatted answer with markers
        intent: streamResult.intent,
        confidence: streamResult.confidence,
        processingTime: Date.now() - startTime,
        documentsUsed: streamResult.documentsUsed,
        tokensUsed: streamResult.tokensUsed,
        wasTruncated: streamResult.wasTruncated || false,
        citations: streamResult.citations || citations,
        sources: streamResult.sources || [], // FIXED: Frontend expects 'sources' for DocumentSources component
        sourceDocumentIds: streamResult.sourceDocumentIds || [],
        // QW1: Structured file action fields for deterministic button rendering
        attachments: streamResult.attachments || [],
        actions: streamResult.actions || [],
        referencedFileIds: streamResult.referencedFileIds || [],
        // REDO 3: CHATGPT-LIKE source buttons for frontend rendering as clickable pills
        sourceButtons: (streamResult as any).sourceButtons || null,
        // CERTIFICATION: fileList for inventory queries
        fileList: (streamResult as any).fileList || null,
        // Formatting constraints for frontend rendering (buttonsOnly, jsonOnly, etc.)
        constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
        // PREFLIGHT GATE 1: Composer stamp for verification
        composedBy: (streamResult as any).composedBy || undefined,
        // CHATGPT-LIKE INSTRUMENTATION: Certification testing fields
        operator: (streamResult as any).operator || undefined,
        templateId: (streamResult as any).templateId || undefined,
        languageDetected: (streamResult as any).languageDetected || undefined,
        languageLocked: (streamResult as any).languageLocked || undefined,
        truncationRepairApplied: (streamResult as any).truncationRepairApplied,
        docScope: (streamResult as any).docScope || undefined,
        scopeDocIds: (streamResult as any).scopeDocIds || undefined,
        anchorTypes: (streamResult as any).anchorTypes || undefined,
        attachmentsTypes: (streamResult as any).attachmentsTypes || undefined,
        // TRUST GATE: Anti-hallucination validation results (required for ChatGPT parity)
        trustCheck: (streamResult as any).trustCheck || undefined,
      })}\n\n`
    );

    res.end();
  } catch (error: any) {
    console.error('[RAG V3] Streaming error:', error);
    // P1 FIX: Add requestId to error event for stream correlation
    res.write(`data: ${JSON.stringify({ type: 'error', requestId, error: error.message })}\n\n`);
    res.end();
  }
};

// ============================================================================
// Intent Classification Endpoint (for debugging)
// ============================================================================

/**
 * GET/POST /api/rag/classify
 * Classify intent for debugging
 *
 * GET: /api/rag/classify?text=Hello&language=en
 * POST: { query: "Hello", language: "en" }
 *
 * Returns detailed classification info:
 * - intent: Primary intent name
 * - confidence: Classification confidence (0-1)
 * - domain: Domain if domain-specific intent
 * - matchedPattern: Regex pattern that matched (if any)
 * - matchedKeywords: Keywords that matched
 * - secondaryIntents: Secondary intent candidates
 */
export const classifyIntent = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    // Support both GET (query params) and POST (body)
    const text = (req.query.text as string) || req.body.query || req.body.text;
    const language = ((req.query.language as string) || req.body.language || 'en') as LanguageCode;

    if (!text) {
      res.status(400).json({
        error: 'Text is required',
        usage: 'GET /api/rag/classify?text=your+query&language=en',
      });
      return;
    }

    const startTime = Date.now();

    // Get intent prediction
    const intent = await getIntentEngine().predict({
      text,
      language,
      context: { userId: userId || 'anonymous' },
    });

    // Import domain enforcement to check if intent is domain-specific
    const { domainEnforcementService } = await import('../services/core/domainEnforcement.service');
    const domainContext = domainEnforcementService.getDomainContext(intent.primaryIntent);

    // Build debug response
    const response = {
      // Core classification
      intent: intent.primaryIntent,
      confidence: Math.round(intent.confidence * 100) / 100,
      language: intent.language,

      // Domain info
      domain: domainContext.isDomainSpecific ? domainContext.domain : null,
      domainFileTypes: domainContext.fileTypeFilters || null,

      // Match details
      matchedPattern: intent.matchedPattern || null,
      matchedKeywords: intent.matchedKeywords || [],

      // Secondary intents
      secondaryIntents: intent.secondaryIntents?.map(s => ({
        intent: s.name,
        confidence: Math.round(s.confidence * 100) / 100,
      })) || [],

      // Metadata
      processingTimeMs: Date.now() - startTime,
      isAmbiguous: intent.metadata?.isAmbiguous || false,
      totalIntentsScored: intent.metadata?.totalIntentsScored,

      // Debug
      _query: text,
      _timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('[RAG V3] Classify error:', error);
    res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

// ============================================================================
// Context Endpoint (for debugging)
// ============================================================================

/**
 * GET /api/rag/context
 * Get RAG context for debugging
 */
export const getContext = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { query, language = 'en' } = req.query;
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Query parameter is required' });
      return;
    }

    // Classify intent using V3
    const intent = await getIntentEngine().predict({
      text: query,
      language: ((language as string) || 'en') as LanguageCode,
      context: { userId },
    });

    res.status(200).json({
      intent,
      primaryIntent: intent.primaryIntent,
      language: intent.language,
      confidence: intent.confidence,
    });
  } catch (error: any) {
    console.error('[RAG V3] Context error:', error);
    res.status(500).json({ error: error.message });
  }
};
