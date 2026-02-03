// file: src/analytics/calculators/index.ts
// Barrel export for all analytics calculators

// DAU - Daily Active Users
export { calculateDAU } from './dau.calculator';
export type { ActivityEvent, DAUOptions, DAUResult } from './dau.calculator';

// WAU - Weekly Active Users
export { calculateWAU } from './wau.calculator';
export type { WAUResult } from './wau.calculator';

// Retention - Cohort-based retention
export { calculateRetention } from './retention.calculator';
export type { SignupRecord, RetentionOptions, CohortRetention } from './retention.calculator';

// Latency - API performance metrics
export { calculateLatencyMetrics, calculateLatencyByRoute, percentile } from './latency.calculator';
export type { ApiPerfEvent, LatencyOptions, LatencyResult } from './latency.calculator';

// Error Rate - API error tracking
export { calculateErrorRate, calculateErrorRateSeries } from './errorRate.calculator';
export type { ErrorRateOptions, RouteErrorRate, ErrorRateResult } from './errorRate.calculator';

// Weak Evidence - RAG quality metrics
export { calculateWeakEvidence, calculateWeakEvidenceSeries } from './weakEvidence.calculator';
export type { QueryQualityEvent, DomainWeakEvidence, WeakEvidenceResult } from './weakEvidence.calculator';

// Format Score - Answer quality scoring
export { calculateFormatScore, calculateSingleScore } from './formatScore.calculator';
export type { ScoreContributions, DomainScore, FormatScoreResult } from './formatScore.calculator';

// Cost - LLM cost tracking
export { calculateCost, calculateCostSeries } from './cost.calculator';
export type { LlmCallEvent, CostOptions, ProviderModelCost, CostResult } from './cost.calculator';
