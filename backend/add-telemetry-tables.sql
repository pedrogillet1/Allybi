-- Add telemetry tables for monitoring dashboard

CREATE TABLE IF NOT EXISTS "intent_classification_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT,
  "conversationId" TEXT,
  "messageId" TEXT,
  "userQuery" TEXT NOT NULL,
  "detectedIntent" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "fallbackTriggered" BOOLEAN NOT NULL DEFAULT false,
  "multiIntent" BOOLEAN NOT NULL DEFAULT false,
  "language" TEXT NOT NULL DEFAULT 'en',
  "responseTime" INTEGER,
  "wasCorrect" BOOLEAN,
  "userFeedback" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "intent_classification_logs_detectedIntent_idx" ON "intent_classification_logs"("detectedIntent");
CREATE INDEX IF NOT EXISTS "intent_classification_logs_userId_idx" ON "intent_classification_logs"("userId");
CREATE INDEX IF NOT EXISTS "intent_classification_logs_createdAt_idx" ON "intent_classification_logs"("createdAt");
CREATE INDEX IF NOT EXISTS "intent_classification_logs_fallbackTriggered_idx" ON "intent_classification_logs"("fallbackTriggered");

CREATE TABLE IF NOT EXISTS "error_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT,
  "service" TEXT NOT NULL,
  "errorType" TEXT NOT NULL,
  "errorMessage" TEXT NOT NULL,
  "errorStack" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'error',
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "resolvedAt" TIMESTAMP(3),
  "conversationId" TEXT,
  "requestPath" TEXT,
  "httpMethod" TEXT,
  "statusCode" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "error_logs_service_idx" ON "error_logs"("service");
CREATE INDEX IF NOT EXISTS "error_logs_errorType_idx" ON "error_logs"("errorType");
CREATE INDEX IF NOT EXISTS "error_logs_severity_idx" ON "error_logs"("severity");
CREATE INDEX IF NOT EXISTS "error_logs_resolved_idx" ON "error_logs"("resolved");
CREATE INDEX IF NOT EXISTS "error_logs_createdAt_idx" ON "error_logs"("createdAt");

CREATE TABLE IF NOT EXISTS "system_health_metrics" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "metricType" TEXT NOT NULL,
  "metricName" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "unit" TEXT,
  "status" TEXT NOT NULL DEFAULT 'healthy',
  "threshold" DOUBLE PRECISION,
  "metadata" JSONB,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "system_health_metrics_metricType_idx" ON "system_health_metrics"("metricType");
CREATE INDEX IF NOT EXISTS "system_health_metrics_metricName_idx" ON "system_health_metrics"("metricName");
CREATE INDEX IF NOT EXISTS "system_health_metrics_recordedAt_idx" ON "system_health_metrics"("recordedAt");
