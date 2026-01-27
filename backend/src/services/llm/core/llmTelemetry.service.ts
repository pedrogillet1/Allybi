// src/services/llm/core/llmTelemetry.service.ts
/**
 * LLM TELEMETRY SERVICE
 *
 * Records metrics for LLM API calls: latency, token usage, errors, costs.
 * Feeds into the application telemetry pipeline.
 */

import { injectable } from 'tsyringe';
import type { LlmProviderId, LlmModelId, LlmUsage } from '../types/llm.types';
import type { LlmErrorCode } from '../types/llmErrors.types';

export interface LlmCallMetric {
  provider: LlmProviderId;
  model: LlmModelId;
  latencyMs: number;
  usage: LlmUsage;
  streaming: boolean;
  cached: boolean;
  error?: LlmErrorCode;
  timestamp: string;           // ISO
}

@injectable()
export class LlmTelemetryService {
  /** Record a completed LLM call */
  record(metric: LlmCallMetric): void {
    // TODO: Implement metric recording (push to telemetry pipeline)
  }

  /** Record an LLM error */
  recordError(provider: LlmProviderId, model: LlmModelId, errorCode: LlmErrorCode): void {
    // TODO: Implement error recording
  }

  /** Get aggregated stats for a time window */
  getStats(windowMs?: number): {
    totalCalls: number;
    totalTokens: number;
    avgLatencyMs: number;
    errorRate: number;
  } {
    // TODO: Implement stats aggregation
    return { totalCalls: 0, totalTokens: 0, avgLatencyMs: 0, errorRate: 0 };
  }
}
