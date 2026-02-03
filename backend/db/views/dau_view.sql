-- file: db/views/dau_view.sql
-- Daily Active Users view for admin dashboard
-- Source: query_telemetry (preferred) with fallback to usage_events
-- Privacy-safe: no PII, only aggregates

CREATE OR REPLACE VIEW admin_dau_daily AS
SELECT
  DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')::date AS day,
  COUNT(DISTINCT "userId") AS dau
FROM query_telemetry
WHERE "userId" IS NOT NULL
GROUP BY DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')::date
ORDER BY day DESC;

-- Alternative view using usage_events if query_telemetry is sparse
CREATE OR REPLACE VIEW admin_dau_daily_from_usage AS
SELECT
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
  COUNT(DISTINCT "userId") AS dau
FROM usage_events
WHERE "userId" IS NOT NULL
GROUP BY DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date
ORDER BY day DESC;

-- Combined view that uses both sources for most accurate DAU
CREATE OR REPLACE VIEW admin_dau_daily_combined AS
SELECT
  day,
  COUNT(DISTINCT user_id) AS dau
FROM (
  SELECT
    DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')::date AS day,
    "userId" AS user_id
  FROM query_telemetry
  WHERE "userId" IS NOT NULL

  UNION

  SELECT
    DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
    "userId" AS user_id
  FROM usage_events
  WHERE "userId" IS NOT NULL
) combined
GROUP BY day
ORDER BY day DESC;

-- endfile
