/**
 * Analytics API Client
 *
 * Complete control plane for Koda analytics dashboard.
 * Covers: intent, retrieval, quality, language, performance, cost, and query telemetry.
 */

import axios, { AxiosInstance } from 'axios';
import type { Environment } from './environments';

// ============================================================================
// QUERY TELEMETRY TYPES (Control Plane)
// ============================================================================

export type QuestionType =
  | 'SUMMARY' | 'EXTRACT' | 'COMPARE' | 'LIST' | 'WHY' | 'HOW_TO'
  | 'DEFINITION' | 'YES_NO' | 'NUMERIC' | 'TABLE' | 'META_CAPABILITIES' | 'OTHER';

export type FailureCategory =
  | 'USELESS_FALLBACK' | 'UNGROUNDED_CLAIMS' | 'NOT_FOUND_DESPITE_EVIDENCE'
  | 'THIN_RETRIEVAL' | 'UNDERINFORMATIVE' | 'METADATA_INSTEAD_OF_CONTENT'
  | 'INCOMPLETE_SUMMARY' | 'COMPARE_SINGLE_DOC' | 'BAD_MARKERS' | 'TRUNCATED';

export type LanguageSource = 'app_setting' | 'header' | 'query_detect' | 'default';

export interface IntentAnalytics {
  byIntent: Array<{ intent: string; count: number; avgConfidence: number }>;
  byQuestionType: Array<{ type: QuestionType; count: number }>;
  byDepth: Array<{ depth: string; count: number }>;
  byDomain: Array<{ domain: string; count: number }>;
  multiIntentRate: number;
  topPatterns: Array<{ pattern: string; count: number }>;
  topKeywords: Array<{ keyword: string; count: number }>;
  overrideRate: number;
  totalQueries: number;
  avgClassificationTimeMs: number;
}

export interface RetrievalAnalytics {
  chunksDistribution: Array<{ bucket: string; count: number }>;
  thinRetrievalRate: number;
  adequacyRate: number;
  evidenceGateActions: Array<{ action: string; count: number }>;
  avgRelevanceScore: number;
  avgTopScore: number;
  byMethod: Array<{ method: string; count: number }>;
  totalQueries: number;
  avgChunksReturned: number;
  avgDistinctDocs: number;
}

export interface QualityAnalytics {
  usefulRate: number;
  uselessFallbackRate: number;
  ungroundedClaimsRate: number;
  underinformativeRate: number;
  byFailureCategory: Array<{ category: FailureCategory; count: number; rate: number }>;
  byFallbackScenario: Array<{ scenario: string; count: number }>;
  sourcesMissingRate: number;
  avgCitationCount: number;
  totalQueries: number;
  passedQueries: number;
  failedQueries: number;
}

export interface LanguageAnalytics {
  byLanguage: Array<{ lang: string; count: number; passRate: number }>;
  bySource: Array<{ source: LanguageSource; count: number }>;
  mismatchRate: number;
  enforcementRate: number;
  topBannedPhrases: Array<{ phrase: string; count: number }>;
}

export interface PerformanceAnalytics {
  latencyPercentiles: { p50: number; p75: number; p90: number; p95: number; p99: number };
  ttftPercentiles: { p50: number; p95: number; p99: number };
  avgLatencyByStage: {
    retrieval: number; llm: number; embedding: number;
    pinecone: number; formatting: number; total: number;
  };
  sseHealth: {
    successRate: number; abortRate: number;
    avgChunksSent: number; avgStreamDuration: number;
  };
  latencyTrend: Array<{ hour: string; avgLatency: number; p95: number }>;
}

export interface TelemetryCostAnalytics {
  totalCost: number;
  avgCostPerQuery: number;
  byModel: Array<{ model: string; cost: number; tokens: number; queries: number }>;
  tokens: { totalInput: number; totalOutput: number; avgPerQuery: number };
  dailyTrend: Array<{ date: string; cost: number; tokens: number; queries: number }>;
  topUsers: Array<{ userId: string; email: string; cost: number; queries: number }>;
}

