-- file: db/views/patterns_top_daily.sql
-- Pattern analytics for marketing insights
-- Source: query_telemetry.matchedPatterns
-- Privacy-safe: patterns are normalized templates, no raw queries

CREATE OR REPLACE VIEW admin_patterns_daily AS
SELECT
  DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')::date AS day,
  pattern_key,
  COUNT(*) AS pattern_count,
  COUNT(DISTINCT "userId") AS unique_users
FROM query_telemetry,
     UNNEST("matchedPatterns") AS pattern_key
WHERE "matchedPatterns" IS NOT NULL
  AND array_length("matchedPatterns", 1) > 0
GROUP BY
  DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')::date,
  pattern_key
ORDER BY day DESC, pattern_count DESC;

-- Top Patterns Overall (last 30 days)
CREATE OR REPLACE VIEW admin_patterns_top_30d AS
SELECT
  pattern_key,
  COUNT(*) AS pattern_count,
  COUNT(DISTINCT "userId") AS unique_users,
  COUNT(DISTINCT DATE_TRUNC('day', timestamp)::date) AS days_active
FROM query_telemetry,
     UNNEST("matchedPatterns") AS pattern_key
WHERE "matchedPatterns" IS NOT NULL
  AND timestamp >= NOW() - INTERVAL '30 days'
GROUP BY pattern_key
ORDER BY pattern_count DESC
LIMIT 100;

-- Patterns by Intent
CREATE OR REPLACE VIEW admin_patterns_by_intent_daily AS
SELECT
  DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')::date AS day,
  COALESCE(intent, 'unknown') AS intent,
  pattern_key,
  COUNT(*) AS pattern_count
FROM query_telemetry,
     UNNEST("matchedPatterns") AS pattern_key
WHERE "matchedPatterns" IS NOT NULL
GROUP BY
  DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')::date,
  intent,
  pattern_key
ORDER BY day DESC, pattern_count DESC;

-- Patterns by Domain
CREATE OR REPLACE VIEW admin_patterns_by_domain_daily AS
SELECT
  DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')::date AS day,
  COALESCE(domain, 'unknown') AS domain,
  pattern_key,
  COUNT(*) AS pattern_count
FROM query_telemetry,
     UNNEST("matchedPatterns") AS pattern_key
WHERE "matchedPatterns" IS NOT NULL
GROUP BY
  DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')::date,
  domain,
  pattern_key
ORDER BY day DESC, pattern_count DESC;

-- Pattern Success Rate (patterns with quality outcomes)
CREATE OR REPLACE VIEW admin_patterns_quality AS
SELECT
  pattern_key,
  COUNT(*) AS total_count,
  COUNT(*) FILTER (WHERE "isUseful" = true) AS useful_count,
  COUNT(*) FILTER (WHERE "hadFallback" = true) AS fallback_count,
  CASE
    WHEN COUNT(*) > 0
    THEN (COUNT(*) FILTER (WHERE "isUseful" = true)::float / COUNT(*)::float * 100)::numeric(5,2)
    ELSE 0
  END AS useful_rate_pct,
  CASE
    WHEN COUNT(*) > 0
    THEN (COUNT(*) FILTER (WHERE "hadFallback" = true)::float / COUNT(*)::float * 100)::numeric(5,2)
    ELSE 0
  END AS fallback_rate_pct
FROM query_telemetry,
     UNNEST("matchedPatterns") AS pattern_key
WHERE "matchedPatterns" IS NOT NULL
  AND timestamp >= NOW() - INTERVAL '30 days'
GROUP BY pattern_key
HAVING COUNT(*) >= 10
ORDER BY useful_rate_pct DESC, total_count DESC;

-- endfile
