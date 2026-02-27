ALTER TABLE "query_telemetry"
ADD COLUMN IF NOT EXISTS "wasProviderTruncated" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "query_telemetry"
ADD COLUMN IF NOT EXISTS "truncationDetectorVersion" TEXT;

ALTER TABLE "query_telemetry"
ADD COLUMN IF NOT EXISTS "truncationReason" TEXT;

ALTER TABLE "query_telemetry"
ADD COLUMN IF NOT EXISTS "providerTruncationReason" TEXT;
