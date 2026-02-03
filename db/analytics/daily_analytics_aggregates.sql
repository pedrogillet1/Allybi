-- file: db/analytics/daily_analytics_aggregates.sql
--
-- Daily rollup aggregates for dashboard KPIs and charts.
-- Pre-computed daily metrics for fast dashboard loading.
-- Updated by analytics rollup jobs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "DailyAnalyticsAggregate" (
    -- Primary key is the day
    day DATE PRIMARY KEY,

    -- User metrics
    active_users INT NOT NULL DEFAULT 0 CHECK (active_users >= 0),
    new_users INT NOT NULL DEFAULT 0 CHECK (new_users >= 0),
    returning_users INT NOT NULL DEFAULT 0 CHECK (returning_users >= 0),

    -- Engagement metrics
    messages INT NOT NULL DEFAULT 0 CHECK (messages >= 0),
    conversations INT NOT NULL DEFAULT 0 CHECK (conversations >= 0),
    queries INT NOT NULL DEFAULT 0 CHECK (queries >= 0),

    -- Document metrics
    documents_uploaded INT NOT NULL DEFAULT 0 CHECK (documents_uploaded >= 0),
    documents_processed INT NOT NULL DEFAULT 0 CHECK (documents_processed >= 0),
    documents_failed INT NOT NULL DEFAULT 0 CHECK (documents_failed >= 0),
    total_document_bytes BIGINT NOT NULL DEFAULT 0 CHECK (total_document_bytes >= 0),

    -- Answer quality metrics
    weak_evidence_count INT NOT NULL DEFAULT 0 CHECK (weak_evidence_count >= 0),
    weak_evidence_rate DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (weak_evidence_rate >= 0 AND weak_evidence_rate <= 1),
    avg_answer_score DOUBLE PRECISION NULL CHECK (avg_answer_score IS NULL OR (avg_answer_score >= 0 AND avg_answer_score <= 1)),
    avg_top_score DOUBLE PRECISION NULL CHECK (avg_top_score IS NULL OR (avg_top_score >= 0 AND avg_top_score <= 1)),
    fallback_count INT NOT NULL DEFAULT 0 CHECK (fallback_count >= 0),
    fallback_rate DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (fallback_rate >= 0 AND fallback_rate <= 1),

    -- API performance metrics
    api_requests INT NOT NULL DEFAULT 0 CHECK (api_requests >= 0),
    api_errors INT NOT NULL DEFAULT 0 CHECK (api_errors >= 0),
    api_error_rate DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (api_error_rate >= 0 AND api_error_rate <= 1),
    p50_latency_ms INT NULL CHECK (p50_latency_ms IS NULL OR p50_latency_ms >= 0),
    p95_latency_ms INT NULL CHECK (p95_latency_ms IS NULL OR p95_latency_ms >= 0),
    p99_latency_ms INT NULL CHECK (p99_latency_ms IS NULL OR p99_latency_ms >= 0),
    ttft_avg_ms INT NULL CHECK (ttft_avg_ms IS NULL OR ttft_avg_ms >= 0),

    -- LLM cost metrics
    llm_calls INT NOT NULL DEFAULT 0 CHECK (llm_calls >= 0),
    llm_errors INT NOT NULL DEFAULT 0 CHECK (llm_errors >= 0),
    llm_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0 CHECK (llm_cost_usd >= 0),
    llm_tokens_in BIGINT NOT NULL DEFAULT 0 CHECK (llm_tokens_in >= 0),
    llm_tokens_out BIGINT NOT NULL DEFAULT 0 CHECK (llm_tokens_out >= 0),
    llm_avg_latency_ms INT NULL CHECK (llm_avg_latency_ms IS NULL OR llm_avg_latency_ms >= 0),

    -- Security metrics
    auth_failures INT NOT NULL DEFAULT 0 CHECK (auth_failures >= 0),
    rate_limit_triggers INT NOT NULL DEFAULT 0 CHECK (rate_limit_triggers >= 0),

    -- Domain breakdown (JSONB for flexibility)
    queries_by_domain JSONB NULL,
    -- Expected format: {"finance": 100, "legal": 50, "medical": 30, "general": 200, "other": 20}

    -- Metadata
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for time-series queries
CREATE INDEX IF NOT EXISTS idx_daily_analytics_day_desc
    ON "DailyAnalyticsAggregate" (day DESC);

-- Comment
COMMENT ON TABLE "DailyAnalyticsAggregate" IS 'Daily rollup aggregates for dashboard KPIs. Updated by analytics jobs.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Hourly aggregates for finer granularity
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "HourlyAnalyticsAggregate" (
    -- Composite primary key: day + hour
    day DATE NOT NULL,
    hour INT NOT NULL CHECK (hour >= 0 AND hour <= 23),

    -- User metrics
    active_users INT NOT NULL DEFAULT 0 CHECK (active_users >= 0),

    -- Engagement metrics
    messages INT NOT NULL DEFAULT 0 CHECK (messages >= 0),
    queries INT NOT NULL DEFAULT 0 CHECK (queries >= 0),

    -- Document metrics
    documents_uploaded INT NOT NULL DEFAULT 0 CHECK (documents_uploaded >= 0),

    -- Quality metrics
    weak_evidence_count INT NOT NULL DEFAULT 0 CHECK (weak_evidence_count >= 0),

    -- API metrics
    api_requests INT NOT NULL DEFAULT 0 CHECK (api_requests >= 0),
    api_errors INT NOT NULL DEFAULT 0 CHECK (api_errors >= 0),
    avg_latency_ms INT NULL CHECK (avg_latency_ms IS NULL OR avg_latency_ms >= 0),

    -- LLM metrics
    llm_calls INT NOT NULL DEFAULT 0 CHECK (llm_calls >= 0),
    llm_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0 CHECK (llm_cost_usd >= 0),
    llm_tokens BIGINT NOT NULL DEFAULT 0 CHECK (llm_tokens >= 0),

    -- Metadata
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (day, hour)
);

-- Index for time-series queries
CREATE INDEX IF NOT EXISTS idx_hourly_analytics_day_hour_desc
    ON "HourlyAnalyticsAggregate" (day DESC, hour DESC);

-- Comment
COMMENT ON TABLE "HourlyAnalyticsAggregate" IS 'Hourly rollup aggregates for intraday dashboards.';

-- endfile
