-- file: db/views/quality_by_domain_daily.sql
-- Quality metrics by domain for admin dashboard
-- Source: retrieval_events
-- Privacy-safe: no PII, only aggregates

CREATE OR REPLACE VIEW admin_quality_by_domain_daily AS
SELECT
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
  COALESCE(domain, 'unknown') AS domain,
  COUNT(*) AS total_answers,
  COUNT(*) FILTER (WHERE "evidenceStrength" < 0.35 OR "fallbackReasonCode" = 'WEAK_EVIDENCE') AS weak_count,
  COUNT(*) FILTER (WHERE "evidenceStrength" IS NULL OR "fallbackReasonCode" = 'NO_EVIDENCE') AS no_evidence_count,
  CASE
    WHEN COUNT(*) > 0
    THEN (COUNT(*) FILTER (WHERE "evidenceStrength" < 0.35 OR "fallbackReasonCode" = 'WEAK_EVIDENCE')::float / COUNT(*)::float * 100)::numeric(5,2)
    ELSE 0
  END AS weak_rate_pct,
  AVG("evidenceStrength")::numeric(5,3) AS avg_evidence
FROM retrieval_events
GROUP BY
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date,
  domain
ORDER BY day DESC, total_answers DESC;

-- Quality by Intent
CREATE OR REPLACE VIEW admin_quality_by_intent_daily AS
SELECT
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
  COALESCE(intent, 'unknown') AS intent,
  COUNT(*) AS total_answers,
  COUNT(*) FILTER (WHERE "evidenceStrength" < 0.35 OR "fallbackReasonCode" = 'WEAK_EVIDENCE') AS weak_count,
  CASE
    WHEN COUNT(*) > 0
    THEN (COUNT(*) FILTER (WHERE "evidenceStrength" < 0.35 OR "fallbackReasonCode" = 'WEAK_EVIDENCE')::float / COUNT(*)::float * 100)::numeric(5,2)
    ELSE 0
  END AS weak_rate_pct,
  AVG("evidenceStrength")::numeric(5,3) AS avg_evidence
FROM retrieval_events
GROUP BY
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date,
  intent
ORDER BY day DESC, total_answers DESC;

-- Quality by Operator
CREATE OR REPLACE VIEW admin_quality_by_operator_daily AS
SELECT
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
  COALESCE(operator, 'unknown') AS operator,
  COUNT(*) AS total_answers,
  COUNT(*) FILTER (WHERE "evidenceStrength" < 0.35 OR "fallbackReasonCode" = 'WEAK_EVIDENCE') AS weak_count,
  CASE
    WHEN COUNT(*) > 0
    THEN (COUNT(*) FILTER (WHERE "evidenceStrength" < 0.35 OR "fallbackReasonCode" = 'WEAK_EVIDENCE')::float / COUNT(*)::float * 100)::numeric(5,2)
    ELSE 0
  END AS weak_rate_pct,
  AVG("evidenceStrength")::numeric(5,3) AS avg_evidence
FROM retrieval_events
GROUP BY
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date,
  operator
ORDER BY day DESC, total_answers DESC;

-- Quality Summary (all dimensions combined)
CREATE OR REPLACE VIEW admin_quality_summary_daily AS
SELECT
  DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date AS day,
  COUNT(*) AS total_answers,
  COUNT(*) FILTER (WHERE "evidenceStrength" >= 0.35 AND "fallbackReasonCode" IS NULL) AS strong_evidence_count,
  COUNT(*) FILTER (WHERE "evidenceStrength" < 0.35 OR "fallbackReasonCode" = 'WEAK_EVIDENCE') AS weak_evidence_count,
  COUNT(*) FILTER (WHERE "evidenceStrength" IS NULL OR "fallbackReasonCode" = 'NO_EVIDENCE') AS no_evidence_count,
  COUNT(*) FILTER (WHERE refined = true) AS refined_count,
  COUNT(*) FILTER (WHERE "navPillsUsed" = true) AS nav_pills_used_count,
  AVG("evidenceStrength")::numeric(5,3) AS avg_evidence,
  AVG("sourcesCount")::numeric(5,2) AS avg_sources_count
FROM retrieval_events
GROUP BY DATE_TRUNC('day', at AT TIME ZONE 'UTC')::date
ORDER BY day DESC;

-- endfile
