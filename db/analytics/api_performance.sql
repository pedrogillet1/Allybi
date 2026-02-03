-- file: db/analytics/api_performance.sql
--
-- API request-level performance metrics.
-- Stores per-request latency, status codes, and rate limiting data.
-- NO raw IP or user-agent stored - only hashes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "ApiPerformanceLog" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ts TIMESTAMPTZ NOT NULL,

    -- Request identification
    request_id TEXT NULL,
    trace_id TEXT NULL,

    -- Route info
    route TEXT NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD')),

    -- Response
    status_code INT NOT NULL CHECK (status_code >= 100 AND status_code <= 599),

    -- Performance
    latency_ms INT NULL CHECK (latency_ms IS NULL OR latency_ms >= 0),
    ttft_ms INT NULL CHECK (ttft_ms IS NULL OR ttft_ms >= 0),
    response_size_bytes INT NULL CHECK (response_size_bytes IS NULL OR response_size_bytes >= 0),

    -- User context (no PII)
    user_id UUID NULL,
    org_id UUID NULL,
    session_id TEXT NULL,

    -- Client fingerprint (hashed - no raw IP/UA)
    ip_hash TEXT NULL,
    user_agent_hash TEXT NULL,

    -- Rate limiting
    rate_limited BOOLEAN NOT NULL DEFAULT FALSE,
    rate_limit_bucket TEXT NULL,

    -- Error info (if applicable)
    error_code TEXT NULL,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_api_perf_ts_desc
    ON "ApiPerformanceLog" (ts DESC);

CREATE INDEX IF NOT EXISTS idx_api_perf_route_ts
    ON "ApiPerformanceLog" (route, ts DESC);

CREATE INDEX IF NOT EXISTS idx_api_perf_status_ts
    ON "ApiPerformanceLog" (status_code, ts DESC);

CREATE INDEX IF NOT EXISTS idx_api_perf_user_ts
    ON "ApiPerformanceLog" (user_id, ts DESC)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_api_perf_rate_limited_ts
    ON "ApiPerformanceLog" (rate_limited, ts DESC)
    WHERE rate_limited = TRUE;

CREATE INDEX IF NOT EXISTS idx_api_perf_request_id
    ON "ApiPerformanceLog" (request_id)
    WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_api_perf_trace_id
    ON "ApiPerformanceLog" (trace_id)
    WHERE trace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_api_perf_method_route_ts
    ON "ApiPerformanceLog" (method, route, ts DESC);

-- Partial index for errors (4xx, 5xx)
CREATE INDEX IF NOT EXISTS idx_api_perf_errors_ts
    ON "ApiPerformanceLog" (ts DESC)
    WHERE status_code >= 400;

-- Comment
COMMENT ON TABLE "ApiPerformanceLog" IS 'API request performance metrics. IP and user-agent stored as hashes only.';

-- endfile
