-- Normalize telemetry repair updates to canonical mapped table names.
-- Historical environments may contain either mapped snake_case tables
-- or mistakenly-created PascalCase tables, so we patch both variants.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'retrieval_events'
  ) THEN
    UPDATE "retrieval_events"
    SET "evidenceStrength" = LEAST("evidenceStrength" * 100.0 / 6.0, 1.0)
    WHERE "evidenceStrength" IS NOT NULL
      AND "evidenceStrength" > 0
      AND "evidenceStrength" < 0.5;

    UPDATE "retrieval_events"
    SET "fallbackReasonCode" = NULL
    WHERE "fallbackReasonCode" = 'WEAK_EVIDENCE'
      AND "evidenceStrength" IS NOT NULL
      AND "evidenceStrength" >= 0.35;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'RetrievalEvent'
  ) THEN
    UPDATE "RetrievalEvent"
    SET "evidenceStrength" = LEAST("evidenceStrength" * 100.0 / 6.0, 1.0)
    WHERE "evidenceStrength" IS NOT NULL
      AND "evidenceStrength" > 0
      AND "evidenceStrength" < 0.5;

    UPDATE "RetrievalEvent"
    SET "fallbackReasonCode" = NULL
    WHERE "fallbackReasonCode" = 'WEAK_EVIDENCE'
      AND "evidenceStrength" IS NOT NULL
      AND "evidenceStrength" >= 0.35;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'query_telemetry'
  ) THEN
    UPDATE "query_telemetry"
    SET "topRelevanceScore" = LEAST("topRelevanceScore" * 100.0 / 6.0, 1.0)
    WHERE "topRelevanceScore" IS NOT NULL
      AND "topRelevanceScore" > 0
      AND "topRelevanceScore" < 0.5;

    UPDATE "query_telemetry"
    SET "retrievalAdequate" = TRUE
    WHERE "topRelevanceScore" IS NOT NULL
      AND "topRelevanceScore" >= 0.5;

    UPDATE "query_telemetry"
    SET "hadFallback" = FALSE
    WHERE "hadFallback" = TRUE
      AND "topRelevanceScore" IS NOT NULL
      AND "topRelevanceScore" >= 0.5;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'QueryTelemetry'
  ) THEN
    UPDATE "QueryTelemetry"
    SET "topRelevanceScore" = LEAST("topRelevanceScore" * 100.0 / 6.0, 1.0)
    WHERE "topRelevanceScore" IS NOT NULL
      AND "topRelevanceScore" > 0
      AND "topRelevanceScore" < 0.5;

    UPDATE "QueryTelemetry"
    SET "retrievalAdequate" = TRUE
    WHERE "topRelevanceScore" IS NOT NULL
      AND "topRelevanceScore" >= 0.5;

    UPDATE "QueryTelemetry"
    SET "hadFallback" = FALSE
    WHERE "hadFallback" = TRUE
      AND "topRelevanceScore" IS NOT NULL
      AND "topRelevanceScore" >= 0.5;
  END IF;
END $$;
