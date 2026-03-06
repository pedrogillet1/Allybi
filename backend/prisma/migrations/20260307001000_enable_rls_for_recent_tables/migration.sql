-- Ensure RLS/policy coverage for recently added tables not included in prior RLS blanket migrations.

DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'bank_usage_events',
    'connector_identity_maps',
    'connector_tokens',
    'document_links',
    'query_entities',
    'query_keywords',
    'social_snapshots',
    'trace_spans',
    'user_acquisitions'
  ];
  tbl TEXT;
  has_service_role BOOLEAN := FALSE;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
  INTO has_service_role;

  IF NOT has_service_role THEN
    RAISE NOTICE 'Role service_role not found; skipping RLS enablement in this migration.';
    RETURN;
  END IF;

  FOREACH tbl IN ARRAY tables
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "service_role_all" ON public.%I', tbl);
      EXECUTE format('CREATE POLICY "service_role_all" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
    ELSE
      RAISE NOTICE 'Table % does not exist, skipping', tbl;
    END IF;
  END LOOP;
END $$;