export interface QueryListItem {
  id: string;
  timestamp: string;
  userId: string;
  userEmail?: string;
  query: string;
  intent: string;
  confidence: number;
  questionType: QuestionType;
  language: string;
  chunksReturned: number;
  isUseful: boolean;
  failureCategory?: FailureCategory;
  totalLatencyMs: number;
  ttft: number;
  cost: number;
  hasErrors: boolean;
}

export interface QueryListResponse {
  queries: QueryListItem[];
  total: number;
}

export interface QueryDetail {
  id: string;
  queryId: string;
  userId: string;
  conversationId?: string;
  messageId?: string;
  environment: string;
  timestamp: string;
  queryText?: string;
  intent: {
    intent: string;
    confidence: number;
    isMultiIntent: boolean;
    questionType: string;
    queryScope: string;
    domain: string;
    depth: string;
    family: string;
    matchedPatterns: string[];
    matchedKeywords: string[];
  };
  retrieval: {
    chunksReturned: number;
    bm25Results: number;
    vectorResults: number;
    distinctDocs: number;
    topRelevanceScore: number;
    avgRelevanceScore: number;
    retrievalAdequate: boolean;
    method: string;
  };
  evidenceGate: { action: string | null; shouldProceed: boolean };
  formatting: { formatMode: string; passed: boolean; violations: string[] };
  language: { resolvedLang: string; source: string; hasMismatch: boolean };
  quality: {
    isUseful: boolean;
    failureCategory?: string;
    hadFallback: boolean;
    citationCount: number;
    sourcesMissing: boolean;
  };
  latency: {
    ttft: number; retrievalMs: number; llmMs: number;
    embeddingMs: number; pineconeMs: number; totalMs: number;
  };
  tokens: {
    model: string; inputTokens: number; outputTokens: number;
    totalTokens: number; estimatedCostUsd: number;
  };
  streaming: { streamStarted: boolean; streamEnded: boolean; wasAborted: boolean };
  pipeline: { signature: string; handler: string; family: string; ragEnabled: boolean };
  errors: Array<{ type: string; message: string; stage: string }>;
  warnings: string[];
}

export interface AnalyticsOverview {
  users: {
    total: number;
    newToday: number;
    newThisWeek: number;
    newThisMonth: number;
    activeToday: number;
    activeThisWeek: number;
    activeThisMonth: number;
    growthRate: number;
  };
  conversations: {
    total: number;
    newToday: number;
    newThisWeek: number;
    totalMessages: number;
    avgMessagesPerConversation: number;
  };
  documents: {
    total: number;
    uploadedToday: number;
    uploadedThisWeek: number;
    totalStorageGB: number;
  };
  system: {
    health: 'healthy' | 'warning' | 'error';
    uptime: number;
    avgResponseTime: number;
    errorRate: number;
  };
  costs: {
    totalMonthly: number;
    costPerUser: number;
  };
}

export interface UserAnalytics {
  totalUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  activeUsersToday: number;
  activeUsersThisWeek: number;
  activeUsersThisMonth: number;
  userGrowthRate: number;
  retentionRate: number;
  userGrowthTrend: Array<{ date: string; count: number }>;
  mostActiveUsers: Array<{
    userId: string;
    email: string;
    messageCount: number;
    conversationCount: number;
    documentCount: number;
  }>;
  inactiveUsers: Array<{
    userId: string;
    email: string;
    lastActive: string | null;
    daysSinceActive: number;
  }>;
  usersBySubscriptionTier: Array<{ tier: string; count: number }>;
}

export interface ConversationAnalytics {
  totalConversations: number;
  newConversationsToday: number;
  newConversationsThisWeek: number;
  newConversationsThisMonth: number;
  activeConversations: number;
  totalMessages: number;
  messagesToday: number;
  messagesThisWeek: number;
  messagesThisMonth: number;
  avgMessagesPerConversation: number;
  userMessagesCount: number;
  assistantMessagesCount: number;
  messagesTrend: Array<{ date: string; count: number }>;
  peakUsageHours: Array<{ hour: number; messageCount: number }>;
  longestConversations: Array<{
    conversationId: string;
    title: string;
    messageCount: number;
    userId: string;
    userEmail: string;
  }>;
}

