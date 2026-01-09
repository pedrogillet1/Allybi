/**
 * Telemetry Types
 *
 * TypeScript interfaces for telemetry events and dashboard data structures
 * These match the frontend types from frontend/src/types/telemetry.js
 */

// Core telemetry event structure
export interface TelemetryEvent {
  eventId: string;
  timestamp: string;
  env: 'local' | 'staging' | 'prod';
  userId: string;
  conversationId: string;
  messageId: string;
  sessionId?: string;
  queryText: string;
  language: string;
  clientTimezone?: string;
  clientLocation?: string;
  frontendRoute: string;
  intent: string;
  subIntent?: string;
  facets: string[];
  confidence: number;
  routerVersion: string;
  intentPatternVersion: string;
  fallbackTriggered: boolean;
  fallbackReason?: string;
  multiIntentDetected: boolean;
  intentsDetected: string[];
  docWorkspaceCount: number;
  docIdsInScope: string[];
  contextTokensEstimated?: number;
  contextLoadSource: 'cache' | 'db' | 'recomputed';
  contextLostDetected: boolean;
  resolvedEntities: any[];
  retrievalMode: 'none' | 'metadata' | 'vector' | 'hybrid';
  retrievalTimeMs: number;
  chunksRetrieved: number;
  topK: number;
  topChunkScores: number[];
  docsRetrieved: Array<{ docId: string; avgScore: number }>;
  retrievalErrors: string[];
  modelProvider: string;
  modelName: string;
  promptBuildTimeMs: number;
  generationTimeMs: number;
  tokensIn?: number;
  tokensOut?: number;
  answerLengthChars: number;
  qualityChecks: {
    qualityPass: boolean;
    failedChecks: string[];
    qualityScore: number;
  };
  streamingEnabled: boolean;
  ttftMs: number;
  totalLatencyMs: number;
  renderedActionsCount: number;
  docButtonsExpected: number;
  docButtonsRendered: number;
  formattingExpected: any;
  formattingPass: boolean;
  uiWarnings: string[];
  errorCode?: string;
  errorMessage?: string;
  errorService?: string;
  httpStatus?: number;
}

// Dashboard data structures

export interface OverviewData {
  systemHealth: {
    status: 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE';
    uptime: number;
  };
  activeUsers: {
    current: number;
    change: number;
  };
  requestsPerMin: {
    current: number;
  };
  avgResponseTime: {
    current: number;
    change: number;
  };
  requestVolume: Array<{
    time: string;
    count: number;
  }>;
  intentDistribution: Array<{
    name: string;
    value: number;
  }>;
  serviceStatus: Array<{
    name: string;
    status: 'Healthy' | 'Unhealthy';
  }>;
}

export interface IntentAnalysisData {
  accuracy: {
    current: number;
    change: number;
  };
  avgConfidence: number;
  fallbackRate: {
    current: number;
    change: number;
  };
  multiIntentQueries: {
    count: number;
    percentage: number;
  };
  classificationOverTime: Array<{
    date: string;
    [key: string]: any;
  }>;
  topMisclassifications: Array<{
    query: string;
    expected: string;
    actual: string;
    confidence: number;
  }>;
  confidenceDistribution: Array<{
    range: string;
    count: number;
  }>;
  overrideTriggers: Array<{
    name: string;
    count: number;
  }>;
}

export interface RetrievalData {
  avgRetrievalTime: {
    current: number;
    change: number;
  };
  avgChunksRetrieved: number;
  vectorSearchAccuracy: {
    current: number;
    change: number;
  };
  documentsIndexed: {
    total: number;
    pending: number;
  };
  retrievalPerformance: Array<{
    time: string;
    retrievalTime: number;
    chunksRetrieved: number;
  }>;
  chunkRelevanceDistribution: number[];
  topRetrievedDocs: Array<{
    name: string;
    count: number;
    avgScore: number;
  }>;
  hybridSearchPerformance: {
    vector: number;
    keyword: number;
    combined: number;
  };
  embeddingStatus: Array<{
    status: string;
    count: number;
  }>;
}

export interface ErrorsData {
  errorRate: {
    current: number;
    change: number;
  };
  totalErrors: {
    current: number;
    previous: number;
  };
  criticalErrors: number;
  avgResolutionTime: {
    current: number;
    change: number;
  };
  errorTrends: Array<{
    date: string;
    total: number;
    critical: number;
  }>;
  recentErrors: Array<{
    time: string;
    service: string;
    error: string;
    status: string;
  }>;
  errorsByService: Array<{
    name: string;
    count: number;
  }>;
  fallbackTriggers: Array<{
    name: string;
    count: number;
  }>;
}

export interface UsersData {
  activeUsers: {
    current: number;
    change: number;
  };
  totalQueries: {
    count: number;
    perUserAvg: number;
  };
  newUsers: {
    count: number;
    change: number;
  };
  avgSessionDuration: {
    current: number;
    change: number;
  };
  userActivity: Array<{
    date: string;
    active: number;
    new: number;
  }>;
  queryVolumeByHour: Array<{
    hour: number;
    count: number;
  }>;
  topUsers: Array<{
    user: string;
    queries: number;
    docsUploaded: number;
  }>;
  featureUsage: Array<{
    name: string;
    count: number;
  }>;
  engagementMetrics: Array<{
    name: string;
    value: string | number;
  }>;
}

export interface DatabaseData {
  totalRecords: number;
  encryptionStatus: string;
  storageUsed: {
    value: number;
    unit: string;
    quotaPercentage: number;
  };
  clientKeysActive: number;
  documents: Array<{
    id: string;
    userId: string;
    title: string;
    content: string;
    status: string;
    createdAt: string;
  }>;
  zkVerification: Array<{
    check: string;
    status: string;
  }>;
  dbPerformance: Array<{
    metric: string;
    value: string;
  }>;
  recentDbOperations: Array<{
    operation: string;
    time: string;
  }>;
}
