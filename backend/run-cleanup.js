const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runCleanup() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected!\n');

    // Part 1: Drop unused tables
    console.log('=== PART 1: Dropping 42 unused tables ===\n');

    const tablesToDrop = [
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
    ];

    let droppedCount = 0;
    for (const table of tablesToDrop) {
      try {
        await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
        console.log(`  Dropped: ${table}`);
        droppedCount++;
      } catch (err) {
        console.log(`  Skip: ${table} (${err.message})`);
      }
    }
    console.log(`\nDropped ${droppedCount} tables\n`);

    // Part 2: Enable RLS on remaining tables
    console.log('=== PART 2: Enabling RLS on remaining tables ===\n');

    const tablesResult = await client.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `);

    for (const row of tablesResult.rows) {
      const table = row.tablename;
      try {
        // Enable and force RLS
        await client.query(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY`);
        await client.query(`ALTER TABLE public."${table}" FORCE ROW LEVEL SECURITY`);

        // Drop existing policies
        await client.query(`DROP POLICY IF EXISTS "service_role_all" ON public."${table}"`);
        await client.query(`DROP POLICY IF EXISTS "deny_anon" ON public."${table}"`);
        await client.query(`DROP POLICY IF EXISTS "deny_authenticated" ON public."${table}"`);

        // Create new policies
        await client.query(`CREATE POLICY "service_role_all" ON public."${table}" FOR ALL TO service_role USING (true) WITH CHECK (true)`);
        await client.query(`CREATE POLICY "deny_anon" ON public."${table}" FOR ALL TO anon USING (false) WITH CHECK (false)`);
        await client.query(`CREATE POLICY "deny_authenticated" ON public."${table}" FOR ALL TO authenticated USING (false) WITH CHECK (false)`);

        console.log(`  RLS enabled: ${table}`);
      } catch (err) {
        console.log(`  Error on ${table}: ${err.message}`);
      }
    }

    // Part 3: Verify
    console.log('\n=== PART 3: Verification ===\n');

    const verifyResult = await client.query(`
      SELECT tablename, rowsecurity as rls_enabled
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    console.log('Remaining tables with RLS status:');
    let rlsEnabled = 0;
    for (const row of verifyResult.rows) {
      const status = row.rls_enabled ? '✓' : '✗';
      console.log(`  ${status} ${row.tablename}`);
      if (row.rls_enabled) rlsEnabled++;
    }

    console.log(`\nTotal: ${verifyResult.rows.length} tables, ${rlsEnabled} with RLS enabled`);

    // Count policies
    const policyCount = await client.query(`
      SELECT COUNT(*) as count FROM pg_policies WHERE schemaname = 'public'
    `);
    console.log(`Total policies created: ${policyCount.rows[0].count}`);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
    console.log('\nDone!');
  }
}

runCleanup();