export interface DocumentAnalytics {
  totalDocuments: number;
  documentsUploadedToday: number;
  documentsUploadedThisWeek: number;
  documentsUploadedThisMonth: number;
  totalStorageBytes: number;
  totalStorageGB: number;
  avgDocumentSizeBytes: number;
  documentsByType: Array<{ type: string; count: number }>;
  documentsByStatus: Array<{ status: string; count: number }>;
  uploadTrend: Array<{ date: string; count: number }>;
  largestDocuments: Array<{
    documentId: string;
    filename: string;
    sizeBytes: number;
    sizeMB: number;
    userId: string;
    userEmail: string;
  }>;
  recentUploads: Array<{
    documentId: string;
    filename: string;
    uploadedAt: string;
    userId: string;
    userEmail: string;
  }>;
  embeddingStats: {
    totalEmbeddings: number;
    avgChunksPerDocument: number;
  };
}

export interface SystemHealth {
  databaseSize: string;
  databaseConnections: number;
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  uptime: number;
  errorCount24h: number;
  errorRate: number;
  avgResponseTime: number;
  tableSizes: Array<{ table: string; size: string; rowCount: number }>;
  recentErrors: Array<{
    message: string;
    count: number;
    lastOccurred: string;
  }>;
}

export interface CostAnalytics {
  totalCostMTD: number;
  costToday: number;
  avgDailyCost: number;
  projectedMonthlyCost: number;
  totalTokensMTD: number;
  inputTokensMTD: number;
  outputTokensMTD: number;
  avgCostPerMessage: number;
  monthOverMonthChange: number;
  dailyCosts: Array<{ date: string; totalCost: number; totalTokens: number }>;
  costsByModel: Array<{ model: string; cost: number; tokens: number }>;
  costsByFeature: Array<{ feature: string; cost: number; percentage: number }>;
  topUsersByCost: Array<{ email: string; tokens: number; cost: number }>;
  costAlerts?: Array<{ severity: string; title: string; message: string }>;
}

class AnalyticsAPI {
  private client: AxiosInstance;
  private currentEnvironment: Environment;

