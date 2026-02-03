-- file: db/views/wau_view.sql
-- Weekly Active Users view for admin dashboard
-- Uses ISO week (Monday start) in UTC
-- Privacy-safe: no PII, only aggregates

CREATE OR REPLACE VIEW admin_wau_weekly AS
SELECT
  DATE_TRUNC('week', timestamp AT TIME ZONE 'UTC')::date AS week_start,
  COUNT(DISTINCT "userId") AS wau
FROM query_telemetry
WHERE "userId" IS NOT NULL
GROUP BY DATE_TRUNC('week', timestamp AT TIME ZONE 'UTC')::date
ORDER BY week_start DESC;

-- Alternative using usage_events
CREATE OR REPLACE VIEW admin_wau_weekly_from_usage AS
SELECT
  DATE_TRUNC('week', at AT TIME ZONE 'UTC')::date AS week_start,
  COUNT(DISTINCT "userId") AS wau
FROM usage_events
WHERE "userId" IS NOT NULL
GROUP BY DATE_TRUNC('week', at AT TIME ZONE 'UTC')::date
ORDER BY week_start DESC;

-- Combined view for most accurate WAU
CREATE OR REPLACE VIEW admin_wau_weekly_combined AS
SELECT
  week_start,
  COUNT(DISTINCT user_id) AS wau
FROM (
  SELECT
    DATE_TRUNC('week', timestamp AT TIME ZONE 'UTC')::date AS week_start,
    "userId" AS user_id
  FROM query_telemetry
  WHERE "userId" IS NOT NULL

  UNION

  SELECT
    DATE_TRUNC('week', at AT TIME ZONE 'UTC')::date AS week_start,
    "userId" AS user_id
  FROM usage_events
  WHERE "userId" IS NOT NULL
) combined
GROUP BY week_start
ORDER BY week_start DESC;

-- Monthly Active Users (bonus)
CREATE OR REPLACE VIEW admin_mau_monthly AS
SELECT
  DATE_TRUNC('month', timestamp AT TIME ZONE 'UTC')::date AS month_start,
  COUNT(DISTINCT "userId") AS mau
FROM query_telemetry
WHERE "userId" IS NOT NULL
GROUP BY DATE_TRUNC('month', timestamp AT TIME ZONE 'UTC')::date
ORDER BY month_start DESC;

-- endfile
