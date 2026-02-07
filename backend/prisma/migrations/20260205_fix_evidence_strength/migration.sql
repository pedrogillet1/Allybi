-- Migration: Fix evidenceStrength values that were incorrectly calculated
--
-- Root cause: The original code did `evidenceStrength = topScore / 100`
-- assuming scores were 0-100, but keyword-based retrieval returns integer
-- counts (3, 8, 50, etc). This made all scores appear as "weak evidence".
--
-- Fix: Reverse the /100, then apply correct formula (score / 6, capped at 1.0)
-- Example: stored 0.08 → original score 8 → new value = min(8/6, 1) = 1.0

-- Fix RetrievalEvent table
UPDATE "RetrievalEvent"
SET "evidenceStrength" = LEAST("evidenceStrength" * 100.0 / 6.0, 1.0)
WHERE "evidenceStrength" IS NOT NULL
  AND "evidenceStrength" > 0
  AND "evidenceStrength" < 0.5;

-- Also update fallbackReasonCode: if evidence is now strong, clear WEAK_EVIDENCE
UPDATE "RetrievalEvent"
SET "fallbackReasonCode" = NULL
WHERE "fallbackReasonCode" = 'WEAK_EVIDENCE'
  AND "evidenceStrength" IS NOT NULL
  AND "evidenceStrength" >= 0.35;

-- Fix QueryTelemetry table (if it has topRelevanceScore)
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
