-- file: db/views/cost_view.sql
-- LLM Cost and Token Usage views for admin dashboard
-- Source: model_calls, token_usage
-- Privacy-safe: no PII, only aggregates

-- Daily Cost Summary
CREATE OR REPLACE VIEW admin_llm_cost_daily AS
SELECT
  DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC')::date AS day,
  COUNT(*) AS total_calls,
  SUM("inputTokens") AS input_tokens,
  SUM("outputTokens") AS output_tokens,
  SUM("totalTokens") AS total_tokens,
  SUM("totalCost")::numeric(12,6) AS cost_usd,
  AVG("latencyMs")::int AS avg_latency_ms
FROM token_usage
WHERE success = true
GROUP BY DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC')::date
ORDER BY day DESC;

-- Cost by Provider
CREATE OR REPLACE VIEW admin_llm_cost_by_provider_daily AS
SELECT
  DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC')::date AS day,
  provider,
  COUNT(*) AS calls,
  SUM("inputTokens") AS input_tokens,
  SUM("outputTokens") AS output_tokens,
  SUM("totalTokens") AS total_tokens,
  SUM("totalCost")::numeric(12,6) AS cost_usd,
  AVG("latencyMs")::int AS avg_latency_ms
FROM token_usage
WHERE success = true
GROUP BY
  DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC')::date,
  provider
ORDER BY day DESC, cost_usd DESC;

-- Cost by Provider/Model (detailed breakdown)
CREATE OR REPLACE VIEW admin_llm_cost_by_model_daily AS
SELECT
  DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC')::date AS day,
  provider,
  model,
  COUNT(*) AS calls,
  SUM("inputTokens")::bigint AS input_tokens,
  SUM("outputTokens")::bigint AS output_tokens,
  SUM("totalTokens")::bigint AS total_tokens,
  SUM(COALESCE("totalCost", 0))::numeric(12,6) AS cost_usd,
  AVG("latencyMs")::int AS avg_latency_ms
FROM token_usage
WHERE success = true
GROUP BY
  DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC')::date,
  provider,
  model
ORDER BY day DESC, cost_usd DESC;

-- Cost by Request Type
CREATE OR REPLACE VIEW admin_llm_cost_by_request_type_daily AS
SELECT
  DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC')::date AS day,
  "requestType",
  COUNT(*) AS calls,
  SUM("totalTokens")::bigint AS total_tokens,
  SUM(COALESCE("totalCost", 0))::numeric(12,6) AS cost_usd,
  AVG("latencyMs")::int AS avg_latency_ms
FROM token_usage
WHERE success = true
GROUP BY
  DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC')::date,
  "requestType"
ORDER BY day DESC, cost_usd DESC;

-- ModelCall-based cost view (alternative source)
CREATE OR REPLACE VIEW admin_modelcall_cost_daily AS
SELECT
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
  provider,
  model,
  stage,
  COUNT(*) AS calls,
  SUM(COALESCE("promptTokens", 0))::bigint AS prompt_tokens,
  SUM(COALESCE("completionTokens", 0))::bigint AS completion_tokens,
  SUM(COALESCE("totalTokens", 0))::bigint AS total_tokens,
  AVG("durationMs")::int AS avg_duration_ms,
  AVG("firstTokenMs")::int AS avg_ttft_ms,
  COUNT(*) FILTER (WHERE status = 'fail') AS error_count,
  CASE
    WHEN COUNT(*) > 0
    THEN (COUNT(*) FILTER (WHERE status = 'fail')::float / COUNT(*)::float * 100)::numeric(5,2)
    ELSE 0
  END AS error_rate_pct
FROM model_calls
GROUP BY
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date,
  provider,
  model,
  stage
ORDER BY day DESC, total_tokens DESC;

-- Monthly cost summary (for billing)
CREATE OR REPLACE VIEW admin_llm_cost_monthly AS
SELECT
  DATE_TRUNC('month', "createdAt" AT TIME ZONE 'UTC')::date AS month_start,
  provider,
  COUNT(*) AS total_calls,
  SUM("totalTokens")::bigint AS total_tokens,
  SUM(COALESCE("totalCost", 0))::numeric(12,6) AS cost_usd
FROM token_usage
WHERE success = true
GROUP BY
  DATE_TRUNC('month', "createdAt" AT TIME ZONE 'UTC')::date,
  provider
ORDER BY month_start DESC, cost_usd DESC;

-- endfile
