-- file: db/analytics/error_logs.sql
--
-- Sanitized error logs for reliability monitoring.
-- NO stack traces, tokens, secrets, or PII.
-- Messages are truncated and sanitized before storage.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "ErrorLog" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ts TIMESTAMPTZ NOT NULL,

    -- Correlation
    request_id TEXT NULL,
    trace_id TEXT NULL,

    -- Context
    user_id UUID NULL,
    org_id UUID NULL,
    conversation_id UUID NULL,
    document_id UUID NULL,

    -- Error classification
    service TEXT NOT NULL DEFAULT 'unknown',
    type TEXT NOT NULL DEFAULT 'unknown',
    severity TEXT NOT NULL DEFAULT 'med' CHECK (severity IN ('low', 'med', 'high')),

    -- Error details (sanitized)
    message TEXT NOT NULL CHECK (LENGTH(message) <= 240),
    fingerprint TEXT NOT NULL,
    error_code TEXT NULL,

    -- Resolution tracking
    resolved BOOLEAN NULL,
    resolved_at TIMESTAMPTZ NULL,
    resolved_by UUID NULL,

    -- Occurrence tracking
    occurrence_count INT NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_error_log_ts_desc
    ON "ErrorLog" (ts DESC);

CREATE INDEX IF NOT EXISTS idx_error_log_service_ts
    ON "ErrorLog" (service, ts DESC);

CREATE INDEX IF NOT EXISTS idx_error_log_severity_ts
    ON "ErrorLog" (severity, ts DESC);

CREATE INDEX IF NOT EXISTS idx_error_log_fingerprint_ts
    ON "ErrorLog" (fingerprint, ts DESC);

CREATE INDEX IF NOT EXISTS idx_error_log_user_ts
    ON "ErrorLog" (user_id, ts DESC)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_error_log_type_ts
    ON "ErrorLog" (type, ts DESC);

CREATE INDEX IF NOT EXISTS idx_error_log_trace_id
    ON "ErrorLog" (trace_id)
    WHERE trace_id IS NOT NULL;

-- Partial index for unresolved errors
CREATE INDEX IF NOT EXISTS idx_error_log_unresolved_ts
    ON "ErrorLog" (ts DESC)
    WHERE resolved IS NULL OR resolved = FALSE;

-- Partial index for high severity
CREATE INDEX IF NOT EXISTS idx_error_log_high_severity_ts
    ON "ErrorLog" (ts DESC)
    WHERE severity = 'high';

-- Comment
COMMENT ON TABLE "ErrorLog" IS 'Sanitized error logs. Messages truncated to 240 chars, no stack traces or secrets.';

-- endfile
