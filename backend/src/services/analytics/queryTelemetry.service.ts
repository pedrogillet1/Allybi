/**
 * QueryTelemetryService - Complete observability for RAG pipeline
 *
 * This service captures, stores, and aggregates telemetry for every query.
 * It provides the data backbone for the analytics dashboard control plane.
 */

import prisma from '../../config/database';
import { v4 as uuid } from 'uuid';
import type {
  QueryTelemetry,
  IntentTelemetry,
  RetrievalTelemetry,
  EvidenceGateTelemetry,
  FormattingTelemetry,
  LanguageTelemetry,
  QualityTelemetry,
  LatencyTelemetry,
  TokenTelemetry,
  StreamingTelemetry,
  PipelineTelemetry,
  ErrorTelemetry,
  TelemetryBuilder,
  IntentAnalytics,
  RetrievalAnalytics,
  QualityAnalytics,
  LanguageAnalytics,
  PerformanceAnalytics,
  CostAnalytics,
  QueryListItem,
  QueryDetail,
  FailureCategory,
} from '../../types/queryTelemetry.types';

// ============================================================================
// TELEMETRY BUILDER IMPLEMENTATION
// ============================================================================

class TelemetryBuilderImpl implements TelemetryBuilder {
  private telemetry: Partial<QueryTelemetry>;

  constructor(userId: string, conversationId?: string, messageId?: string) {
    this.telemetry = {
      id: uuid(),
      queryId: uuid(),
      userId,
      conversationId,
      messageId,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date(),
      intent: this.defaultIntent(),
      retrieval: this.defaultRetrieval(),
      evidenceGate: this.defaultEvidenceGate(),
      formatting: this.defaultFormatting(),
      language: this.defaultLanguage(),
      quality: this.defaultQuality(),
      latency: this.defaultLatency(),
      tokens: this.defaultTokens(),
      streaming: this.defaultStreaming(),
      pipeline: this.defaultPipeline(),
      errors: [],
      warnings: [],
    };
  }

  private defaultIntent(): IntentTelemetry {
    return {
      intent: 'unknown',
      confidence: 0,
      secondaryIntents: [],
      isMultiIntent: false,
      segmentCount: 1,
      questionType: 'OTHER',
      queryScope: 'SINGLE_DOC',
      domain: 'GENERAL',
      depth: 'D1',
      family: 'unknown',
      matchedPatterns: [],
      matchedKeywords: [],
      blockedByNegatives: false,
      classificationTimeMs: 0,
    };
  }

  private defaultRetrieval(): RetrievalTelemetry {
    return {
      chunksReturned: 0,
      bm25Results: 0,
      vectorResults: 0,
      distinctDocs: 0,
      documentIds: [],
      topRelevanceScore: 0,
      avgRelevanceScore: 0,
      minRelevanceScore: 0,
      totalSnippetChars: 0,
      retrievalAdequate: false,
      method: 'hybrid',
      mergeStrategy: 'none',
      budgets: { vectorTopK: 0, bm25TopK: 0, fusedTopK: 0, finalK: 0, maxContextTokens: 0 },
      expansionAttempts: 0,
      meetsAllFloors: false,
    };
  }

  private defaultEvidenceGate(): EvidenceGateTelemetry {
    return {
      action: null,
      shouldProceed: true,
      metrics: { chunksReturned: 0, distinctDocs: 0, totalSnippetChars: 0 },
      thresholds: { minChunks: 0, minDistinctDocs: 0, minSnippetChars: 0 },
    };
  }

  private defaultFormatting(): FormattingTelemetry {
    return {
      formatMode: 'default',
      passed: true,
      violations: [],
      constraints: { buttonsOnly: false, jsonOnly: false, csvOnly: false, tableOnly: false },
      postProcessing: [],
    };
  }

  private defaultLanguage(): LanguageTelemetry {
    return {
      resolvedLang: 'en',
      source: 'default',
      hasMismatch: false,
      enforcementApplied: false,
      bannedPhrasesFound: [],
    };
  }

  private defaultQuality(): QualityTelemetry {
    return {
      isUseful: true,
      hadFallback: false,
      citationCount: 0,
      sourcesMissing: false,
      answerLength: 0,
      flags: {
        ungroundedClaims: false,
        underinformative: false,
        metadataOnly: false,
        thinRetrieval: false,
        incompleteSummary: false,
        compareSingleDoc: false,
        truncated: false,
      },
    };
  }

  private defaultLatency(): LatencyTelemetry {
    return {
      ttft: 0,
      retrievalMs: 0,
      llmMs: 0,
      embeddingMs: 0,
      pineconeMs: 0,
      bm25Ms: 0,
      formattingMs: 0,
      totalMs: 0,
    };
  }

