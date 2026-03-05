-- Compensating migration for duplicate telemetry scaling logic.
--
-- Historical sequence:
-- 1) 20260205_fix_evidence_strength applied score scaling for low values.
-- 2) 20260305113000_fix_telemetry_table_name_drift repeated the same scaling.
--
-- We cannot safely reconstruct all values that may have been clamped to 1.0 by
-- the second pass, but we can deterministically reverse the subset that remains
-- below 0.5 after the duplicated pass.
--
-- Guardrails:
-- - only run when BOTH historical migrations are marked as applied.
-- - only touch rows in (0, 0.5), which are reversible without ambiguity.

DO $$
DECLARE
  has_first_repair BOOLEAN := FALSE;
  has_second_repair BOOLEAN := FALSE;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM "_prisma_migrations"
    WHERE migration_name = '20260205_fix_evidence_strength'
      AND finished_at IS NOT NULL
  )
  INTO has_first_repair;

  SELECT EXISTS (
    SELECT 1
    FROM "_prisma_migrations"
    WHERE migration_name = '20260305113000_fix_telemetry_table_name_drift'
      AND finished_at IS NOT NULL
  )
  INTO has_second_repair;

  IF NOT (has_first_repair AND has_second_repair) THEN
    RAISE NOTICE 'Skipping compensation: required historical migrations are not both applied.';
    RETURN;
  END IF;

  -- Canonical mapped table
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'retrieval_events'
  ) THEN
    UPDATE "retrieval_events"
    SET "evidenceStrength" = ("evidenceStrength" * 6.0 / 100.0)
    WHERE "evidenceStrength" IS NOT NULL
      AND "evidenceStrength" > 0
      AND "evidenceStrength" < 0.5;
  END IF;

  -- Legacy compatibility table (if present)
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'RetrievalEvent'
  ) THEN
    UPDATE "RetrievalEvent"
    SET "evidenceStrength" = ("evidenceStrength" * 6.0 / 100.0)
    WHERE "evidenceStrength" IS NOT NULL
      AND "evidenceStrength" > 0
      AND "evidenceStrength" < 0.5;
  END IF;

  -- Canonical mapped table
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'query_telemetry'
  ) THEN
    UPDATE "query_telemetry"
    SET "topRelevanceScore" = ("topRelevanceScore" * 6.0 / 100.0)
    WHERE "topRelevanceScore" IS NOT NULL
      AND "topRelevanceScore" > 0
      AND "topRelevanceScore" < 0.5;
  END IF;

  -- Legacy compatibility table (if present)
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'QueryTelemetry'
  ) THEN
    UPDATE "QueryTelemetry"
    SET "topRelevanceScore" = ("topRelevanceScore" * 6.0 / 100.0)
    WHERE "topRelevanceScore" IS NOT NULL
      AND "topRelevanceScore" > 0
      AND "topRelevanceScore" < 0.5;
  END IF;
END $$;
