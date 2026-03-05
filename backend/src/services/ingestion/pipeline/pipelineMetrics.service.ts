/**
 * Pipeline Metrics Service
 *
 * In-memory ring buffers for ingestion pipeline latency tracking.
 * Provides p50/p95/p99 percentiles for extraction, embedding, and total timings.
 * Also tracks DLQ entries and table detection counts.
 */

import { percentile } from "../../../analytics/calculators/latency.calculator";

// ---------------------------------------------------------------------------
// Ring buffer
// ---------------------------------------------------------------------------

const WINDOW_SIZE = 1000;

class RingBuffer {
  private buffer: number[] = [];
  private index = 0;
  private full = false;

  push(value: number): void {
    if (this.buffer.length < WINDOW_SIZE) {
      this.buffer.push(value);
    } else {
      this.buffer[this.index] = value;
      this.full = true;
    }
    this.index = (this.index + 1) % WINDOW_SIZE;
  }

  values(): number[] {
    return this.full ? [...this.buffer] : this.buffer.slice(0);
  }

  count(): number {
    return this.full ? WINDOW_SIZE : this.buffer.length;
  }

  reset(): void {
    this.buffer = [];
    this.index = 0;
    this.full = false;
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const extractionTimings = new RingBuffer();
const embeddingTimings = new RingBuffer();
const totalTimings = new RingBuffer();

const extractorTimings = new Map<string, RingBuffer>();

let tablesDetectedCount = 0;
let dlqEntryCount = 0;
const dlqEntries: Array<{ documentId: string; mimeType: string; at: Date }> = [];

// New counters: empty text rate, table duplication, OCR fallback usage
let emptyTextCount = 0;
let totalExtractionAttempts = 0;
let tableDuplicationCount = 0;
const ocrFallbackUsage = new Map<string, { success: number; failure: number }>();

let indexingMetadataCompleteCount = 0;
let indexingMetadataTotalCount = 0;
let tableScaleDetectedCount = 0;
let tableScaleCapturedCount = 0;
let indexEncryptionCompliantCount = 0;
let indexEncryptionTotalCount = 0;
let indexPlaintextSensitiveFieldViolationCount = 0;
let indexingActiveOperationConflictCount = 0;

// ---------------------------------------------------------------------------
// Recording functions
// ---------------------------------------------------------------------------

export function recordIngestionTiming(timing: {
  extractionMs: number;
  embeddingMs: number;
  totalMs: number;
}): void {
  extractionTimings.push(timing.extractionMs);
  embeddingTimings.push(timing.embeddingMs);
  totalTimings.push(timing.totalMs);
}

export function recordTablesDetected(count: number): void {
  tablesDetectedCount += count;
}

export function recordDlqEntry(documentId: string, mimeType: string): void {
  dlqEntryCount++;
  dlqEntries.push({ documentId, mimeType, at: new Date() });
  // Keep only last 100 entries
  if (dlqEntries.length > 100) {
    dlqEntries.shift();
  }
}

export function recordExtractorTiming(
  extractor: string,
  durationMs: number,
): void {
  if (!extractorTimings.has(extractor)) {
    extractorTimings.set(extractor, new RingBuffer());
  }
  extractorTimings.get(extractor)!.push(durationMs);
}

export function recordExtractionAttempt(hadText: boolean): void {
  totalExtractionAttempts++;
  if (!hadText) {
    emptyTextCount++;
  }
}

export function recordTableDuplication(): void {
  tableDuplicationCount++;
}

export function recordOcrUsage(provider: string, success: boolean): void {
  if (!ocrFallbackUsage.has(provider)) {
    ocrFallbackUsage.set(provider, { success: 0, failure: 0 });
  }
  const entry = ocrFallbackUsage.get(provider)!;
  if (success) {
    entry.success++;
  } else {
    entry.failure++;
  }
}

export function recordIndexingQualityMetrics(params: {
  metadataComplete: number;
  metadataTotal: number;
  scaleDetected: number;
  scaleCaptured: number;
  encryptionCompliant: number;
  encryptionTotal: number;
}): void {
  indexingMetadataCompleteCount += Math.max(0, Math.trunc(params.metadataComplete));
  indexingMetadataTotalCount += Math.max(0, Math.trunc(params.metadataTotal));
  tableScaleDetectedCount += Math.max(0, Math.trunc(params.scaleDetected));
  tableScaleCapturedCount += Math.max(0, Math.trunc(params.scaleCaptured));
  indexEncryptionCompliantCount += Math.max(
    0,
    Math.trunc(params.encryptionCompliant),
  );
  indexEncryptionTotalCount += Math.max(0, Math.trunc(params.encryptionTotal));
}

export function recordIndexingPlaintextSensitiveFieldViolation(
  count = 1,
): void {
  indexPlaintextSensitiveFieldViolationCount += Math.max(0, Math.trunc(count));
}

export function recordIndexingActiveOperationConflict(count = 1): void {
  indexingActiveOperationConflictCount += Math.max(0, Math.trunc(count));
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

function computePercentiles(buf: RingBuffer): {
  count: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
} {
  const vals = buf.values().sort((a, b) => a - b);
  return {
    count: vals.length,
    p50: percentile(vals, 50),
    p95: percentile(vals, 95),
    p99: percentile(vals, 99),
  };
}

export function getIngestionPercentiles(): {
  extraction: { count: number; p50: number | null; p95: number | null; p99: number | null };
  embedding: { count: number; p50: number | null; p95: number | null; p99: number | null };
  total: { count: number; p50: number | null; p95: number | null; p99: number | null };
} {
  return {
    extraction: computePercentiles(extractionTimings),
    embedding: computePercentiles(embeddingTimings),
    total: computePercentiles(totalTimings),
  };
}

export function getExtractorPercentiles(): Record<
  string,
  { count: number; p50: number | null; p95: number | null; p99: number | null }
> {
  const result: Record<string, { count: number; p50: number | null; p95: number | null; p99: number | null }> = {};
  for (const [extractor, buf] of extractorTimings) {
    result[extractor] = computePercentiles(buf);
  }
  return result;
}

export function getMetricsSummary(): {
  ingestionPercentiles: ReturnType<typeof getIngestionPercentiles>;
  extractorPercentiles: ReturnType<typeof getExtractorPercentiles>;
  tablesDetected: number;
  dlqEntryCount: number;
  recentDlqEntries: typeof dlqEntries;
  emptyTextRate: { emptyCount: number; totalAttempts: number; rate: number };
  tableDuplicationCount: number;
  ocrFallbackUsage: Record<string, { success: number; failure: number }>;
  indexingMetadataCompleteness: { complete: number; total: number; rate: number };
  tableScaleCapture: { detected: number; captured: number; rate: number };
  indexEncryptionCompliance: { compliant: number; total: number; rate: number };
  indexPlaintextSensitiveFieldViolations: number;
  indexingActiveOperationConflicts: number;
} {
  const rate =
    totalExtractionAttempts > 0
      ? emptyTextCount / totalExtractionAttempts
      : 0;
  const ocrUsage: Record<string, { success: number; failure: number }> = {};
  for (const [provider, entry] of ocrFallbackUsage) {
    ocrUsage[provider] = { ...entry };
  }

  return {
    ingestionPercentiles: getIngestionPercentiles(),
    extractorPercentiles: getExtractorPercentiles(),
    tablesDetected: tablesDetectedCount,
    dlqEntryCount,
    recentDlqEntries: [...dlqEntries],
    emptyTextRate: {
      emptyCount: emptyTextCount,
      totalAttempts: totalExtractionAttempts,
      rate,
    },
    tableDuplicationCount,
    ocrFallbackUsage: ocrUsage,
    indexingMetadataCompleteness: {
      complete: indexingMetadataCompleteCount,
      total: indexingMetadataTotalCount,
      rate:
        indexingMetadataTotalCount > 0
          ? indexingMetadataCompleteCount / indexingMetadataTotalCount
          : 0,
    },
    tableScaleCapture: {
      detected: tableScaleDetectedCount,
      captured: tableScaleCapturedCount,
      rate:
        tableScaleDetectedCount > 0
          ? tableScaleCapturedCount / tableScaleDetectedCount
          : 0,
    },
    indexEncryptionCompliance: {
      compliant: indexEncryptionCompliantCount,
      total: indexEncryptionTotalCount,
      rate:
        indexEncryptionTotalCount > 0
          ? indexEncryptionCompliantCount / indexEncryptionTotalCount
          : 0,
    },
    indexPlaintextSensitiveFieldViolations:
      indexPlaintextSensitiveFieldViolationCount,
    indexingActiveOperationConflicts: indexingActiveOperationConflictCount,
  };
}

// ---------------------------------------------------------------------------
// Reset (for testing)
// ---------------------------------------------------------------------------

export function resetMetrics(): void {
  extractionTimings.reset();
  embeddingTimings.reset();
  totalTimings.reset();
  extractorTimings.clear();
  tablesDetectedCount = 0;
  dlqEntryCount = 0;
  dlqEntries.length = 0;
  emptyTextCount = 0;
  totalExtractionAttempts = 0;
  tableDuplicationCount = 0;
  ocrFallbackUsage.clear();
  indexingMetadataCompleteCount = 0;
  indexingMetadataTotalCount = 0;
  tableScaleDetectedCount = 0;
  tableScaleCapturedCount = 0;
  indexEncryptionCompliantCount = 0;
  indexEncryptionTotalCount = 0;
  indexPlaintextSensitiveFieldViolationCount = 0;
  indexingActiveOperationConflictCount = 0;
}
