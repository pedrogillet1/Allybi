-- Enable RLS on remaining tables discovered after initial migration
DO $$
DECLARE
    tables TEXT[] := ARRAY[
        'admin_audit_logs',
        'admin_sessions',
        'admins',
        'analytics_daily_stats',
        'analytics_errors',
        'analytics_events',
        'analytics_system_health',
        'analytics_user_activity',
        'api_performance_logs',
        'conversation_chunks',
        'conversation_context_states',
        'conversation_feedback',
        'conversation_indexes',
        'conversation_metrics',
        'conversation_states',
        'daily_analytics_aggregates',
        'deletion_jobs',
        'document_chunks',
        'document_processing_metrics',
        'error_logs',
        'feature_usage_logs',
        'hourly_metrics',
        'ingestion_events',
        'intent_classification_logs',
        'model_calls',
        'query_telemetry',
        'rag_query_metrics',
        'retention_metrics',
        'retrieval_events',
        'system_health_metrics',
        'system_health_snapshots',
        'token_usage',
        'usage_events',
        'user_lifetime_value',
        'user_sessions'
    ];
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY tables
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
            EXECUTE format('DROP POLICY IF EXISTS "service_role_all" ON public.%I', tbl);
            EXECUTE format('CREATE POLICY "service_role_all" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl);
            EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
            RAISE NOTICE 'Enabled RLS on table: %', tbl;
        ELSE
            RAISE NOTICE 'Table % does not exist, skipping', tbl;
        END IF;
    END LOOP;
END $$;
