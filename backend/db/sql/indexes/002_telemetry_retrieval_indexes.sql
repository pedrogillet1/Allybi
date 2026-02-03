-- file: db/sql/indexes/002_telemetry_retrieval_indexes.sql
-- Indexes for retrieval_events table to support admin dashboard queries
-- Use CONCURRENTLY to avoid locking in production

-- Primary time-based index for range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retrieval_events_at
  ON retrieval_events (at DESC);

-- User lookup with time range
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retrieval_events_user_at
  ON retrieval_events ("userId", at DESC);

-- Domain filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retrieval_events_domain_at
  ON retrieval_events (domain, at DESC);

-- Intent filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retrieval_events_intent_at
  ON retrieval_events (intent, at DESC);

-- Operator filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retrieval_events_operator_at
  ON retrieval_events (operator, at DESC);

-- Strategy analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retrieval_events_strategy_at
  ON retrieval_events (strategy, at DESC);

-- Trace ID lookup for distributed tracing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retrieval_events_trace_id
  ON retrieval_events ("traceId");

-- Turn ID lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retrieval_events_turn_id
  ON retrieval_events ("turnId")
  WHERE "turnId" IS NOT NULL;

-- Conversation ID lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retrieval_events_conversation_id
  ON retrieval_events ("conversationId")
  WHERE "conversationId" IS NOT NULL;

-- Evidence strength for quality analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retrieval_events_evidence
  ON retrieval_events ("evidenceStrength")
  WHERE "evidenceStrength" IS NOT NULL;

-- Fallback reason filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retrieval_events_fallback
  ON retrieval_events ("fallbackReasonCode")
  WHERE "fallbackReasonCode" IS NOT NULL;

-- Composite for domain quality analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retrieval_events_domain_evidence
  ON retrieval_events (domain, "evidenceStrength", at DESC);

-- Composite for intent quality analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retrieval_events_intent_evidence
  ON retrieval_events (intent, "evidenceStrength", at DESC);

-- Partial index for weak evidence queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_retrieval_events_weak_evidence
  ON retrieval_events (at DESC, domain, intent)
  WHERE "evidenceStrength" < 0.35 OR "fallbackReasonCode" = 'WEAK_EVIDENCE';

-- endfile
