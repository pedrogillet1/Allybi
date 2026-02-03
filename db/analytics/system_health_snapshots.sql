-- file: db/analytics/system_health_snapshots.sql
--
-- System health state snapshots for monitoring and alerting.
-- Captures point-in-time health metrics for all system components.
-- NO PII or raw content in details JSONB.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "SystemHealthSnapshot" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ts TIMESTAMPTZ NOT NULL,

    -- Component identification
    component TEXT NOT NULL CHECK (component IN ('queue', 'api', 'db', 's3', 'preview', 'worker', 'llm', 'search', 'cache', 'other')),

    -- Health status
    status TEXT NOT NULL CHECK (status IN ('ok', 'degraded', 'down')),

    -- Metric being measured
    metric_name TEXT NOT NULL,
    metric_value DOUBLE PRECISION NULL,
    threshold_value DOUBLE PRECISION NULL,
    threshold_breached BOOLEAN NOT NULL DEFAULT FALSE,

    -- Additional context (no PII)
    details JSONB NULL,

    -- Alert info
    alert_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    alert_type TEXT NULL,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_health_snapshot_ts_desc
    ON "SystemHealthSnapshot" (ts DESC);

CREATE INDEX IF NOT EXISTS idx_health_snapshot_component_ts
    ON "SystemHealthSnapshot" (component, ts DESC);

CREATE INDEX IF NOT EXISTS idx_health_snapshot_status_ts
    ON "SystemHealthSnapshot" (status, ts DESC);

CREATE INDEX IF NOT EXISTS idx_health_snapshot_metric_ts
    ON "SystemHealthSnapshot" (metric_name, ts DESC);

-- Partial index for non-ok status
CREATE INDEX IF NOT EXISTS idx_health_snapshot_degraded_ts
    ON "SystemHealthSnapshot" (ts DESC)
    WHERE status != 'ok';

-- Partial index for alerts
CREATE INDEX IF NOT EXISTS idx_health_snapshot_alerts_ts
    ON "SystemHealthSnapshot" (ts DESC)
    WHERE alert_triggered = TRUE;

-- Comment
COMMENT ON TABLE "SystemHealthSnapshot" IS 'System health snapshots for monitoring. No PII in details JSONB.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Queue health snapshots (specialized)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "QueueHealthSnapshot" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ts TIMESTAMPTZ NOT NULL,

    -- Queue identification
    queue_name TEXT NOT NULL,

    -- Queue metrics
    waiting INT NOT NULL DEFAULT 0 CHECK (waiting >= 0),
    active INT NOT NULL DEFAULT 0 CHECK (active >= 0),
    completed INT NOT NULL DEFAULT 0 CHECK (completed >= 0),
    failed INT NOT NULL DEFAULT 0 CHECK (failed >= 0),
    stalled INT NOT NULL DEFAULT 0 CHECK (stalled >= 0),
    delayed INT NOT NULL DEFAULT 0 CHECK (delayed >= 0),

    -- Age metrics (in ms)
    oldest_waiting_age_ms INT NULL CHECK (oldest_waiting_age_ms IS NULL OR oldest_waiting_age_ms >= 0),
    avg_processing_time_ms INT NULL CHECK (avg_processing_time_ms IS NULL OR avg_processing_time_ms >= 0),

    -- Throughput
    processed_last_hour INT NOT NULL DEFAULT 0 CHECK (processed_last_hour >= 0),
    failed_last_hour INT NOT NULL DEFAULT 0 CHECK (failed_last_hour >= 0),

    -- Alert status
    alert_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    alert_reason TEXT NULL,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_queue_health_ts_desc
    ON "QueueHealthSnapshot" (ts DESC);

CREATE INDEX IF NOT EXISTS idx_queue_health_queue_ts
    ON "QueueHealthSnapshot" (queue_name, ts DESC);

CREATE INDEX IF NOT EXISTS idx_queue_health_alerts_ts
    ON "QueueHealthSnapshot" (ts DESC)
    WHERE alert_triggered = TRUE;

-- Comment
COMMENT ON TABLE "QueueHealthSnapshot" IS 'Queue-specific health snapshots for job processing monitoring.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Security snapshots
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "SecuritySnapshot" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ts TIMESTAMPTZ NOT NULL,

    -- Time window
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    window_minutes INT NOT NULL CHECK (window_minutes > 0),

    -- Security metrics
    failed_logins INT NOT NULL DEFAULT 0 CHECK (failed_logins >= 0),
    rate_limit_triggers INT NOT NULL DEFAULT 0 CHECK (rate_limit_triggers >= 0),
    admin_actions INT NOT NULL DEFAULT 0 CHECK (admin_actions >= 0),
    suspicious_ips INT NOT NULL DEFAULT 0 CHECK (suspicious_ips >= 0),

    -- Alert info
    alert_count INT NOT NULL DEFAULT 0 CHECK (alert_count >= 0),
    alerts TEXT[] NULL,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_security_snapshot_ts_desc
    ON "SecuritySnapshot" (ts DESC);

CREATE INDEX IF NOT EXISTS idx_security_snapshot_alerts_ts
    ON "SecuritySnapshot" (ts DESC)
    WHERE alert_count > 0;

-- Comment
COMMENT ON TABLE "SecuritySnapshot" IS 'Security monitoring snapshots. No PII - only aggregate counts.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Job run tracking
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "JobRun" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Job identification
    job_name TEXT NOT NULL,

    -- Execution status
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
    duration_ms INT NOT NULL CHECK (duration_ms >= 0),

    -- Result counts (no sensitive data)
    counts JSONB NULL,

    -- Error info (sanitized)
    error_message TEXT NULL CHECK (error_message IS NULL OR LENGTH(error_message) <= 240),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_run_created_desc
    ON "JobRun" (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_run_name_created
    ON "JobRun" (job_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_run_status_created
    ON "JobRun" (status, created_at DESC);

-- Partial index for failures
CREATE INDEX IF NOT EXISTS idx_job_run_failures
    ON "JobRun" (created_at DESC)
    WHERE status = 'failed';

-- Comment
COMMENT ON TABLE "JobRun" IS 'Background job execution tracking.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Retention cohorts
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "RetentionCohort" (
    -- Composite key: cohort date + window
    bucket_key TEXT PRIMARY KEY,

    -- Cohort definition
    cohort_date DATE NOT NULL,
    window_days INT NOT NULL CHECK (window_days > 0),

    -- Cohort metrics
    cohort_size INT NOT NULL CHECK (cohort_size >= 0),
    retained_count INT NOT NULL CHECK (retained_count >= 0),
    retention_rate DOUBLE PRECISION NOT NULL CHECK (retention_rate >= 0 AND retention_rate <= 1),

    -- Metadata
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_retention_cohort_date_desc
    ON "RetentionCohort" (cohort_date DESC);

CREATE INDEX IF NOT EXISTS idx_retention_cohort_window
    ON "RetentionCohort" (window_days, cohort_date DESC);

-- Comment
COMMENT ON TABLE "RetentionCohort" IS 'User retention cohort analysis (D1, D7, D30).';

-- endfile