  private defaultTokens(): TokenTelemetry {
    return {
      model: 'gemini-1.5-flash',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      contextUsed: 0,
      contextMax: 0,
    };
  }

  private defaultStreaming(): StreamingTelemetry {
    return {
      streamStarted: false,
      firstTokenReceived: false,
      streamEnded: false,
      clientDisconnected: false,
      sseErrors: [],
      chunksSent: 0,
      streamDurationMs: 0,
      wasAborted: false,
    };
  }

  private defaultPipeline(): PipelineTelemetry {
    return {
      signature: '',
      handler: '',
      family: '',
      ragEnabled: false,
      hybridSearchUsed: false,
      productHelpUsed: false,
      mathUsed: false,
    };
  }

  setIntent(intent: Partial<IntentTelemetry>): TelemetryBuilder {
    this.telemetry.intent = { ...this.telemetry.intent!, ...intent };
    return this;
  }

  setRetrieval(retrieval: Partial<RetrievalTelemetry>): TelemetryBuilder {
    this.telemetry.retrieval = { ...this.telemetry.retrieval!, ...retrieval };
    return this;
  }

  setEvidenceGate(gate: Partial<EvidenceGateTelemetry>): TelemetryBuilder {
    this.telemetry.evidenceGate = { ...this.telemetry.evidenceGate!, ...gate };
    return this;
  }

  setFormatting(formatting: Partial<FormattingTelemetry>): TelemetryBuilder {
    this.telemetry.formatting = { ...this.telemetry.formatting!, ...formatting };
    return this;
  }

  setLanguage(language: Partial<LanguageTelemetry>): TelemetryBuilder {
    this.telemetry.language = { ...this.telemetry.language!, ...language };
    return this;
  }

  setQuality(quality: Partial<QualityTelemetry>): TelemetryBuilder {
    this.telemetry.quality = { ...this.telemetry.quality!, ...quality };
    return this;
  }

  setLatency(latency: Partial<LatencyTelemetry>): TelemetryBuilder {
    this.telemetry.latency = { ...this.telemetry.latency!, ...latency };
    return this;
  }

  setTokens(tokens: Partial<TokenTelemetry>): TelemetryBuilder {
    this.telemetry.tokens = { ...this.telemetry.tokens!, ...tokens };
    return this;
  }

  setStreaming(streaming: Partial<StreamingTelemetry>): TelemetryBuilder {
    this.telemetry.streaming = { ...this.telemetry.streaming!, ...streaming };
    return this;
  }

  setPipeline(pipeline: Partial<PipelineTelemetry>): TelemetryBuilder {
    this.telemetry.pipeline = { ...this.telemetry.pipeline!, ...pipeline };
    return this;
  }

  addError(error: ErrorTelemetry): TelemetryBuilder {
    this.telemetry.errors = [...(this.telemetry.errors || []), error];
    return this;
  }

  addWarning(warning: string): TelemetryBuilder {
    this.telemetry.warnings = [...(this.telemetry.warnings || []), warning];
    return this;
  }

  build(): QueryTelemetry {
    return this.telemetry as QueryTelemetry;
  }
}

// ============================================================================
// QUERY TELEMETRY SERVICE
// ============================================================================

export class QueryTelemetryService {
  /**
   * Create a new telemetry builder for a query
   */
  createBuilder(userId: string, conversationId?: string, messageId?: string): TelemetryBuilder {
    return new TelemetryBuilderImpl(userId, conversationId, messageId);
  }

