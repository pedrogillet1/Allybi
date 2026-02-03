-- file: db/views/keywords_top_daily.sql
-- Keyword analytics for marketing insights
-- Source: query_telemetry.matchedKeywords
-- Privacy-safe: no raw queries, only keyword aggregates

-- Note: Postgres requires unnesting arrays for grouping
-- This view extracts keywords from the matchedKeywords array column

CREATE OR REPLACE VIEW admin_keywords_daily AS
SELECT
  DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')::date AS day,
  keyword,
  COUNT(*) AS keyword_count,
  COUNT(DISTINCT "userId") AS unique_users
FROM query_telemetry,
     UNNEST("matchedKeywords") AS keyword
WHERE "matchedKeywords" IS NOT NULL
  AND array_length("matchedKeywords", 1) > 0
GROUP BY
  DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')::date,
  keyword
ORDER BY day DESC, keyword_count DESC;

-- Top Keywords Overall (last 30 days)
CREATE OR REPLACE VIEW admin_keywords_top_30d AS
SELECT
  keyword,
  COUNT(*) AS keyword_count,
  COUNT(DISTINCT "userId") AS unique_users,
  COUNT(DISTINCT DATE_TRUNC('day', timestamp)::date) AS days_active
FROM query_telemetry,
     UNNEST("matchedKeywords") AS keyword
WHERE "matchedKeywords" IS NOT NULL
  AND timestamp >= NOW() - INTERVAL '30 days'
GROUP BY keyword
ORDER BY keyword_count DESC
LIMIT 100;

-- Keywords by Domain
CREATE OR REPLACE VIEW admin_keywords_by_domain_daily AS
SELECT
  DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')::date AS day,
  COALESCE(domain, 'unknown') AS domain,
  keyword,
  COUNT(*) AS keyword_count
FROM query_telemetry,
     UNNEST("matchedKeywords") AS keyword
WHERE "matchedKeywords" IS NOT NULL
GROUP BY
  DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC')::date,
  domain,
  keyword
ORDER BY day DESC, keyword_count DESC;

-- Trending Keywords (comparing current vs previous period)
-- This is a more complex view that identifies trending keywords
CREATE OR REPLACE VIEW admin_keywords_trending AS
WITH current_period AS (
  SELECT
    keyword,
    COUNT(*) AS current_count
  FROM query_telemetry,
       UNNEST("matchedKeywords") AS keyword
  WHERE "matchedKeywords" IS NOT NULL
    AND timestamp >= NOW() - INTERVAL '7 days'
  GROUP BY keyword
),
previous_period AS (
  SELECT
    keyword,
    COUNT(*) AS previous_count
  FROM query_telemetry,
       UNNEST("matchedKeywords") AS keyword
  WHERE "matchedKeywords" IS NOT NULL
    AND timestamp >= NOW() - INTERVAL '14 days'
    AND timestamp < NOW() - INTERVAL '7 days'
  GROUP BY keyword
)
SELECT
  COALESCE(c.keyword, p.keyword) AS keyword,
  COALESCE(c.current_count, 0) AS current_count,
  COALESCE(p.previous_count, 0) AS previous_count,
  CASE
    WHEN COALESCE(p.previous_count, 0) = 0 THEN
      CASE WHEN COALESCE(c.current_count, 0) > 0 THEN 100 ELSE 0 END
    ELSE
      ((COALESCE(c.current_count, 0) - p.previous_count)::float / p.previous_count * 100)::numeric(7,2)
  END AS growth_pct,
  COALESCE(c.current_count, 0) > COALESCE(p.previous_count, 0) AS is_trending
FROM current_period c
FULL OUTER JOIN previous_period p ON c.keyword = p.keyword
WHERE COALESCE(c.current_count, 0) + COALESCE(p.previous_count, 0) >= 5
ORDER BY growth_pct DESC, current_count DESC
LIMIT 50;

-- endfile
