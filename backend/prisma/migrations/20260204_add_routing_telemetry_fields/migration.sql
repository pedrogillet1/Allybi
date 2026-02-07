-- Add routing and telemetry fields to query_telemetry table

-- Routing & Answer Mode
ALTER TABLE "query_telemetry" ADD COLUMN IF NOT EXISTS "answerMode" TEXT;
ALTER TABLE "query_telemetry" ADD COLUMN IF NOT EXISTS "outputShape" TEXT;
ALTER TABLE "query_telemetry" ADD COLUMN IF NOT EXISTS "operatorFamily" TEXT;

-- User Format Requests
ALTER TABLE "query_telemetry" ADD COLUMN IF NOT EXISTS "userAskedForBullets" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "query_telemetry" ADD COLUMN IF NOT EXISTS "userAskedForTable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "query_telemetry" ADD COLUMN IF NOT EXISTS "userAskedForQuote" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "query_telemetry" ADD COLUMN IF NOT EXISTS "userAskedForSteps" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "query_telemetry" ADD COLUMN IF NOT EXISTS "userAskedForShort" BOOLEAN NOT NULL DEFAULT false;

-- Navigation Triggers
ALTER TABLE "query_telemetry" ADD COLUMN IF NOT EXISTS "navOpenRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "query_telemetry" ADD COLUMN IF NOT EXISTS "navWhereRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "query_telemetry" ADD COLUMN IF NOT EXISTS "navDiscoverRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "query_telemetry" ADD COLUMN IF NOT EXISTS "preferredNavType" TEXT;
