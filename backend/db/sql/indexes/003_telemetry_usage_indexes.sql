-- file: db/sql/indexes/003_telemetry_usage_indexes.sql
-- Indexes for usage_events table to support admin dashboard queries
-- Use CONCURRENTLY to avoid locking in production

-- Primary time-based index for range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_events_at
  ON usage_events (at DESC);

-- User lookup with time range
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_events_user_at
  ON usage_events ("userId", at DESC);

-- Event type filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_events_type_at
  ON usage_events ("eventType", at DESC);

-- Document events
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_events_document_id
  ON usage_events ("documentId")
  WHERE "documentId" IS NOT NULL;

-- Folder events
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_events_folder_id
  ON usage_events ("folderId")
  WHERE "folderId" IS NOT NULL;

-- Conversation events
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_events_conversation_id
  ON usage_events ("conversationId")
  WHERE "conversationId" IS NOT NULL;

-- Device type for analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_events_device_type
  ON usage_events ("deviceType")
  WHERE "deviceType" IS NOT NULL;

-- Locale for geographic analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_events_locale
  ON usage_events (locale)
  WHERE locale IS NOT NULL;

-- Composite for user activity analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_events_user_type_at
  ON usage_events ("userId", "eventType", at DESC);

-- endfile
