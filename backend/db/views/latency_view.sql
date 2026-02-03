-- file: db/views/latency_view.sql
-- Latency percentiles view for admin dashboard
-- Source: model_calls for LLM latency, query_telemetry for e2e latency
-- Privacy-safe: no PII, only aggregates

-- LLM Call Latency by Day
CREATE OR REPLACE VIEW admin_llm_latency_daily AS
SELECT
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
  COUNT(*) AS request_count,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "durationMs")::int AS p50_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "durationMs")::int AS p95_latency_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "durationMs")::int AS p99_latency_ms,
  AVG("durationMs")::int AS avg_latency_ms,
  AVG("firstTokenMs")::int AS avg_ttft_ms
FROM model_calls
WHERE "durationMs" IS NOT NULL
GROUP BY DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date
ORDER BY day DESC;

-- LLM Latency by Provider/Model
CREATE OR REPLACE VIEW admin_llm_latency_by_model_daily AS
SELECT
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
  provider,
  model,
  COUNT(*) AS request_count,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "durationMs")::int AS p50_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "durationMs")::int AS p95_latency_ms,
  AVG("durationMs")::int AS avg_latency_ms,
  AVG("firstTokenMs")::int AS avg_ttft_ms
FROM model_calls
WHERE "durationMs" IS NOT NULL
GROUP BY
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date,
  provider,
  model
ORDER BY day DESC, request_count DESC;

-- LLM Latency by Pipeline Stage
CREATE OR REPLACE VIEW admin_llm_latency_by_stage_daily AS
SELECT
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
  stage,
  COUNT(*) AS request_count,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "durationMs")::int AS p50_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "durationMs")::int AS p95_latency_ms,
  AVG("durationMs")::int AS avg_latency_ms
FROM model_calls
WHERE "durationMs" IS NOT NULL
GROUP BY
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date,
  stage
ORDER BY day DESC, stage;

-- End-to-End Query Latency from QueryTelemetry
CREATE OR REPLACE VIEW admin_query_latency_daily AS
SELECT
  DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')::date AS day,
  COUNT(*) AS query_count,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "totalMs")::int AS p50_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "totalMs")::int AS p95_latency_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "totalMs")::int AS p99_latency_ms,
  AVG("totalMs")::int AS avg_latency_ms,
  AVG(ttft)::int AS avg_ttft_ms,
  AVG("retrievalMs")::int AS avg_retrieval_ms,
  AVG("llmMs")::int AS avg_llm_ms
FROM query_telemetry
WHERE "totalMs" IS NOT NULL
GROUP BY DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')::date
ORDER BY day DESC;

-- Latency by Domain
CREATE OR REPLACE VIEW admin_query_latency_by_domain_daily AS
SELECT
  DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')::date AS day,
  COALESCE(domain, 'unknown') AS domain,
  COUNT(*) AS query_count,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "totalMs")::int AS p50_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "totalMs")::int AS p95_latency_ms,
  AVG("totalMs")::int AS avg_latency_ms
FROM query_telemetry
WHERE "totalMs" IS NOT NULL
GROUP BY
  DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')::date,
  domain
ORDER BY day DESC, query_count DESC;

-- endfile
