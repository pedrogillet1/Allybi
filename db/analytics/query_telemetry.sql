-- file: db/analytics/query_telemetry.sql
--
-- Query/turn-level analytics telemetry.
-- Stores per-query metrics for RAG performance, answer quality, and usage patterns.
-- NO raw query text or content stored - only hashes, lengths, and categorical data.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "QueryTelemetry" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ts TIMESTAMPTZ NOT NULL,

    -- Correlation & context
    trace_id TEXT NOT NULL,
    conversation_id UUID NULL,
    user_id UUID NULL,
    org_id UUID NULL,
    session_id TEXT NULL,

    -- Query fingerprint (no raw text)
    query_hash TEXT NULL,
    query_prefix_hash TEXT NULL,
    query_length INT NULL CHECK (query_length IS NULL OR query_length >= 0),

    -- Classification
    language TEXT NULL,
    intent TEXT NULL,
    domain TEXT NULL CHECK (domain IS NULL OR domain IN ('finance', 'legal', 'medical', 'general', 'other')),
    keywords TEXT[] NULL,

    -- Retrieval behavior
    fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
    doc_scope_applied BOOLEAN NOT NULL DEFAULT FALSE,
    docs_searched INT NULL CHECK (docs_searched IS NULL OR docs_searched >= 0),
    chunks_returned INT NULL CHECK (chunks_returned IS NULL OR chunks_returned >= 0),

    -- Quality signals
    top_score DOUBLE PRECISION NULL CHECK (top_score IS NULL OR (top_score >= 0 AND top_score <= 1)),
    weak_evidence BOOLEAN NULL,
    citations_count INT NULL CHECK (citations_count IS NULL OR citations_count >= 0),
    answer_score DOUBLE PRECISION NULL CHECK (answer_score IS NULL OR (answer_score >= 0 AND answer_score <= 1)),
    answer_status TEXT NULL CHECK (answer_status IS NULL OR answer_status IN ('ok', 'error', 'refused', 'partial')),

    -- Performance
    latency_ms INT NULL CHECK (latency_ms IS NULL OR latency_ms >= 0),
    ttft_ms INT NULL CHECK (ttft_ms IS NULL OR ttft_ms >= 0),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_query_telemetry_ts_desc
    ON "QueryTelemetry" (ts DESC);

CREATE INDEX IF NOT EXISTS idx_query_telemetry_user_ts
    ON "QueryTelemetry" (user_id, ts DESC)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_query_telemetry_domain_ts
    ON "QueryTelemetry" (domain, ts DESC)
    WHERE domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_query_telemetry_intent_ts
    ON "QueryTelemetry" (intent, ts DESC)
    WHERE intent IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_query_telemetry_trace_id
    ON "QueryTelemetry" (trace_id);

CREATE INDEX IF NOT EXISTS idx_query_telemetry_weak_evidence_ts
    ON "QueryTelemetry" (weak_evidence, ts DESC)
    WHERE weak_evidence = TRUE;

CREATE INDEX IF NOT EXISTS idx_query_telemetry_conversation_ts
    ON "QueryTelemetry" (conversation_id, ts DESC)
    WHERE conversation_id IS NOT NULL;

-- Comment
COMMENT ON TABLE "QueryTelemetry" IS 'Per-query analytics telemetry. No raw query text - only hashes and metadata.';

-- endfile
