/* eslint-disable @typescript-eslint/no-explicit-any */

import type { AnalyticsConfig } from "../config";
import type { DateRange } from "../types";
import TelemetryRepo from "../repositories/telemetry.repo";

/**
 * answerQuality.aggregator.ts (Koda)
 * ----------------------------------
 * Builds the Admin "Answer Quality" payload:
 *  - formatting pass/fail
 *  - top formatting violations
 *  - sources missing rate
 *  - hallucination indicators (if present in QueryTelemetry)
 *
 * Notes:
 *  - Uses QueryTelemetry as source-of-truth (pipeline traces)
 *  - Keeps reads bounded (no full table scans)
 */

export interface AnswerQualityDeps {
  prisma: any;
  redis?: any;
  config: AnalyticsConfig;
}

export interface AnswerQualityInput {
  range: DateRange;

  // Optional filters
  domain?: string;
  intent?: string;
  hasErrors?: boolean;

  // Page size for sampling telemetry rows (bounded)
  sampleLimit?: number; // default 800
}

export interface AnswerQualityResponse {
  range: DateRange;

  kpis: {
    formattingPassRate: number;         // 0..1
    sourcesMissingRate: number;         // 0..1
    ungroundedClaimsRate?: number;      // 0..1 (if available)
    underinformativeRate?: number;      // 0..1 (if available)
    avgAnswerLength?: number;           // (if available)
  };

  distributions: {
    formattingPassed: { passed: number; failed: number };
    violationsTop: Array<{ key: string; count: number }>;
  };

  examples: {
    badFormatting: Array<{
      queryId: string;
      ts: string;
      intent?: string | null;
      domain?: string | null;
      violations: string[];
    }>;
    missingSources: Array<{
      queryId: string;
      ts: string;
      intent?: string | null;
      domain?: string | null;
    }>;
  };

  stats: {
    sampled: number;
  };
}

function topN(map: Map<string, number>, n: number) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

export class AnswerQualityAggregator {
  private telemetryRepo: TelemetryRepo;
  private cfg: AnalyticsConfig;

  constructor(private deps: AnswerQualityDeps) {
    this.cfg = deps.config;
    this.telemetryRepo = new TelemetryRepo(deps.prisma, {
      maxLimit: deps.config.maxPageSize,
      defaultLimit: deps.config.defaultPageSize,
    });
  }

  async build(input: AnswerQualityInput): Promise<AnswerQualityResponse> {
    const sampleLimit = Math.min(Math.max(input.sampleLimit ?? 800, 200), 2000);

    // Pull a bounded sample of QueryTelemetry
    const page = await this.telemetryRepo.list(
      {
        range: input.range,
        domain: input.domain,
        intent: input.intent,
        hasErrors: input.hasErrors,
      } as any,
      { limit: sampleLimit }
    );

    const rows = page.items || [];
    const total = rows.length || 0;

    let formattingPassedCount = 0;
    let sourcesMissingCount = 0;

    let ungroundedClaimsCount = 0;
    let underinformativeCount = 0;

    let answerLengthSum = 0;
    let answerLengthN = 0;

    const violationCounts = new Map<string, number>();

    const badFormattingExamples: AnswerQualityResponse["examples"]["badFormatting"] = [];
    const missingSourcesExamples: AnswerQualityResponse["examples"]["missingSources"] = [];

    for (const r of rows as any[]) {
      // formattingPassed defaults to true if missing; treat undefined as "unknown -> pass"
      const passed = r.formattingPassed !== false;
      if (passed) formattingPassedCount++;
      else {
        const violations: string[] = Array.isArray(r.formattingViolations) ? r.formattingViolations.filter(Boolean) : [];
        for (const v of violations) violationCounts.set(v, (violationCounts.get(v) || 0) + 1);

        // keep a few examples
        if (badFormattingExamples.length < 20) {
          badFormattingExamples.push({
            queryId: r.queryId || r.id,
            ts: new Date(r.timestamp).toISOString(),
            intent: r.intent ?? null,
            domain: r.domain ?? null,
            violations,
          });
        }
      }

      // sourcesMissing is explicit in QueryTelemetry
      if (r.sourcesMissing === true) {
        sourcesMissingCount++;
        if (missingSourcesExamples.length < 20) {
          missingSourcesExamples.push({
            queryId: r.queryId || r.id,
            ts: new Date(r.timestamp).toISOString(),
            intent: r.intent ?? null,
            domain: r.domain ?? null,
          });
        }
      }

      // Optional quality flags (present in your QueryTelemetry schema)
      if (r.ungroundedClaims === true) ungroundedClaimsCount++;
      if (r.underinformative === true) underinformativeCount++;

      if (typeof r.answerLength === "number") {
        answerLengthSum += r.answerLength;
        answerLengthN += 1;
      }
    }

    const formattingFailCount = total - formattingPassedCount;

    return {
      range: input.range,
      kpis: {
        formattingPassRate: total ? formattingPassedCount / total : 1,
        sourcesMissingRate: total ? sourcesMissingCount / total : 0,
        ungroundedClaimsRate: total ? ungroundedClaimsCount / total : 0,
        underinformativeRate: total ? underinformativeCount / total : 0,
        avgAnswerLength: answerLengthN ? answerLengthSum / answerLengthN : undefined,
      },
      distributions: {
        formattingPassed: { passed: formattingPassedCount, failed: formattingFailCount },
        violationsTop: topN(violationCounts, 12),
      },
      examples: {
        badFormatting: badFormattingExamples,
        missingSources: missingSourcesExamples,
      },
      stats: { sampled: total },
    };
  }
}

export default AnswerQualityAggregator;
