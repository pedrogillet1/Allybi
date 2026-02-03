-- file: db/views/intents_by_domain_daily.sql
-- Intent and Domain analytics for marketing insights
-- Source: retrieval_events, query_telemetry
-- Privacy-safe: no PII, only aggregates

-- Intents by Domain (cross-tab)
CREATE OR REPLACE VIEW admin_intents_by_domain_daily AS
SELECT
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
  COALESCE(domain, 'unknown') AS domain,
  COALESCE(intent, 'unknown') AS intent,
  COUNT(*) AS query_count,
  AVG("evidenceStrength")::numeric(5,3) AS avg_evidence,
  COUNT(*) FILTER (WHERE "evidenceStrength" < 0.35 OR "fallbackReasonCode" = 'WEAK_EVIDENCE') AS weak_count
FROM retrieval_events
GROUP BY
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date,
  domain,
  intent
ORDER BY day DESC, query_count DESC;

-- Domain Distribution Daily
CREATE OR REPLACE VIEW admin_domains_daily AS
SELECT
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
  COALESCE(domain, 'unknown') AS domain,
  COUNT(*) AS query_count,
  COUNT(DISTINCT "userId") AS unique_users,
  AVG("evidenceStrength")::numeric(5,3) AS avg_evidence
FROM retrieval_events
GROUP BY
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date,
  domain
ORDER BY day DESC, query_count DESC;

-- Intent Distribution Daily
CREATE OR REPLACE VIEW admin_intents_daily AS
SELECT
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
  COALESCE(intent, 'unknown') AS intent,
  COUNT(*) AS query_count,
  COUNT(DISTINCT "userId") AS unique_users,
  AVG("evidenceStrength")::numeric(5,3) AS avg_evidence
FROM retrieval_events
GROUP BY
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date,
  intent
ORDER BY day DESC, query_count DESC;

-- Operator Distribution Daily
CREATE OR REPLACE VIEW admin_operators_daily AS
SELECT
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
  COALESCE(operator, 'unknown') AS operator,
  COUNT(*) AS query_count,
  COUNT(DISTINCT "userId") AS unique_users,
  AVG("evidenceStrength")::numeric(5,3) AS avg_evidence
FROM retrieval_events
GROUP BY
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date,
  operator
ORDER BY day DESC, query_count DESC;

-- Strategy Distribution Daily
CREATE OR REPLACE VIEW admin_strategies_daily AS
SELECT
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
  COALESCE(strategy, 'unknown') AS strategy,
  COUNT(*) AS query_count,
  AVG("evidenceStrength")::numeric(5,3) AS avg_evidence,
  COUNT(*) FILTER (WHERE "evidenceStrength" >= 0.35) AS strong_evidence_count
FROM retrieval_events
GROUP BY
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date,
  strategy
ORDER BY day DESC, query_count DESC;

-- Domain-Intent Matrix (total counts, not daily)
CREATE OR REPLACE VIEW admin_domain_intent_matrix AS
SELECT
  COALESCE(domain, 'unknown') AS domain,
  COALESCE(intent, 'unknown') AS intent,
  COUNT(*) AS total_count,
  AVG("evidenceStrength")::numeric(5,3) AS avg_evidence,
  CASE
    WHEN COUNT(*) > 0
    THEN (COUNT(*) FILTER (WHERE "evidenceStrength" < 0.35)::float / COUNT(*)::float * 100)::numeric(5,2)
    ELSE 0
  END AS weak_rate_pct
FROM retrieval_events
GROUP BY domain, intent
ORDER BY total_count DESC;

-- endfile
