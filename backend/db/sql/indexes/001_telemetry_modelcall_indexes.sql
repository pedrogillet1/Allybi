-- file: db/sql/indexes/001_telemetry_modelcall_indexes.sql
-- Indexes for model_calls table to support admin dashboard queries
-- Use CONCURRENTLY to avoid locking in production

-- Primary time-based index for range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_model_calls_at
  ON model_calls (at DESC);

-- User lookup with time range
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_model_calls_user_at
  ON model_calls ("userId", at DESC);

-- Provider/model grouping for cost analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_model_calls_provider_model_at
  ON model_calls (provider, model, at DESC);

-- Stage grouping for pipeline analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_model_calls_stage_at
  ON model_calls (stage, at DESC);

-- Status filtering for error analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_model_calls_status_at
  ON model_calls (status, at DESC);

-- Error code lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_model_calls_error_code
  ON model_calls ("errorCode")
  WHERE "errorCode" IS NOT NULL;

-- Trace ID lookup for distributed tracing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_model_calls_trace_id
  ON model_calls ("traceId");

-- Turn ID lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_model_calls_turn_id
  ON model_calls ("turnId")
  WHERE "turnId" IS NOT NULL;

-- Composite for provider error analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_model_calls_provider_status_at
  ON model_calls (provider, status, at DESC);

-- Partial index for failed calls only (faster error queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_model_calls_failures
  ON model_calls (at DESC, provider, model, "errorCode")
  WHERE status = 'fail';

-- Duration for latency percentile queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_model_calls_duration
  ON model_calls ("durationMs")
  WHERE "durationMs" IS NOT NULL;

-- endfile
