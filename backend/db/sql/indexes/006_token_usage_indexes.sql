-- file: db/sql/indexes/006_token_usage_indexes.sql
-- Indexes for token_usage table to support admin dashboard queries
-- Use CONCURRENTLY to avoid locking in production

-- Primary time-based index for range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_usage_created_at
  ON token_usage ("createdAt" DESC);

-- User lookup with time range
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_usage_user_created
  ON token_usage ("userId", "createdAt" DESC)
  WHERE "userId" IS NOT NULL;

-- Provider filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_usage_provider
  ON token_usage (provider, "createdAt" DESC);

-- Model filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_usage_model
  ON token_usage (model, "createdAt" DESC);

-- Provider + Model composite for cost breakdown
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_usage_provider_model
  ON token_usage (provider, model, "createdAt" DESC);

-- Request type analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_usage_request_type
  ON token_usage ("requestType", "createdAt" DESC);

-- Success filtering for cost calculations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_usage_success
  ON token_usage (success, "createdAt" DESC);

-- Conversation lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_usage_conversation
  ON token_usage ("conversationId")
  WHERE "conversationId" IS NOT NULL;

-- Cache analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_usage_cache
  ON token_usage ("wasCached", "cacheHit")
  WHERE "wasCached" = true OR "cacheHit" = true;

-- Partial index for successful calls (cost calculations)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_usage_success_cost
  ON token_usage ("createdAt" DESC, provider, model, "totalTokens", "totalCost")
  WHERE success = true;

-- endfile