  /**
   * Save telemetry to the database
   */
  async save(telemetry: QueryTelemetry): Promise<void> {
    try {
      await prisma.queryTelemetry.create({
        data: {
          id: telemetry.id,
          queryId: telemetry.queryId,
          userId: telemetry.userId,
          conversationId: telemetry.conversationId,
          messageId: telemetry.messageId,
          environment: telemetry.environment,
          timestamp: telemetry.timestamp,

          // Intent
          intent: telemetry.intent.intent,
          intentConfidence: telemetry.intent.confidence,
          questionType: telemetry.intent.questionType,
          queryScope: telemetry.intent.queryScope,
          domain: telemetry.intent.domain,
          depth: telemetry.intent.depth,
          family: telemetry.intent.family,
          subIntent: telemetry.intent.subIntent,
          isMultiIntent: telemetry.intent.isMultiIntent,
          segmentCount: telemetry.intent.segmentCount,
          matchedPatterns: telemetry.intent.matchedPatterns,
          matchedKeywords: telemetry.intent.matchedKeywords,
          blockedByNegatives: telemetry.intent.blockedByNegatives,
          overrideReason: telemetry.intent.overrideReason,
          classificationTimeMs: telemetry.intent.classificationTimeMs,

          // Retrieval
          chunksReturned: telemetry.retrieval.chunksReturned,
          bm25Results: telemetry.retrieval.bm25Results,
          vectorResults: telemetry.retrieval.vectorResults,
          distinctDocs: telemetry.retrieval.distinctDocs,
          documentIds: telemetry.retrieval.documentIds,
          topRelevanceScore: telemetry.retrieval.topRelevanceScore,
          avgRelevanceScore: telemetry.retrieval.avgRelevanceScore,
          minRelevanceScore: telemetry.retrieval.minRelevanceScore,
          totalSnippetChars: telemetry.retrieval.totalSnippetChars,
          retrievalAdequate: telemetry.retrieval.retrievalAdequate,
          retrievalMethod: telemetry.retrieval.method,
          mergeStrategy: telemetry.retrieval.mergeStrategy,
          expansionAttempts: telemetry.retrieval.expansionAttempts,
          meetsAllFloors: telemetry.retrieval.meetsAllFloors,
          retrievalBudgets: telemetry.retrieval.budgets,

          // Evidence Gate
          evidenceGateAction: telemetry.evidenceGate.action,
          evidenceGateMessage: telemetry.evidenceGate.message,
          evidenceShouldProceed: telemetry.evidenceGate.shouldProceed,

          // Formatting
          formatMode: telemetry.formatting.formatMode,
          formattingPassed: telemetry.formatting.passed,
          formattingViolations: telemetry.formatting.violations,
          bulletPolicy: telemetry.formatting.bulletPolicy,
          constraints: telemetry.formatting.constraints,

          // Language
          resolvedLang: telemetry.language.resolvedLang,
          languageSource: telemetry.language.source,
          detectedLang: telemetry.language.detectedLang,
          languageMismatch: telemetry.language.hasMismatch,
          enforcementApplied: telemetry.language.enforcementApplied,
          bannedPhrasesFound: telemetry.language.bannedPhrasesFound,

          // Quality
          isUseful: telemetry.quality.isUseful,
          failureCategory: telemetry.quality.failureCategory,
          hadFallback: telemetry.quality.hadFallback,
          fallbackScenario: telemetry.quality.fallbackScenario,
          citationCount: telemetry.quality.citationCount,
          sourcesMissing: telemetry.quality.sourcesMissing,
          answerLength: telemetry.quality.answerLength,
          ungroundedClaims: telemetry.quality.flags.ungroundedClaims,
          underinformative: telemetry.quality.flags.underinformative,
          metadataOnly: telemetry.quality.flags.metadataOnly,
          thinRetrieval: telemetry.quality.flags.thinRetrieval,
          incompleteSummary: telemetry.quality.flags.incompleteSummary,
          compareSingleDoc: telemetry.quality.flags.compareSingleDoc,
          wasTruncated: telemetry.quality.flags.truncated,

          // Latency
          ttft: telemetry.latency.ttft,
          retrievalMs: telemetry.latency.retrievalMs,
          llmMs: telemetry.latency.llmMs,
          embeddingMs: telemetry.latency.embeddingMs,
          pineconeMs: telemetry.latency.pineconeMs,
          bm25Ms: telemetry.latency.bm25Ms,
          formattingMs: telemetry.latency.formattingMs,
          totalMs: telemetry.latency.totalMs,

          // Tokens
          model: telemetry.tokens.model,
          inputTokens: telemetry.tokens.inputTokens,
          outputTokens: telemetry.tokens.outputTokens,
          totalTokens: telemetry.tokens.totalTokens,
          estimatedCostUsd: telemetry.tokens.estimatedCostUsd,
          contextUsed: telemetry.tokens.contextUsed,
          contextMax: telemetry.tokens.contextMax,

          // Streaming
          streamStarted: telemetry.streaming.streamStarted,
          firstTokenReceived: telemetry.streaming.firstTokenReceived,
          streamEnded: telemetry.streaming.streamEnded,
          clientDisconnected: telemetry.streaming.clientDisconnected,
          sseErrors: telemetry.streaming.sseErrors,
          chunksSent: telemetry.streaming.chunksSent,
          streamDurationMs: telemetry.streaming.streamDurationMs,
          wasAborted: telemetry.streaming.wasAborted,

          // Pipeline
          pipelineSignature: telemetry.pipeline.signature,
          handler: telemetry.pipeline.handler,
          pipelineFamily: telemetry.pipeline.family,
          ragEnabled: telemetry.pipeline.ragEnabled,
          hybridSearchUsed: telemetry.pipeline.hybridSearchUsed,
          productHelpUsed: telemetry.pipeline.productHelpUsed,
          mathUsed: telemetry.pipeline.mathUsed,
          routingReason: telemetry.pipeline.routingReason,

          // Errors
          errors: telemetry.errors,
          warnings: telemetry.warnings,
          hasErrors: telemetry.errors.length > 0,
        },
      });
    } catch (error) {
      console.error('[QueryTelemetry] Failed to save telemetry:', error);
      // Don't throw - telemetry should not break the main flow
    }
  }