  constructor(environment: Environment) {
    this.currentEnvironment = environment;
    this.client = axios.create({
      baseURL: environment.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  setEnvironment(environment: Environment) {
    this.currentEnvironment = environment;
    this.client.defaults.baseURL = environment.apiUrl;
  }

  setAuthToken(token: string) {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  async getOverview(): Promise<AnalyticsOverview> {
    const response = await this.client.get('/admin/analytics/overview');
    return response.data;
  }

  async getQuickStats(): Promise<any> {
    const response = await this.client.get('/admin/analytics/quick-stats');
    return response.data;
  }

  async getUserAnalytics(): Promise<UserAnalytics> {
    const response = await this.client.get('/admin/analytics/users');
    return response.data;
  }

  async getConversationAnalytics(): Promise<ConversationAnalytics> {
    const response = await this.client.get('/admin/analytics/conversations');
    return response.data;
  }

  async getDocumentAnalytics(): Promise<DocumentAnalytics> {
    const response = await this.client.get('/admin/analytics/documents');
    return response.data;
  }

  async getSystemHealth(): Promise<SystemHealth> {
    const response = await this.client.get('/admin/analytics/system-health');
    return response.data;
  }

  async getCostAnalytics(): Promise<CostAnalytics> {
    const response = await this.client.get('/admin/analytics/costs');
    return response.data;
  }

  async clearCache(): Promise<void> {
    await this.client.post('/admin/analytics/clear-cache');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUERY TELEMETRY ANALYTICS (Control Plane)
  // ═══════════════════════════════════════════════════════════════════════════

  async getIntentAnalytics(days: number = 7): Promise<IntentAnalytics> {
    const response = await this.client.get(`/dashboard/analytics/intents?days=${days}`);
    return response.data.data;
  }

  async getRetrievalAnalytics(days: number = 7): Promise<RetrievalAnalytics> {
    const response = await this.client.get(`/dashboard/analytics/retrieval?days=${days}`);
    return response.data.data;
  }

  async getQualityAnalytics(days: number = 7): Promise<QualityAnalytics> {
    const response = await this.client.get(`/dashboard/analytics/quality?days=${days}`);
    return response.data.data;
  }

  async getLanguageAnalytics(days: number = 7): Promise<LanguageAnalytics> {
    const response = await this.client.get(`/dashboard/analytics/language?days=${days}`);
    return response.data.data;
  }

  async getPerformanceAnalytics(days: number = 7): Promise<PerformanceAnalytics> {
    const response = await this.client.get(`/dashboard/analytics/performance?days=${days}`);
    return response.data.data;
  }

  async getTelemetryCostAnalytics(days: number = 30): Promise<TelemetryCostAnalytics> {
    const response = await this.client.get(`/dashboard/analytics/telemetry-costs?days=${days}`);
    return response.data.data;
  }

  async getQueryList(options: {
    limit?: number;
    offset?: number;
    intent?: string;
    language?: string;
    failureCategory?: string;
    isUseful?: boolean;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<QueryListResponse> {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', String(options.limit));
    if (options.offset) params.append('offset', String(options.offset));
    if (options.intent) params.append('intent', options.intent);
    if (options.language) params.append('language', options.language);
    if (options.failureCategory) params.append('failureCategory', options.failureCategory);
    if (options.isUseful !== undefined) params.append('isUseful', String(options.isUseful));
    if (options.startDate) params.append('startDate', options.startDate);
    if (options.endDate) params.append('endDate', options.endDate);

    const response = await this.client.get(`/dashboard/analytics/queries?${params.toString()}`);
    return response.data.data;
  }

  async getQueryDetail(id: string): Promise<QueryDetail> {
    const response = await this.client.get(`/dashboard/analytics/queries/${id}`);
    return response.data.data;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RAG & API PERFORMANCE
  // ═══════════════════════════════════════════════════════════════════════════

  async getRAGPerformance(days: number = 7): Promise<any> {
    const response = await this.client.get(`/dashboard/analytics/rag-performance?days=${days}`);
    return response.data.data;
  }

  async getAPIPerformance(service?: string, hours: number = 24): Promise<any> {
    const params = new URLSearchParams();
    if (service) params.append('service', service);
    params.append('hours', String(hours));
    const response = await this.client.get(`/dashboard/analytics/api-performance?${params.toString()}`);
    return response.data.data;
  }

  async getTokenUsage(options: { userId?: string; groupBy?: string } = {}): Promise<any> {
    const params = new URLSearchParams();
    if (options.userId) params.append('userId', options.userId);
    if (options.groupBy) params.append('groupBy', options.groupBy);
    const response = await this.client.get(`/dashboard/analytics/token-usage?${params.toString()}`);
    return response.data.data;
  }

  async getDailyTokenUsage(days: number = 30): Promise<any> {
    const response = await this.client.get(`/dashboard/analytics/token-usage/daily?days=${days}`);
    return response.data.data;
  }

  async getErrorStats(days: number = 7): Promise<any> {
    const response = await this.client.get(`/dashboard/analytics/errors?days=${days}`);
    return response.data.data;
  }

  async getFeatureUsageStats(days: number = 30): Promise<any> {
    const response = await this.client.get(`/dashboard/analytics/feature-usage?days=${days}`);
    return response.data.data;
  }

  async refreshAnalyticsCache(key?: string): Promise<void> {
    await this.client.post('/dashboard/analytics/refresh', { key });
  }

  async getCacheStats(): Promise<any> {
    const response = await this.client.get('/dashboard/analytics/cache-stats');
    return response.data.data;
  }
}

export default AnalyticsAPI;
