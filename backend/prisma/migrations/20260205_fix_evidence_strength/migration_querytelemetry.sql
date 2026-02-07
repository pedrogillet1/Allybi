-- Fix QueryTelemetry table evidence scores
-- Root cause: scores were divided by 100, but keyword retrieval returns integer counts

-- Fix topRelevanceScore
UPDATE "QueryTelemetry"
SET "topRelevanceScore" = LEAST("topRelevanceScore" * 100.0 / 6.0, 1.0)
WHERE "topRelevanceScore" IS NOT NULL
  AND "topRelevanceScore" > 0
  AND "topRelevanceScore" < 0.5;

-- Update retrievalAdequate flag based on corrected scores
UPDATE "QueryTelemetry"
SET "retrievalAdequate" = TRUE
WHERE "topRelevanceScore" IS NOT NULL
  AND "topRelevanceScore" >= 0.5;

-- Clear hadFallback for queries that now have adequate evidence
UPDATE "QueryTelemetry"
SET "hadFallback" = FALSE
WHERE "hadFallback" = TRUE
  AND "topRelevanceScore" IS NOT NULL
  AND "topRelevanceScore" >= 0.5;
