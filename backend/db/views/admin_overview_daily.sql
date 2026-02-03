-- file: db/views/admin_overview_daily.sql
-- Combined daily overview metrics for admin dashboard
-- Aggregates DAU, messages, uploads, tokens, quality metrics
-- Privacy-safe: no PII, only aggregates

CREATE OR REPLACE VIEW admin_overview_daily AS
WITH daily_users AS (
  SELECT
    DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')::date AS day,
    COUNT(DISTINCT "userId") AS dau
  FROM query_telemetry
  WHERE "userId" IS NOT NULL
  GROUP BY DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')::date
),
daily_messages AS (
  SELECT
    DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC')::date AS day,
    COUNT(*) AS messages
  FROM messages
  GROUP BY DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC')::date
),
daily_uploads AS (
  SELECT
    DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC')::date AS day,
    COUNT(*) AS uploads
  FROM documents
  GROUP BY DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC')::date
),
daily_llm AS (
  SELECT
    DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
    COUNT(*) AS llm_calls,
    SUM(COALESCE("totalTokens", 0)) AS tokens_total,
    CASE
      WHEN COUNT(*) > 0
      THEN (COUNT(*) FILTER (WHERE status = 'fail')::float / COUNT(*)::float * 100)::numeric(5,2)
      ELSE 0
    END AS llm_error_rate_pct,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "durationMs")::int AS latency_p50_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "durationMs")::int AS latency_p95_ms
  FROM model_calls
  GROUP BY DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date
),
daily_quality AS (
  SELECT
    DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
    COUNT(*) AS retrieval_count,
    COUNT(*) FILTER (WHERE "evidenceStrength" < 0.35 OR "fallbackReasonCode" = 'WEAK_EVIDENCE') AS weak_count,
    COUNT(*) FILTER (WHERE "evidenceStrength" IS NULL OR "fallbackReasonCode" = 'NO_EVIDENCE') AS no_evidence_count,
    CASE
      WHEN COUNT(*) > 0
      THEN (COUNT(*) FILTER (WHERE "evidenceStrength" < 0.35 OR "fallbackReasonCode" = 'WEAK_EVIDENCE')::float / COUNT(*)::float * 100)::numeric(5,2)
      ELSE 0
    END AS weak_evidence_rate_pct,
    CASE
      WHEN COUNT(*) > 0
      THEN (COUNT(*) FILTER (WHERE "evidenceStrength" IS NULL OR "fallbackReasonCode" = 'NO_EVIDENCE')::float / COUNT(*)::float * 100)::numeric(5,2)
      ELSE 0
    END AS no_evidence_rate_pct
  FROM retrieval_events
  GROUP BY DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date
),
daily_ingestion AS (
  SELECT
    DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
    COUNT(*) FILTER (WHERE status = 'fail') AS ingestion_failures
  FROM ingestion_events
  GROUP BY DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date
)
SELECT
  COALESCE(u.day, m.day, up.day, l.day, q.day, i.day) AS day,
  COALESCE(u.dau, 0) AS dau,
  COALESCE(m.messages, 0) AS messages,
  COALESCE(up.uploads, 0) AS uploads,
  COALESCE(l.llm_calls, 0) AS llm_calls,
  COALESCE(l.tokens_total, 0) AS tokens_total,
  COALESCE(l.llm_error_rate_pct, 0) AS llm_error_rate_pct,
  COALESCE(q.weak_evidence_rate_pct, 0) AS weak_evidence_rate_pct,
  COALESCE(q.no_evidence_rate_pct, 0) AS no_evidence_rate_pct,
  COALESCE(i.ingestion_failures, 0) AS ingestion_failures,
  l.latency_p50_ms,
  l.latency_p95_ms
FROM daily_users u
FULL OUTER JOIN daily_messages m USING (day)
FULL OUTER JOIN daily_uploads up USING (day)
FULL OUTER JOIN daily_llm l USING (day)
FULL OUTER JOIN daily_quality q USING (day)
FULL OUTER JOIN daily_ingestion i USING (day)
ORDER BY day DESC;

-- endfile