  // ==========================================================================
  // AGGREGATION METHODS FOR DASHBOARD
  // ==========================================================================

  /**
   * Get intent analytics for dashboard
   */
  async getIntentAnalytics(days: number = 7): Promise<IntentAnalytics> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [byIntent, byQuestionType, byDepth, byDomain, totals] = await Promise.all([
      prisma.queryTelemetry.groupBy({
        by: ['intent'],
        _count: { intent: true },
        _avg: { intentConfidence: true },
        where: { timestamp: { gte: since } },
        orderBy: { _count: { intent: 'desc' } },
        take: 20,
      }),
      prisma.queryTelemetry.groupBy({
        by: ['questionType'],
        _count: { questionType: true },
        where: { timestamp: { gte: since } },
        orderBy: { _count: { questionType: 'desc' } },
      }),
      prisma.queryTelemetry.groupBy({
        by: ['depth'],
        _count: { depth: true },
        where: { timestamp: { gte: since } },
        orderBy: { _count: { depth: 'desc' } },
      }),
      prisma.queryTelemetry.groupBy({
        by: ['domain'],
        _count: { domain: true },
        where: { timestamp: { gte: since } },
        orderBy: { _count: { domain: 'desc' } },
      }),
      prisma.queryTelemetry.aggregate({
        _count: { id: true },
        _avg: { classificationTimeMs: true },
        where: { timestamp: { gte: since } },
      }),
    ]);

    const multiIntentCount = await prisma.queryTelemetry.count({
      where: { timestamp: { gte: since }, isMultiIntent: true },
    });

    const overrideCount = await prisma.queryTelemetry.count({
      where: { timestamp: { gte: since }, overrideReason: { not: null } },
    });

