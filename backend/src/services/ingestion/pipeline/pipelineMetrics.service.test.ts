import {
  recordIngestionTiming,
  recordTablesDetected,
  recordDlqEntry,
  recordExtractorTiming,
  recordExtractionAttempt,
  recordTableDuplication,
  recordOcrUsage,
  getIngestionPercentiles,
  getExtractorPercentiles,
  getMetricsSummary,
  resetMetrics,
} from "./pipelineMetrics.service";

beforeEach(() => {
  resetMetrics();
});

describe("pipelineMetrics", () => {
  describe("recordIngestionTiming / getIngestionPercentiles", () => {
    it("returns nulls when no timings recorded", () => {
      const result = getIngestionPercentiles();
      expect(result.extraction.count).toBe(0);
      expect(result.extraction.p50).toBeNull();
      expect(result.extraction.p95).toBeNull();
      expect(result.extraction.p99).toBeNull();
    });

    it("computes percentiles from recorded timings", () => {
      for (let i = 1; i <= 100; i++) {
        recordIngestionTiming({
          extractionMs: i,
          embeddingMs: i * 2,
          totalMs: i * 3,
        });
      }
      const result = getIngestionPercentiles();
      expect(result.extraction.count).toBe(100);
      expect(result.extraction.p50).toBeCloseTo(50.5, 0);
      expect(result.extraction.p95).toBeGreaterThanOrEqual(94);
      expect(result.extraction.p95).toBeLessThanOrEqual(96);
      expect(result.embedding.p50).toBeCloseTo(101, 0);
      expect(result.total.p50).toBeCloseTo(151.5, 0);
    });

    it("respects ring buffer window (wraps at 1000)", () => {
      for (let i = 0; i < 1200; i++) {
        recordIngestionTiming({
          extractionMs: i,
          embeddingMs: 0,
          totalMs: 0,
        });
      }
      const result = getIngestionPercentiles();
      expect(result.extraction.count).toBe(1000);
      // All values should be from the last 1000 entries (200-1199)
      expect(result.extraction.p50).toBeGreaterThanOrEqual(600);
    });
  });

  describe("recordDlqEntry", () => {
    it("increments DLQ counter", () => {
      recordDlqEntry("doc1", "application/pdf");
      recordDlqEntry("doc2", "image/png");
      const summary = getMetricsSummary();
      expect(summary.dlqEntryCount).toBe(2);
      expect(summary.recentDlqEntries).toHaveLength(2);
      expect(summary.recentDlqEntries[0].documentId).toBe("doc1");
    });
  });

  describe("recordTablesDetected", () => {
    it("accumulates table counts", () => {
      recordTablesDetected(3);
      recordTablesDetected(5);
      const summary = getMetricsSummary();
      expect(summary.tablesDetected).toBe(8);
    });
  });

  describe("recordExtractorTiming / getExtractorPercentiles", () => {
    it("tracks per-extractor timings", () => {
      for (let i = 1; i <= 50; i++) {
        recordExtractorTiming("pdf", i * 10);
        recordExtractorTiming("docx", i * 5);
      }
      const result = getExtractorPercentiles();
      expect(result["pdf"].count).toBe(50);
      expect(result["docx"].count).toBe(50);
      expect(result["pdf"].p50).toBeGreaterThan(result["docx"].p50!);
    });
  });

  describe("recordExtractionAttempt / emptyTextRate", () => {
    it("tracks empty text rate", () => {
      recordExtractionAttempt(true);
      recordExtractionAttempt(true);
      recordExtractionAttempt(false);

      const summary = getMetricsSummary();
      expect(summary.emptyTextRate.totalAttempts).toBe(3);
      expect(summary.emptyTextRate.emptyCount).toBe(1);
      expect(summary.emptyTextRate.rate).toBeCloseTo(1 / 3, 4);
    });

    it("returns 0 rate when no attempts", () => {
      const summary = getMetricsSummary();
      expect(summary.emptyTextRate.rate).toBe(0);
    });
  });

  describe("recordTableDuplication", () => {
    it("increments table duplication counter", () => {
      recordTableDuplication();
      recordTableDuplication();
      recordTableDuplication();

      const summary = getMetricsSummary();
      expect(summary.tableDuplicationCount).toBe(3);
    });
  });

  describe("recordOcrUsage", () => {
    it("tracks OCR usage by provider", () => {
      recordOcrUsage("google_vision", true);
      recordOcrUsage("google_vision", true);
      recordOcrUsage("google_vision", false);
      recordOcrUsage("tesseract", true);

      const summary = getMetricsSummary();
      expect(summary.ocrFallbackUsage["google_vision"]).toEqual({
        success: 2,
        failure: 1,
      });
      expect(summary.ocrFallbackUsage["tesseract"]).toEqual({
        success: 1,
        failure: 0,
      });
    });

    it("returns empty object when no OCR used", () => {
      const summary = getMetricsSummary();
      expect(summary.ocrFallbackUsage).toEqual({});
    });
  });

  describe("getMetricsSummary", () => {
    it("returns all metrics combined", () => {
      recordIngestionTiming({ extractionMs: 100, embeddingMs: 200, totalMs: 300 });
      recordTablesDetected(2);
      recordDlqEntry("doc1", "application/pdf");

      const summary = getMetricsSummary();
      expect(summary.ingestionPercentiles.extraction.count).toBe(1);
      expect(summary.tablesDetected).toBe(2);
      expect(summary.dlqEntryCount).toBe(1);
      expect(summary.recentDlqEntries).toHaveLength(1);
      expect(summary.emptyTextRate).toBeDefined();
      expect(summary.tableDuplicationCount).toBe(0);
      expect(summary.ocrFallbackUsage).toEqual({});
    });
  });
});
