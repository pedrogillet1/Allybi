-- file: db/sql/indexes/004_telemetry_ingestion_indexes.sql
-- Indexes for ingestion_events table to support admin dashboard queries
-- Use CONCURRENTLY to avoid locking in production

-- Primary time-based index for range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingestion_events_at
  ON ingestion_events (at DESC);

-- User lookup with time range
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingestion_events_user_at
  ON ingestion_events ("userId", at DESC);

-- Document lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingestion_events_document_id
  ON ingestion_events ("documentId")
  WHERE "documentId" IS NOT NULL;

-- Status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingestion_events_status_at
  ON ingestion_events (status, at DESC);

-- MIME type for file type analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingestion_events_mime_type
  ON ingestion_events ("mimeType")
  WHERE "mimeType" IS NOT NULL;

-- Extraction method analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingestion_events_extraction
  ON ingestion_events ("extractionMethod")
  WHERE "extractionMethod" IS NOT NULL;

-- Error code lookup for failure analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingestion_events_error_code
  ON ingestion_events ("errorCode")
  WHERE "errorCode" IS NOT NULL;

-- Partial index for failed ingestions only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingestion_events_failures
  ON ingestion_events (at DESC, "userId", "mimeType", "errorCode")
  WHERE status = 'fail';

-- OCR analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingestion_events_ocr
  ON ingestion_events ("ocrUsed", "ocrConfidence")
  WHERE "ocrUsed" = true;

-- Composite for MIME type reliability analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingestion_events_mime_status
  ON ingestion_events ("mimeType", status, at DESC);

-- endfile
