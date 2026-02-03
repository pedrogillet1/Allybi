-- file: db/views/reliability_view.sql
-- Reliability and Error Rate views for admin dashboard
-- Source: model_calls, error_logs, ingestion_events
-- Privacy-safe: no PII, only aggregates

-- Daily LLM Reliability
CREATE OR REPLACE VIEW admin_llm_reliability_daily AS
SELECT
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
  COUNT(*) AS total_calls,
  COUNT(*) FILTER (WHERE status = 'ok') AS success_count,
  COUNT(*) FILTER (WHERE status = 'fail') AS error_count,
  CASE
    WHEN COUNT(*) > 0
    THEN (COUNT(*) FILTER (WHERE status = 'fail')::float / COUNT(*)::float * 100)::numeric(5,2)
    ELSE 0
  END AS error_rate_pct,
  CASE
    WHEN COUNT(*) > 0
    THEN (COUNT(*) FILTER (WHERE status = 'ok')::float / COUNT(*)::float * 100)::numeric(5,2)
    ELSE 100
  END AS success_rate_pct,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "durationMs")::int AS p95_latency_ms
FROM model_calls
GROUP BY DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date
ORDER BY day DESC;

-- LLM Reliability by Provider
CREATE OR REPLACE VIEW admin_llm_reliability_by_provider_daily AS
SELECT
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
  provider,
  COUNT(*) AS total_calls,
  COUNT(*) FILTER (WHERE status = 'fail') AS error_count,
  CASE
    WHEN COUNT(*) > 0
    THEN (COUNT(*) FILTER (WHERE status = 'fail')::float / COUNT(*)::float * 100)::numeric(5,2)
    ELSE 0
  END AS error_rate_pct,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "durationMs")::int AS p95_latency_ms
FROM model_calls
GROUP BY
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date,
  provider
ORDER BY day DESC, provider;

-- LLM Error Breakdown by Error Code
CREATE OR REPLACE VIEW admin_llm_errors_by_code_daily AS
SELECT
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
  provider,
  model,
  COALESCE("errorCode", 'UNKNOWN') AS error_code,
  COUNT(*) AS error_count
FROM model_calls
WHERE status = 'fail'
GROUP BY
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date,
  provider,
  model,
  "errorCode"
ORDER BY day DESC, error_count DESC;

-- Error Log Summary
CREATE OR REPLACE VIEW admin_error_logs_daily AS
SELECT
  DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC')::date AS day,
  service,
  "errorType" AS error_type,
  severity,
  COUNT(*) AS error_count,
  COUNT(*) FILTER (WHERE resolved = true) AS resolved_count
FROM error_logs
GROUP BY
  DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC')::date,
  service,
  "errorType",
  severity
ORDER BY day DESC, error_count DESC;

-- Error Log by Severity
CREATE OR REPLACE VIEW admin_error_logs_by_severity_daily AS
SELECT
  DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC')::date AS day,
  severity,
  COUNT(*) AS error_count,
  COUNT(*) FILTER (WHERE resolved = true) AS resolved_count,
  COUNT(*) FILTER (WHERE resolved = false OR resolved IS NULL) AS unresolved_count
FROM error_logs
GROUP BY
  DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC')::date,
  severity
ORDER BY day DESC, error_count DESC;

-- Ingestion Reliability
CREATE OR REPLACE VIEW admin_ingestion_reliability_daily AS
SELECT
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
  COUNT(*) AS total_ingestions,
  COUNT(*) FILTER (WHERE status = 'ok') AS success_count,
  COUNT(*) FILTER (WHERE status = 'fail') AS failure_count,
  CASE
    WHEN COUNT(*) > 0
    THEN (COUNT(*) FILTER (WHERE status = 'fail')::float / COUNT(*)::float * 100)::numeric(5,2)
    ELSE 0
  END AS failure_rate_pct,
  AVG("durationMs")::int AS avg_duration_ms,
  AVG("chunkCount")::int AS avg_chunk_count
FROM ingestion_events
GROUP BY DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date
ORDER BY day DESC;

-- Ingestion Reliability by MIME Type
CREATE OR REPLACE VIEW admin_ingestion_reliability_by_type_daily AS
SELECT
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
  COALESCE("mimeType", 'unknown') AS mime_type,
  COUNT(*) AS total_ingestions,
  COUNT(*) FILTER (WHERE status = 'ok') AS success_count,
  COUNT(*) FILTER (WHERE status = 'fail') AS failure_count,
  CASE
    WHEN COUNT(*) > 0
    THEN (COUNT(*) FILTER (WHERE status = 'fail')::float / COUNT(*)::float * 100)::numeric(5,2)
    ELSE 0
  END AS failure_rate_pct,
  AVG("durationMs")::int AS avg_duration_ms
FROM ingestion_events
GROUP BY
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date,
  "mimeType"
ORDER BY day DESC, total_ingestions DESC;

-- Combined Reliability Summary
CREATE OR REPLACE VIEW admin_reliability_summary_daily AS
SELECT
  day,
  llm_calls,
  llm_error_rate_pct,
  llm_p95_latency_ms,
  ingestion_count,
  ingestion_failure_rate_pct,
  error_log_count,
  high_sev_errors
FROM (
  SELECT DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
         COUNT(*) AS llm_calls,
         CASE WHEN COUNT(*) > 0
              THEN (COUNT(*) FILTER (WHERE status = 'fail')::float / COUNT(*)::float * 100)::numeric(5,2)
              ELSE 0 END AS llm_error_rate_pct,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "durationMs")::int AS llm_p95_latency_ms
  FROM model_calls
  GROUP BY DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date
) llm
FULL OUTER JOIN (
  SELECT DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
         COUNT(*) AS ingestion_count,
         CASE WHEN COUNT(*) > 0
              THEN (COUNT(*) FILTER (WHERE status = 'fail')::float / COUNT(*)::float * 100)::numeric(5,2)
              ELSE 0 END AS ingestion_failure_rate_pct
  FROM ingestion_events
  GROUP BY DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date
) ing USING (day)
FULL OUTER JOIN (
  SELECT DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC')::date AS day,
         COUNT(*) AS error_log_count,
         COUNT(*) FILTER (WHERE severity = 'error') AS high_sev_errors
  FROM error_logs
  GROUP BY DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC')::date
) err USING (day)
ORDER BY day DESC;

-- endfile
