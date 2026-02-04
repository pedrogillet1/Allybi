-- Enable Row Level Security on all public tables
-- This blocks direct PostgREST API access while allowing service_role (backend) full access

-- List of all tables that need RLS enabled
DO $$
DECLARE
    tables TEXT[] := ARRAY[
        'users',
        'document_categories',
        'categories',
        'two_factor_auth',
        'tags',
        'verification_codes',
        'reminders',
        'document_summaries',
        'chat_documents',
        'message_attachments',
        'notifications',
        'user_preferences',
        'document_embeddings',
        'document_entities',
        'document_keywords',
        'terminology_maps',
        'cloud_integrations',
        'audit_logs',
        'api_usage',
        'chat_contexts',
        'document_shares',
        'api_keys',
        'user_roles',
        'permissions',
        'role_hierarchy',
        'generated_documents',
        'document_templates',
        'roles',
        'analysis_sessions',
        'session_documents',
        'action_history',
        'excel_sheets',
        'sessions',
        'document_tags',
        'role_permissions',
        'document_edit_history',
        'excel_cells',
        'document_metadata',
        'pending_users',
        'folders',
        'conversations',
        'messages',
        'documents',
        'knowledge_entries',
        'folder_summaries',
        'slides',
        'trend_patterns',
        'user_preferences_memory',
        'conversation_topics',
        'user_insights',
        'conversation_summaries',
        'interaction_metadata',
        'memories',
        'user_profiles',
        'concept_relationships',
        'methodology_knowledge',
        'causal_relationships',
        'comparative_data',
        'practical_recommendations',
        'domain_knowledge',
        'presentations',
        'cultural_profiles',
        'trusted_sources'
    ];
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY tables
    LOOP
        -- Check if table exists before enabling RLS
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            -- Enable RLS
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

            -- Drop existing policies if any (to avoid conflicts)
            EXECUTE format('DROP POLICY IF EXISTS "service_role_all" ON public.%I', tbl);

            -- Create policy allowing service_role full access
            -- This is the role used by your backend when connecting with the service_role key
            EXECUTE format('CREATE POLICY "service_role_all" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl);

            RAISE NOTICE 'Enabled RLS on table: %', tbl;
        ELSE
            RAISE NOTICE 'Table % does not exist, skipping', tbl;
        END IF;
    END LOOP;
END $$;

-- Force RLS for table owners as well (extra security)
-- This ensures even the table owner respects RLS policies
DO $$
DECLARE
    tables TEXT[] := ARRAY[
        'users',
        'document_categories',
        'categories',
        'two_factor_auth',
        'tags',
        'verification_codes',
        'reminders',
        'document_summaries',
        'chat_documents',
        'message_attachments',
        'notifications',
        'user_preferences',
        'document_embeddings',
        'document_entities',
        'document_keywords',
        'terminology_maps',
        'cloud_integrations',
        'audit_logs',
        'api_usage',
        'chat_contexts',
        'document_shares',
        'api_keys',
        'user_roles',
        'permissions',
        'role_hierarchy',
        'generated_documents',
        'document_templates',
        'roles',
        'analysis_sessions',
        'session_documents',
        'action_history',
        'excel_sheets',
        'sessions',
        'document_tags',
        'role_permissions',
        'document_edit_history',
        'excel_cells',
        'document_metadata',
        'pending_users',
        'folders',
        'conversations',
        'messages',
        'documents',
        'knowledge_entries',
        'folder_summaries',
        'slides',
        'trend_patterns',
        'user_preferences_memory',
        'conversation_topics',
        'user_insights',
        'conversation_summaries',
        'interaction_metadata',
        'memories',
        'user_profiles',
        'concept_relationships',
        'methodology_knowledge',
        'causal_relationships',
        'comparative_data',
        'practical_recommendations',
        'domain_knowledge',
        'presentations',
        'cultural_profiles',
        'trusted_sources'
    ];
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY tables
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
        END IF;
    END LOOP;
END $$;
