-- file: db/analytics/token_usage.sql
--
-- LLM call token usage and cost tracking.
-- Stores per-call metrics for cost analysis, latency monitoring, and provider comparison.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "TokenUsage" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ts TIMESTAMPTZ NOT NULL,

    -- Correlation
    trace_id TEXT NULL,
    conversation_id UUID NULL,
    message_id UUID NULL,
    user_id UUID NULL,
    org_id UUID NULL,

    -- Provider & model
    provider TEXT NOT NULL DEFAULT 'unknown',
    model TEXT NOT NULL DEFAULT 'unknown',

    -- Token counts
    input_tokens INT NULL CHECK (input_tokens IS NULL OR input_tokens >= 0),
    output_tokens INT NULL CHECK (output_tokens IS NULL OR output_tokens >= 0),
    total_tokens INT GENERATED ALWAYS AS (COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) STORED,

    -- Cost
    cost_usd NUMERIC(12, 6) NULL CHECK (cost_usd IS NULL OR cost_usd >= 0),

    -- Performance
    latency_ms INT NULL CHECK (latency_ms IS NULL OR latency_ms >= 0),
    ttft_ms INT NULL CHECK (ttft_ms IS NULL OR ttft_ms >= 0),

    -- Status
    status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error', 'timeout', 'cancelled')),
    error_code TEXT NULL,

    -- Call type
    call_type TEXT NULL CHECK (call_type IS NULL OR call_type IN ('chat', 'completion', 'embedding', 'rerank', 'other')),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_token_usage_ts_desc
    ON "TokenUsage" (ts DESC);

CREATE INDEX IF NOT EXISTS idx_token_usage_provider_model_ts
    ON "TokenUsage" (provider, model, ts DESC);

CREATE INDEX IF NOT EXISTS idx_token_usage_user_ts
    ON "TokenUsage" (user_id, ts DESC)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_token_usage_status_ts
    ON "TokenUsage" (status, ts DESC);

CREATE INDEX IF NOT EXISTS idx_token_usage_trace_id
    ON "TokenUsage" (trace_id)
    WHERE trace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_token_usage_conversation_ts
    ON "TokenUsage" (conversation_id, ts DESC)
    WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_token_usage_call_type_ts
    ON "TokenUsage" (call_type, ts DESC)
    WHERE call_type IS NOT NULL;

-- Comment
COMMENT ON TABLE "TokenUsage" IS 'LLM token usage and cost tracking per API call.';

-- endfile
