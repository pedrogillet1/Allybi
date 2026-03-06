import {
  recordIngestionTiming,
  recordTablesDetected,
  recordDlqEntry,
  recordExtractorTiming,
  recordExtractionAttempt,
  recordTableDuplication,
  recordOcrUsage,
  recordIndexingActiveOperationConflict,
  recordIndexingPlaintextOverrideActivation,
  recordIndexingPlaintextSensitiveFieldViolation,
  recordIndexingQualityMetrics,
  recordRetrievalEncryptedFallbackBlocked,
  recordRetrievalRelatedExpansion,
  recordXlsxRowsTruncated,
  recordTableExtractionMethod,
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
      expect(summary.indexingMetadataCompleteness).toEqual({
        complete: 0,
        total: 0,
        rate: 0,
      });
      expect(summary.tableScaleCapture).toEqual({
        detected: 0,
        captured: 0,
        rate: 0,
      });
      expect(summary.indexEncryptionCompliance).toEqual({
        compliant: 0,
        total: 0,
        rate: 0,
      });
      expect(summary.indexPlaintextSensitiveFieldViolations).toBe(0);
      expect(summary.indexPlaintextOverrideActivations).toBe(0);
      expect(summary.indexingActiveOperationConflicts).toBe(0);
      expect(summary.retrievalRelatedExpansion).toEqual({
        attempts: 0,
        failures: 0,
        truncatedDocs: 0,
        addedDocs: 0,
      });
      expect(summary.retrievalEncryptedFallbackBlocked).toBe(0);
    });
  });

  describe("recordIndexingQualityMetrics", () => {
    it("aggregates metadata/scale/encryption quality rates", () => {
      recordIndexingQualityMetrics({
        metadataComplete: 9,
        metadataTotal: 10,
        scaleDetected: 5,
        scaleCaptured: 4,
        encryptionCompliant: 8,
        encryptionTotal: 8,
      });

      const summary = getMetricsSummary();
      expect(summary.indexingMetadataCompleteness).toEqual({
        complete: 9,
        total: 10,
        rate: 0.9,
      });
      expect(summary.tableScaleCapture).toEqual({
        detected: 5,
        captured: 4,
        rate: 0.8,
      });
      expect(summary.indexEncryptionCompliance).toEqual({
        compliant: 8,
        total: 8,
        rate: 1,
      });
    });
  });

  describe("recordXlsxRowsTruncated", () => {
    it("accumulates XLSX truncation counts", () => {
      recordXlsxRowsTruncated(2);
      recordXlsxRowsTruncated(3);
      const summary = getMetricsSummary();
      expect(summary.xlsxRowsTruncatedTotal).toBe(5);
    });

    it("returns 0 when no truncation recorded", () => {
      const summary = getMetricsSummary();
      expect(summary.xlsxRowsTruncatedTotal).toBe(0);
    });
  });

  describe("recordTableExtractionMethod", () => {
    it("tracks table extraction method counts", () => {
      recordTableExtractionMethod("heuristic");
      recordTableExtractionMethod("heuristic");
      recordTableExtractionMethod("document_ai");
      recordTableExtractionMethod("ooxml_native");

      const summary = getMetricsSummary();
      expect(summary.tableExtractionMethodCounts).toEqual({
        heuristic: 2,
        document_ai: 1,
        ooxml_native: 1,
      });
    });

    it("returns empty object when no methods recorded", () => {
      const summary = getMetricsSummary();
      expect(summary.tableExtractionMethodCounts).toEqual({});
    });
  });

  describe("indexing security/concurrency counters", () => {
    it("tracks plaintext sensitive field violations", () => {
      recordIndexingPlaintextSensitiveFieldViolation(3);
      recordIndexingPlaintextSensitiveFieldViolation();
      const summary = getMetricsSummary();
      expect(summary.indexPlaintextSensitiveFieldViolations).toBe(4);
    });

    it("tracks active operation conflicts", () => {
      recordIndexingActiveOperationConflict(2);
      const summary = getMetricsSummary();
      expect(summary.indexingActiveOperationConflicts).toBe(2);
    });

    it("tracks plaintext override activations", () => {
      recordIndexingPlaintextOverrideActivation(2);
      recordIndexingPlaintextOverrideActivation();
      const summary = getMetricsSummary();
      expect(summary.indexPlaintextOverrideActivations).toBe(3);
    });
  });

  describe("retrieval expansion/encryption counters", () => {
    it("tracks related-doc expansion attempts/failures and truncation", () => {
      recordRetrievalRelatedExpansion({
        seedCount: 1,
        expandedCount: 4,
        returnedCount: 2,
        truncatedCount: 2,
      });
      recordRetrievalRelatedExpansion({
        seedCount: 1,
        expandedCount: 1,
        returnedCount: 1,
        failed: true,
      });
      const summary = getMetricsSummary();
      expect(summary.retrievalRelatedExpansion).toEqual({
        attempts: 2,
        failures: 1,
        truncatedDocs: 2,
        addedDocs: 3,
      });
    });

    it("tracks encrypted fallback blocks", () => {
      recordRetrievalEncryptedFallbackBlocked(2);
      recordRetrievalEncryptedFallbackBlocked();
      const summary = getMetricsSummary();
      expect(summary.retrievalEncryptedFallbackBlocked).toBe(3);
    });
  });
});
