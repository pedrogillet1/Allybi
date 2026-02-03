-- file: db/sql/indexes/005_query_telemetry_indexes.sql
-- Indexes for query_telemetry table to support admin dashboard queries
-- Use CONCURRENTLY to avoid locking in production

-- Primary time-based index for range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_telemetry_timestamp
  ON query_telemetry (timestamp DESC);

-- User lookup with time range
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_telemetry_user_timestamp
  ON query_telemetry ("userId", timestamp DESC);

-- Query ID lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_telemetry_query_id
  ON query_telemetry ("queryId");

-- Conversation ID lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_telemetry_conversation_id
  ON query_telemetry ("conversationId")
  WHERE "conversationId" IS NOT NULL;

-- Intent filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_telemetry_intent
  ON query_telemetry (intent, timestamp DESC);

-- Domain filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_telemetry_domain
  ON query_telemetry (domain, timestamp DESC)
  WHERE domain IS NOT NULL;

-- Question type filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_telemetry_question_type
  ON query_telemetry ("questionType")
  WHERE "questionType" IS NOT NULL;

-- Quality filtering (useful queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_telemetry_useful
  ON query_telemetry ("isUseful", timestamp DESC);

-- Fallback analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_telemetry_fallback
  ON query_telemetry ("hadFallback", timestamp DESC)
  WHERE "hadFallback" = true;

-- Failure category analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_telemetry_failure
  ON query_telemetry ("failureCategory")
  WHERE "failureCategory" IS NOT NULL;

-- Error analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_telemetry_errors
  ON query_telemetry ("hasErrors", timestamp DESC)
  WHERE "hasErrors" = true;

-- Language analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_telemetry_language
  ON query_telemetry ("resolvedLang", timestamp DESC);

-- Environment filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_telemetry_environment
  ON query_telemetry (environment, timestamp DESC);

-- Composite for domain quality analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_telemetry_domain_useful
  ON query_telemetry (domain, "isUseful", timestamp DESC);

-- Composite for intent quality analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_telemetry_intent_useful
  ON query_telemetry (intent, "isUseful", timestamp DESC);

-- GIN index for keyword array search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_telemetry_keywords_gin
  ON query_telemetry USING GIN ("matchedKeywords");

-- GIN index for pattern array search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_telemetry_patterns_gin
  ON query_telemetry USING GIN ("matchedPatterns");

-- Latency analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_telemetry_latency
  ON query_telemetry ("totalMs")
  WHERE "totalMs" IS NOT NULL;

-- endfile