    return {
      byIntent: byIntent.map(r => ({
        intent: r.intent,
        count: r._count.intent,
        avgConfidence: r._avg.intentConfidence || 0,
      })),
      byQuestionType: byQuestionType.map(r => ({
        type: r.questionType as any,
        count: r._count.questionType,
      })),
      byDepth: byDepth.map(r => ({
        depth: r.depth || 'unknown',
        count: r._count.depth,
      })),
      byDomain: byDomain.map(r => ({
        domain: r.domain || 'unknown',
        count: r._count.domain,
      })),
      multiIntentRate: totals._count.id ? multiIntentCount / totals._count.id : 0,
      topPatterns: [], // Would need separate aggregation
      topKeywords: [], // Would need separate aggregation
      overrideRate: totals._count.id ? overrideCount / totals._count.id : 0,
      totalQueries: totals._count.id || 0,
      avgClassificationTimeMs: totals._avg.classificationTimeMs || 0,
    };
  }

  /**
   * Get retrieval analytics for dashboard
   */
  async getRetrievalAnalytics(days: number = 7): Promise<RetrievalAnalytics> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [totals, byMethod, evidenceGateActions] = await Promise.all([
      prisma.queryTelemetry.aggregate({
        _count: { id: true },
        _avg: {
          chunksReturned: true,
          distinctDocs: true,
          avgRelevanceScore: true,
          topRelevanceScore: true,
        },
        where: { timestamp: { gte: since } },
      }),
      prisma.queryTelemetry.groupBy({
        by: ['retrievalMethod'],
        _count: { retrievalMethod: true },
        where: { timestamp: { gte: since } },
      }),
      prisma.queryTelemetry.groupBy({
        by: ['evidenceGateAction'],
        _count: { evidenceGateAction: true },
        where: { timestamp: { gte: since }, evidenceGateAction: { not: null } },
      }),
    ]);

    const thinRetrievalCount = await prisma.queryTelemetry.count({
      where: { timestamp: { gte: since }, thinRetrieval: true },
    });

    const adequateCount = await prisma.queryTelemetry.count({
      where: { timestamp: { gte: since }, retrievalAdequate: true },
    });

    // Chunks distribution buckets
    const chunksBuckets = [
      { bucket: '0', min: 0, max: 0 },
      { bucket: '1-2', min: 1, max: 2 },
      { bucket: '3-5', min: 3, max: 5 },
      { bucket: '6-10', min: 6, max: 10 },
      { bucket: '11+', min: 11, max: 999 },
    ];

    const chunksDistribution = await Promise.all(
      chunksBuckets.map(async b => ({
        bucket: b.bucket,
        count: await prisma.queryTelemetry.count({
          where: {
            timestamp: { gte: since },
            chunksReturned: { gte: b.min, lte: b.max },
          },
        }),
      }))
    );

    return {
      chunksDistribution,
      thinRetrievalRate: totals._count.id ? thinRetrievalCount / totals._count.id : 0,
      adequacyRate: totals._count.id ? adequateCount / totals._count.id : 0,
      evidenceGateActions: evidenceGateActions.map(r => ({
        action: r.evidenceGateAction || 'none',
        count: r._count.evidenceGateAction,
      })),
      avgRelevanceScore: totals._avg.avgRelevanceScore || 0,
      avgTopScore: totals._avg.topRelevanceScore || 0,
      byMethod: byMethod.map(r => ({
        method: r.retrievalMethod || 'unknown',
        count: r._count.retrievalMethod,
      })),
      totalQueries: totals._count.id || 0,
      avgChunksReturned: totals._avg.chunksReturned || 0,
      avgDistinctDocs: totals._avg.distinctDocs || 0,
    };
  }

  /**
   * Get quality analytics for dashboard
   */
  async getQualityAnalytics(days: number = 7): Promise<QualityAnalytics> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [totals, byFailureCategory, byFallbackScenario] = await Promise.all([
      prisma.queryTelemetry.aggregate({
        _count: { id: true },
        _avg: { citationCount: true },
        where: { timestamp: { gte: since } },
      }),
      prisma.queryTelemetry.groupBy({
        by: ['failureCategory'],
        _count: { failureCategory: true },
        where: { timestamp: { gte: since }, failureCategory: { not: null } },
      }),
      prisma.queryTelemetry.groupBy({
        by: ['fallbackScenario'],
        _count: { fallbackScenario: true },
        where: { timestamp: { gte: since }, fallbackScenario: { not: null } },
      }),
    ]);

    const usefulCount = await prisma.queryTelemetry.count({
      where: { timestamp: { gte: since }, isUseful: true },
    });

    const fallbackCount = await prisma.queryTelemetry.count({
      where: { timestamp: { gte: since }, hadFallback: true },
    });

    const ungroundedCount = await prisma.queryTelemetry.count({
      where: { timestamp: { gte: since }, ungroundedClaims: true },
    });

    const underinformativeCount = await prisma.queryTelemetry.count({
      where: { timestamp: { gte: since }, underinformative: true },
    });

    const sourcesMissingCount = await prisma.queryTelemetry.count({
      where: { timestamp: { gte: since }, sourcesMissing: true },
    });

    const total = totals._count.id || 1;

    return {
      usefulRate: usefulCount / total,
      uselessFallbackRate: fallbackCount / total,
      ungroundedClaimsRate: ungroundedCount / total,
      underinformativeRate: underinformativeCount / total,
      byFailureCategory: byFailureCategory.map(r => ({
        category: r.failureCategory as FailureCategory,
        count: r._count.failureCategory,
        rate: r._count.failureCategory / total,
      })),
      byFallbackScenario: byFallbackScenario.map(r => ({
        scenario: r.fallbackScenario || 'unknown',
        count: r._count.fallbackScenario,
      })),
      sourcesMissingRate: sourcesMissingCount / total,
      avgCitationCount: totals._avg.citationCount || 0,
      totalQueries: total,
      passedQueries: usefulCount,
      failedQueries: total - usefulCount,
    };
  }

  /**
   * Get language analytics for dashboard
   */
  async getLanguageAnalytics(days: number = 7): Promise<LanguageAnalytics> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [byLanguage, bySource, totals] = await Promise.all([
      prisma.queryTelemetry.groupBy({
        by: ['resolvedLang'],
        _count: { resolvedLang: true },
        where: { timestamp: { gte: since } },
      }),
      prisma.queryTelemetry.groupBy({
        by: ['languageSource'],
        _count: { languageSource: true },
        where: { timestamp: { gte: since } },
      }),
      prisma.queryTelemetry.aggregate({
        _count: { id: true },
        where: { timestamp: { gte: since } },
      }),
    ]);

    const mismatchCount = await prisma.queryTelemetry.count({
      where: { timestamp: { gte: since }, languageMismatch: true },
    });

    const enforcementCount = await prisma.queryTelemetry.count({
      where: { timestamp: { gte: since }, enforcementApplied: true },
    });

    // Calculate pass rate per language
    const langPassRates = await Promise.all(
      byLanguage.map(async r => {
        const passed = await prisma.queryTelemetry.count({
          where: { timestamp: { gte: since }, resolvedLang: r.resolvedLang, isUseful: true },
        });
        return {
          lang: r.resolvedLang,
          count: r._count.resolvedLang,
          passRate: r._count.resolvedLang > 0 ? passed / r._count.resolvedLang : 0,
        };
      })
    );

    const total = totals._count.id || 1;

    return {
      byLanguage: langPassRates,
      bySource: bySource.map(r => ({
        source: r.languageSource as any,
        count: r._count.languageSource,
      })),
      mismatchRate: mismatchCount / total,
      enforcementRate: enforcementCount / total,
      topBannedPhrases: [], // Would need separate aggregation
    };
  }

  /**
   * Get performance analytics for dashboard
   */
  async getPerformanceAnalytics(days: number = 7): Promise<PerformanceAnalytics> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const totals = await prisma.queryTelemetry.aggregate({
      _avg: {
        totalMs: true,
        ttft: true,
        retrievalMs: true,
        llmMs: true,
        embeddingMs: true,
        pineconeMs: true,
        formattingMs: true,
        chunksSent: true,
        streamDurationMs: true,
      },
      _count: { id: true },
      where: { timestamp: { gte: since } },
    });

    // Get percentiles (using raw queries for efficiency)
    const latencyPercentiles = await this.getLatencyPercentiles(since);
    const ttftPercentiles = await this.getTTFTPercentiles(since);

    const streamSuccessCount = await prisma.queryTelemetry.count({
      where: { timestamp: { gte: since }, streamEnded: true },
    });

    const abortCount = await prisma.queryTelemetry.count({
      where: { timestamp: { gte: since }, wasAborted: true },
    });

    const total = totals._count.id || 1;

    // Hourly trend for last 24 hours
    const hourlyTrend = await this.getHourlyLatencyTrend();

    return {
      latencyPercentiles,
      ttftPercentiles,
      avgLatencyByStage: {
        retrieval: totals._avg.retrievalMs || 0,
        llm: totals._avg.llmMs || 0,
        embedding: totals._avg.embeddingMs || 0,
        pinecone: totals._avg.pineconeMs || 0,
        formatting: totals._avg.formattingMs || 0,
        total: totals._avg.totalMs || 0,
      },
      sseHealth: {
        successRate: streamSuccessCount / total,
        abortRate: abortCount / total,
        avgChunksSent: totals._avg.chunksSent || 0,
        avgStreamDuration: totals._avg.streamDurationMs || 0,
      },
      latencyTrend: hourlyTrend,
    };
  }

  /**
   * Get cost analytics for dashboard
   */
  async getCostAnalytics(days: number = 30): Promise<CostAnalytics> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [totals, byModel] = await Promise.all([
      prisma.queryTelemetry.aggregate({
        _sum: {
          estimatedCostUsd: true,
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
        },
        _count: { id: true },
        where: { timestamp: { gte: since } },
      }),
      prisma.queryTelemetry.groupBy({
        by: ['model'],
        _sum: { estimatedCostUsd: true, totalTokens: true },
        _count: { model: true },
        where: { timestamp: { gte: since } },
      }),
    ]);

    const total = totals._count.id || 1;
    const totalCost = totals._sum.estimatedCostUsd || 0;

    // Daily trend
    const dailyTrend = await this.getDailyCostTrend(since);

    // Top users by cost
    const topUsers = await this.getTopUsersByCost(since);

    return {
      totalCost,
      avgCostPerQuery: totalCost / total,
      byModel: byModel.map(r => ({
        model: r.model || 'unknown',
        cost: r._sum.estimatedCostUsd || 0,
        tokens: r._sum.totalTokens || 0,
        queries: r._count.model,
      })),
      tokens: {
        totalInput: totals._sum.inputTokens || 0,
        totalOutput: totals._sum.outputTokens || 0,
        avgPerQuery: (totals._sum.totalTokens || 0) / total,
      },
      dailyTrend,
      topUsers,
    };
  }

  /**
   * Get query list for table view
   */
  async getQueryList(
    options: {
      limit?: number;
      offset?: number;
      intent?: string;
      language?: string;
      failureCategory?: string;
      isUseful?: boolean;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{ queries: QueryListItem[]; total: number }> {
    const { limit = 50, offset = 0, intent, language, failureCategory, isUseful, startDate, endDate } = options;

    const where: any = {};
    if (intent) where.intent = intent;
    if (language) where.resolvedLang = language;
    if (failureCategory) where.failureCategory = failureCategory;
    if (isUseful !== undefined) where.isUseful = isUseful;
    if (startDate) where.timestamp = { gte: startDate };
    if (endDate) where.timestamp = { ...where.timestamp, lte: endDate };

    const [queries, total] = await Promise.all([
      prisma.queryTelemetry.findMany({
        where,
        select: {
          id: true,
          timestamp: true,
          userId: true,
          queryText: true,
          intent: true,
          intentConfidence: true,
          questionType: true,
          resolvedLang: true,
          chunksReturned: true,
          isUseful: true,
          failureCategory: true,
          totalMs: true,
          ttft: true,
          estimatedCostUsd: true,
          hasErrors: true,
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.queryTelemetry.count({ where }),
    ]);

    return {
      queries: queries.map(q => ({
        id: q.id,
        timestamp: q.timestamp,
        userId: q.userId,
        query: q.queryText?.substring(0, 100) || '',
        intent: q.intent,
        confidence: q.intentConfidence,
        questionType: q.questionType as any,
        language: q.resolvedLang,
        chunksReturned: q.chunksReturned,
        isUseful: q.isUseful,
        failureCategory: q.failureCategory as any,
        totalLatencyMs: q.totalMs || 0,
        ttft: q.ttft || 0,
        cost: q.estimatedCostUsd,
        hasErrors: q.hasErrors,
      })),
      total,
    };
  }

  /**
   * Get single query detail
   */
  async getQueryDetail(id: string): Promise<QueryDetail | null> {
    const record = await prisma.queryTelemetry.findUnique({
      where: { id },
    });

    if (!record) return null;

    // Convert DB record to QueryTelemetry format
    return this.dbToTelemetry(record);
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private async getLatencyPercentiles(since: Date) {
    // Using raw SQL for percentile calculation
    try {
      const result = await prisma.$queryRaw<
        { p50: number; p75: number; p90: number; p95: number; p99: number }[]
      >`
        SELECT
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY "totalMs") as p50,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY "totalMs") as p75,
          PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY "totalMs") as p90,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "totalMs") as p95,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "totalMs") as p99
        FROM query_telemetry
        WHERE timestamp >= ${since} AND "totalMs" IS NOT NULL
      `;
      return result[0] || { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 };
    } catch {
      return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 };
    }
  }

  private async getTTFTPercentiles(since: Date) {
    try {
      const result = await prisma.$queryRaw<{ p50: number; p95: number; p99: number }[]>`
        SELECT
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ttft) as p50,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ttft) as p95,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ttft) as p99
        FROM query_telemetry
        WHERE timestamp >= ${since} AND ttft IS NOT NULL
      `;
      return result[0] || { p50: 0, p95: 0, p99: 0 };
    } catch {
      return { p50: 0, p95: 0, p99: 0 };
    }
  }

  private async getHourlyLatencyTrend() {
    const since = new Date();
    since.setHours(since.getHours() - 24);

    try {
      const result = await prisma.$queryRaw<{ hour: string; avgLatency: number; p95: number }[]>`
        SELECT
          DATE_TRUNC('hour', timestamp) as hour,
          AVG("totalMs") as "avgLatency",
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "totalMs") as p95
        FROM query_telemetry
        WHERE timestamp >= ${since} AND "totalMs" IS NOT NULL
        GROUP BY DATE_TRUNC('hour', timestamp)
        ORDER BY hour DESC
        LIMIT 24
      `;
      return result.map(r => ({
        hour: new Date(r.hour).toISOString(),
        avgLatency: Number(r.avgLatency) || 0,
        p95: Number(r.p95) || 0,
      }));
    } catch {
      return [];
    }
  }

  private async getDailyCostTrend(since: Date) {
    try {
      const result = await prisma.$queryRaw<{ date: Date; cost: number; tokens: number; queries: number }[]>`
        SELECT
          DATE_TRUNC('day', timestamp) as date,
          SUM("estimatedCostUsd") as cost,
          SUM("totalTokens") as tokens,
          COUNT(*) as queries
        FROM query_telemetry
        WHERE timestamp >= ${since}
        GROUP BY DATE_TRUNC('day', timestamp)
        ORDER BY date DESC
        LIMIT 30
      `;
      return result.map(r => ({
        date: new Date(r.date).toISOString().split('T')[0],
        cost: Number(r.cost) || 0,
        tokens: Number(r.tokens) || 0,
        queries: Number(r.queries) || 0,
      }));
    } catch {
      return [];
    }
  }

  private async getTopUsersByCost(since: Date) {
    try {
      const result = await prisma.$queryRaw<{ userId: string; cost: number; queries: number }[]>`
        SELECT
          "userId",
          SUM("estimatedCostUsd") as cost,
          COUNT(*) as queries
        FROM query_telemetry
        WHERE timestamp >= ${since}
        GROUP BY "userId"
        ORDER BY cost DESC
        LIMIT 10
      `;

      // Get user emails
      const userIds = result.map(r => r.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true },
      });
      const emailMap = new Map(users.map(u => [u.id, u.email]));

      return result.map(r => ({
        userId: r.userId,
        email: emailMap.get(r.userId) || 'unknown',
        cost: Number(r.cost) || 0,
        queries: Number(r.queries) || 0,
      }));
    } catch {
      return [];
    }
  }

  private dbToTelemetry(record: any): QueryDetail {
    return {
      id: record.id,
      queryId: record.queryId,
      userId: record.userId,
      conversationId: record.conversationId,
      messageId: record.messageId,
      environment: record.environment,
      timestamp: record.timestamp,
      queryText: record.queryText,
      intent: {
        intent: record.intent,
        confidence: record.intentConfidence,
        secondaryIntents: [],
        isMultiIntent: record.isMultiIntent,
        segmentCount: record.segmentCount,
        questionType: record.questionType,
        queryScope: record.queryScope,
        domain: record.domain,
        depth: record.depth,
        family: record.family,
        subIntent: record.subIntent,
        matchedPatterns: record.matchedPatterns,
        matchedKeywords: record.matchedKeywords,
        blockedByNegatives: record.blockedByNegatives,
        overrideReason: record.overrideReason,
        classificationTimeMs: record.classificationTimeMs,
      },
      retrieval: {
        chunksReturned: record.chunksReturned,
        bm25Results: record.bm25Results,
        vectorResults: record.vectorResults,
        distinctDocs: record.distinctDocs,
        documentIds: record.documentIds,
        topRelevanceScore: record.topRelevanceScore,
        avgRelevanceScore: record.avgRelevanceScore,
        minRelevanceScore: record.minRelevanceScore,
        totalSnippetChars: record.totalSnippetChars,
        retrievalAdequate: record.retrievalAdequate,
        method: record.retrievalMethod,
        mergeStrategy: record.mergeStrategy,
        budgets: record.retrievalBudgets || {},
        expansionAttempts: record.expansionAttempts,
        meetsAllFloors: record.meetsAllFloors,
      },
      evidenceGate: {
        action: record.evidenceGateAction,
        message: record.evidenceGateMessage,
        shouldProceed: record.evidenceShouldProceed,
        metrics: {
          chunksReturned: record.chunksReturned,
          distinctDocs: record.distinctDocs,
          totalSnippetChars: record.totalSnippetChars,
        },
        thresholds: { minChunks: 0, minDistinctDocs: 0, minSnippetChars: 0 },
      },
      formatting: {
        formatMode: record.formatMode,
        passed: record.formattingPassed,
        violations: record.formattingViolations,
        bulletPolicy: record.bulletPolicy,
        constraints: record.constraints || {},
        postProcessing: [],
      },
      language: {
        resolvedLang: record.resolvedLang,
        source: record.languageSource,
        detectedLang: record.detectedLang,
        hasMismatch: record.languageMismatch,
        enforcementApplied: record.enforcementApplied,
        bannedPhrasesFound: record.bannedPhrasesFound,
      },
      quality: {
        isUseful: record.isUseful,
        failureCategory: record.failureCategory,
        hadFallback: record.hadFallback,
        fallbackScenario: record.fallbackScenario,
        citationCount: record.citationCount,
        sourcesMissing: record.sourcesMissing,
        answerLength: record.answerLength,
        flags: {
          ungroundedClaims: record.ungroundedClaims,
          underinformative: record.underinformative,
          metadataOnly: record.metadataOnly,
          thinRetrieval: record.thinRetrieval,
          incompleteSummary: record.incompleteSummary,
          compareSingleDoc: record.compareSingleDoc,
          truncated: record.wasTruncated,
        },
      },
      latency: {
        ttft: record.ttft,
        retrievalMs: record.retrievalMs,
        llmMs: record.llmMs,
        embeddingMs: record.embeddingMs,
        pineconeMs: record.pineconeMs,
        bm25Ms: record.bm25Ms,
        formattingMs: record.formattingMs,
        totalMs: record.totalMs,
      },
      tokens: {
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        totalTokens: record.totalTokens,
        estimatedCostUsd: record.estimatedCostUsd,
        contextUsed: record.contextUsed,
        contextMax: record.contextMax,
      },
      streaming: {
        streamStarted: record.streamStarted,
        firstTokenReceived: record.firstTokenReceived,
        streamEnded: record.streamEnded,
        clientDisconnected: record.clientDisconnected,
        sseErrors: record.sseErrors,
        chunksSent: record.chunksSent,
        streamDurationMs: record.streamDurationMs,
        wasAborted: record.wasAborted,
      },
      pipeline: {
        signature: record.pipelineSignature,
        handler: record.handler,
        family: record.pipelineFamily,
        ragEnabled: record.ragEnabled,
        hybridSearchUsed: record.hybridSearchUsed,
        productHelpUsed: record.productHelpUsed,
        mathUsed: record.mathUsed,
        routingReason: record.routingReason,
      },
      errors: record.errors || [],
      warnings: record.warnings || [],
    };
  }
}

// Singleton export
export const queryTelemetryService = new QueryTelemetryService();
export default queryTelemetryService;
