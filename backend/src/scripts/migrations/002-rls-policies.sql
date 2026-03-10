-- ============================================================
-- Row-Level Security (RLS) Policies for Tenant Isolation
-- ============================================================
-- This migration adds real per-user RLS policies replacing the
-- permissive USING(true) policies that were previously in place.
--
-- Prerequisites: Application must call
--   SET LOCAL app.current_user_id = '{userId}'
-- at the start of each transaction.
-- ============================================================

-- Helper function: get current app user from session variable
CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS TEXT AS $$
  SELECT COALESCE(current_setting('app.current_user_id', true), '');
$$ LANGUAGE sql STABLE;

-- ============================================================
-- Drop existing permissive policies first
-- ============================================================

-- Documents
DROP POLICY IF EXISTS user_isolation_documents ON "Document";
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation_documents ON "Document"
  FOR ALL USING ("userId" = current_app_user_id());

-- DocumentMetadata
DROP POLICY IF EXISTS user_isolation_doc_metadata ON "DocumentMetadata";
ALTER TABLE "DocumentMetadata" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation_doc_metadata ON "DocumentMetadata"
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM "Document" d WHERE d.id = "DocumentMetadata"."documentId" AND d."userId" = current_app_user_id()
    )
  );

-- DocumentEmbedding
DROP POLICY IF EXISTS user_isolation_doc_embedding ON "DocumentEmbedding";
ALTER TABLE "DocumentEmbedding" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation_doc_embedding ON "DocumentEmbedding"
  FOR ALL USING ("userId" = current_app_user_id());

-- Conversation
DROP POLICY IF EXISTS user_isolation_conversations ON "Conversation";
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation_conversations ON "Conversation"
  FOR ALL USING ("userId" = current_app_user_id());

-- Message (via conversation)
DROP POLICY IF EXISTS user_isolation_messages ON "Message";
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation_messages ON "Message"
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM "Conversation" c WHERE c.id = "Message"."conversationId" AND c."userId" = current_app_user_id()
    )
  );

-- Session
DROP POLICY IF EXISTS user_isolation_sessions ON "Session";
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation_sessions ON "Session"
  FOR ALL USING ("userId" = current_app_user_id());

-- Folder
DROP POLICY IF EXISTS user_isolation_folders ON "Folder";
ALTER TABLE "Folder" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation_folders ON "Folder"
  FOR ALL USING ("userId" = current_app_user_id());

-- ConnectorToken
DROP POLICY IF EXISTS user_isolation_connector_tokens ON "ConnectorToken";
ALTER TABLE "ConnectorToken" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation_connector_tokens ON "ConnectorToken"
  FOR ALL USING ("userId" = current_app_user_id());

-- TwoFactorAuth
DROP POLICY IF EXISTS user_isolation_2fa ON "TwoFactorAuth";
ALTER TABLE "TwoFactorAuth" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation_2fa ON "TwoFactorAuth"
  FOR ALL USING ("userId" = current_app_user_id());

-- AuditLog
DROP POLICY IF EXISTS user_isolation_audit ON "AuditLog";
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation_audit ON "AuditLog"
  FOR ALL USING ("userId" = current_app_user_id());

-- ============================================================
-- BYPASS for service role (backend server)
-- The application's DB user needs BYPASSRLS or a superuser role
-- to run background jobs (workers, migrations, cron).
--
-- For Cloud SQL:
--   ALTER ROLE "koda-backend" WITH BYPASSRLS;
-- ============================================================

-- Grant the application role RLS bypass for background operations
-- (uncomment and adjust role name for your environment)
-- ALTER ROLE "koda_app" BYPASSRLS;

-- ============================================================
-- Additional tables with userId — Phase 2
-- ============================================================

-- ConnectorIdentityMap
DROP POLICY IF EXISTS user_isolation_connector_identity ON "ConnectorIdentityMap";
ALTER TABLE "ConnectorIdentityMap" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation_connector_identity ON "ConnectorIdentityMap"
  FOR ALL USING ("userId" = current_app_user_id());

-- AnalyticsUserActivity
DROP POLICY IF EXISTS user_isolation_analytics ON "AnalyticsUserActivity";
ALTER TABLE "AnalyticsUserActivity" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation_analytics ON "AnalyticsUserActivity"
  FOR ALL USING ("userId" = current_app_user_id());

-- ConversationFeedback
DROP POLICY IF EXISTS user_isolation_feedback ON "ConversationFeedback";
ALTER TABLE "ConversationFeedback" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation_feedback ON "ConversationFeedback"
  FOR ALL USING ("userId" = current_app_user_id());

-- RAGQueryMetrics
DROP POLICY IF EXISTS user_isolation_rag_metrics ON "RAGQueryMetrics";
ALTER TABLE "RAGQueryMetrics" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation_rag_metrics ON "RAGQueryMetrics"
  FOR ALL USING ("userId" = current_app_user_id());

-- VerificationCode
DROP POLICY IF EXISTS user_isolation_verification_code ON "VerificationCode";
ALTER TABLE "VerificationCode" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation_verification_code ON "VerificationCode"
  FOR ALL USING ("userId" = current_app_user_id());
