-- Migration: Drop 42 unused tables
-- These tables were defined in the Prisma schema but never used in the codebase
-- Run this in Supabase SQL Editor or via prisma migrate

-- Drop tables with foreign key dependencies first (order matters)

-- Tables that depend on other unused tables
DROP TABLE IF EXISTS "excel_cells" CASCADE;
DROP TABLE IF EXISTS "slides" CASCADE;
DROP TABLE IF EXISTS "concept_relationships" CASCADE;
DROP TABLE IF EXISTS "document_tags" CASCADE;
DROP TABLE IF EXISTS "document_categories" CASCADE;

-- Main unused tables (alphabetical order)
DROP TABLE IF EXISTS "action_history" CASCADE;
DROP TABLE IF EXISTS "analytics_daily_stats" CASCADE;
DROP TABLE IF EXISTS "analytics_errors" CASCADE;
DROP TABLE IF EXISTS "analytics_events" CASCADE;
DROP TABLE IF EXISTS "api_keys" CASCADE;
DROP TABLE IF EXISTS "api_usage" CASCADE;
DROP TABLE IF EXISTS "categories" CASCADE;
DROP TABLE IF EXISTS "causal_relationships" CASCADE;
DROP TABLE IF EXISTS "chat_contexts" CASCADE;
DROP TABLE IF EXISTS "comparative_data" CASCADE;
DROP TABLE IF EXISTS "conversation_chunks" CASCADE;
DROP TABLE IF EXISTS "conversation_context_states" CASCADE;
DROP TABLE IF EXISTS "conversation_indexes" CASCADE;
DROP TABLE IF EXISTS "conversation_states" CASCADE;
DROP TABLE IF EXISTS "conversation_topics" CASCADE;
DROP TABLE IF EXISTS "deletion_jobs" CASCADE;
DROP TABLE IF EXISTS "document_entities" CASCADE;
DROP TABLE IF EXISTS "document_keywords" CASCADE;
DROP TABLE IF EXISTS "document_shares" CASCADE;
DROP TABLE IF EXISTS "document_summaries" CASCADE;
DROP TABLE IF EXISTS "domain_knowledge" CASCADE;
DROP TABLE IF EXISTS "excel_sheets" CASCADE;
DROP TABLE IF EXISTS "feature_usage_logs" CASCADE;
DROP TABLE IF EXISTS "generated_documents" CASCADE;
DROP TABLE IF EXISTS "intent_classification_logs" CASCADE;
DROP TABLE IF EXISTS "memories" CASCADE;
DROP TABLE IF EXISTS "methodology_knowledge" CASCADE;
DROP TABLE IF EXISTS "presentations" CASCADE;
DROP TABLE IF EXISTS "reminders" CASCADE;
DROP TABLE IF EXISTS "retention_metrics" CASCADE;
DROP TABLE IF EXISTS "system_health_snapshots" CASCADE;
DROP TABLE IF EXISTS "tags" CASCADE;
DROP TABLE IF EXISTS "terminology_maps" CASCADE;
DROP TABLE IF EXISTS "user_preferences" CASCADE;
DROP TABLE IF EXISTS "user_preferences_memory" CASCADE;
DROP TABLE IF EXISTS "user_profiles" CASCADE;
DROP TABLE IF EXISTS "user_sessions" CASCADE;

-- Verify dropped tables count
DO $$
DECLARE
    remaining INT;
BEGIN
    SELECT COUNT(*) INTO remaining
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN (
        'excel_cells', 'slides', 'concept_relationships', 'document_tags',
        'document_categories', 'action_history', 'analytics_daily_stats',
        'analytics_errors', 'analytics_events', 'api_keys', 'api_usage',
        'categories', 'causal_relationships', 'chat_contexts', 'comparative_data',
        'conversation_chunks', 'conversation_context_states', 'conversation_indexes',
        'conversation_states', 'conversation_topics', 'deletion_jobs',
        'document_entities', 'document_keywords', 'document_shares',
        'document_summaries', 'domain_knowledge', 'excel_sheets',
        'feature_usage_logs', 'generated_documents', 'intent_classification_logs',
        'memories', 'methodology_knowledge', 'presentations', 'reminders',
        'retention_metrics', 'system_health_snapshots', 'tags', 'terminology_maps',
        'user_preferences', 'user_preferences_memory', 'user_profiles', 'user_sessions'
    );

    IF remaining = 0 THEN
        RAISE NOTICE 'SUCCESS: All 42 unused tables have been dropped';
    ELSE
        RAISE WARNING 'WARNING: % tables still exist', remaining;
    END IF;
END $$;
