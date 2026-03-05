import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

describe("Prisma migration integrity guards", () => {
  const root = process.cwd();

  test("legacy evidence-strength migration is existence-guarded", () => {
    const sql = readFileSync(
      join(
        root,
        "prisma",
        "migrations",
        "20260205_fix_evidence_strength",
        "migration.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("DO $$");
    expect(sql).toContain("table_name = 'retrieval_events'");
    expect(sql).toContain("table_name = 'query_telemetry'");
    expect(sql).toContain("table_name = 'RetrievalEvent'");
    expect(sql).toContain("table_name = 'QueryTelemetry'");
  });

  test("RLS migrations are gated on service_role presence", () => {
    const allTablesSql = readFileSync(
      join(
        root,
        "prisma",
        "migrations",
        "20260204_enable_rls_all_tables",
        "migration.sql",
      ),
      "utf8",
    );
    const remainingSql = readFileSync(
      join(
        root,
        "prisma",
        "migrations",
        "20260204_enable_rls_remaining",
        "migration.sql",
      ),
      "utf8",
    );

    expect(allTablesSql).toContain("pg_roles WHERE rolname = 'service_role'");
    expect(remainingSql).toContain("pg_roles WHERE rolname = 'service_role'");
  });

  test("dangerous force-sync command requires explicit env gate", () => {
    const script = readFileSync(
      join(root, "scripts", "prisma", "guarded-force-schema-sync.mjs"),
      "utf8",
    );

    expect(script).toContain("ALLOW_DANGEROUS_PRISMA");
    expect(script).toContain("process.exit(1)");
  });

  test("CI workflows ban prisma db push --accept-data-loss", () => {
    const uploadVisibilityWorkflow = readFileSync(
      join(root, "..", ".github", "workflows", "upload-visibility-guard.yml"),
      "utf8",
    );
    const policyEntrypoint = readFileSync(
      join(root, "scripts", "prisma", "assert-no-ci-db-push.mjs"),
      "utf8",
    );
    const policyCore = readFileSync(
      join(root, "scripts", "prisma", "policy-core.cjs"),
      "utf8",
    );

    expect(policyEntrypoint).toContain("policy-core.cjs");
    expect(policyCore).toContain("prisma db push");
    expect(policyCore).toContain("--accept-data-loss");
    expect(uploadVisibilityWorkflow).not.toContain("db push --accept-data-loss");
  });

  test("CI policy script forbids broad db push variants", () => {
    const script = readFileSync(
      join(root, "scripts", "prisma", "assert-no-ci-db-push.mjs"),
      "utf8",
    );
    const policyCore = readFileSync(
      join(root, "scripts", "prisma", "policy-core.cjs"),
      "utf8",
    );
    expect(script).toContain("policy-core.cjs");
    expect(policyCore).toContain("forbiddenPatterns");
    expect(policyCore).toContain("runScriptPatterns");
    expect(policyCore).toContain("prisma db push");
    expect(policyCore).toContain("--accept-data-loss");
  });

  test("replay check fails fast on placeholder database URLs", () => {
    const script = readFileSync(
      join(root, "scripts", "prisma", "replay-check.mjs"),
      "utf8",
    );
    const replayCore = readFileSync(
      join(root, "scripts", "prisma", "replay-core.cjs"),
      "utf8",
    );

    expect(script).toContain("replay-core.cjs");
    expect(replayCore).toContain("invalid DATABASE_URL");
    expect(replayCore).toContain("HOST");
    expect(script).toContain("assertReplayEnv");
    expect(script).toContain("--check-only");
  });

  test("document visibility filter is centralized across folder/document services", () => {
    const filterSource = readFileSync(
      join(
        root,
        "src",
        "services",
        "documents",
        "documentVisibilityFilter.ts",
      ),
      "utf8",
    );
    const folderService = readFileSync(
      join(root, "src", "services", "prismaFolder.service.ts"),
      "utf8",
    );
    const documentService = readFileSync(
      join(root, "src", "services", "prismaDocument.service.ts"),
      "utf8",
    );

    expect(filterSource).toContain("VISIBLE_DOCUMENT_FILTER");
    expect(filterSource).toContain('status: { not: "skipped" }');
    expect(filterSource).toContain("parentVersionId: null");
    expect(filterSource).toContain('/connectors/');
    expect(folderService).toContain("documentVisibilityFilter");
    expect(documentService).toContain("documentVisibilityFilter");
  });

  test("presigned folder hierarchy creation uses folder service (no direct folder create)", () => {
    const presignedRoute = readFileSync(
      join(root, "src", "entrypoints", "http", "routes", "presigned-urls.routes.ts"),
      "utf8",
    );

    expect(presignedRoute).toContain("createFolderHierarchy(");
    expect(presignedRoute).toContain("folderService");
    expect(presignedRoute).not.toContain("prisma.folder.create(");
  });

  test("upload routes do not directly mutate prisma.document", () => {
    const presignedRoute = readFileSync(
      join(root, "src", "entrypoints", "http", "routes", "presigned-urls.routes.ts"),
      "utf8",
    );
    const multipartRoute = readFileSync(
      join(root, "src", "entrypoints", "http", "routes", "multipart-upload.routes.ts"),
      "utf8",
    );

    expect(presignedRoute).not.toContain("prisma.document.create(");
    expect(presignedRoute).not.toContain("prisma.document.createMany(");
    expect(presignedRoute).not.toContain("prisma.document.update(");
    expect(presignedRoute).not.toContain("prisma.document.updateMany(");

    expect(multipartRoute).not.toContain("prisma.document.create(");
    expect(multipartRoute).not.toContain("prisma.document.createMany(");
    expect(multipartRoute).not.toContain("prisma.document.update(");
    expect(multipartRoute).not.toContain("prisma.document.updateMany(");
  });

  test("documents route uses validated payload + write service for document mutations", () => {
    const documentsRoute = readFileSync(
      join(root, "src", "entrypoints", "http", "routes", "documents.routes.ts"),
      "utf8",
    );

    expect(documentsRoute).toContain("validate(documentPatchSchema)");
    expect(documentsRoute).toContain(
      "documentUploadWriteService.updateDocumentFieldsForUser(",
    );
    expect(documentsRoute).toContain("documentUploadWriteService.resetForReprocess(");
    expect(documentsRoute).toContain(
      "documentUploadWriteService.upsertDocumentMetadata(",
    );
    expect(documentsRoute).toContain(
      "documentUploadWriteService.updateDocumentMetadata(",
    );
    expect(documentsRoute).not.toContain("prisma.document.create(");
    expect(documentsRoute).not.toContain("prisma.document.createMany(");
    expect(documentsRoute).not.toContain("prisma.document.update(");
    expect(documentsRoute).not.toContain("prisma.document.updateMany(");
    expect(documentsRoute).not.toContain("prisma.documentMetadata.upsert(");
    expect(documentsRoute).not.toContain("prisma.documentMetadata.update(");
  });

  test("folder ZIP export uses canonical visibility filter", () => {
    const folderRoute = readFileSync(
      join(root, "src", "entrypoints", "http", "routes", "folders.routes.ts"),
      "utf8",
    );
    expect(folderRoute).toContain("VISIBLE_DOCUMENT_FILTER");
  });

  test("append-only chunk history migration adds active/version columns", () => {
    const sql = readFileSync(
      join(
        root,
        "prisma",
        "migrations",
        "20260305233000_append_only_chunk_history",
        "migration.sql",
      ),
      "utf8",
    );

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "indexing_operation_id"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "is_active"');
    expect(sql).toContain(
      'DROP INDEX IF EXISTS "document_chunks_documentId_chunkIndex_key"',
    );
    expect(sql).toContain(
      "document_chunks_documentId_indexing_operation_id_chunkIndex_key",
    );
  });

  test("prisma client alias remains a pass-through to config/database", () => {
    const prismaAlias = readFileSync(
      join(root, "src", "platform", "db", "prismaClient.ts"),
      "utf8",
    );

    expect(prismaAlias).toContain('import prisma from "../../config/database"');
    expect(prismaAlias).toContain("export default prisma");
  });

  test("prisma governance runbook documents historical empty migration artifact", () => {
    const runbook = readFileSync(
      join(root, "docs", "runtime", "prisma-governance-runbook.md"),
      "utf8",
    );

    expect(runbook).toContain("20251006005348_add_cloud_integrations");
    expect(runbook).toContain("20251006005424_add_cloud_integrations");
    expect(runbook).toContain("prisma.documentMetadata.upsert");
  });

  test("post-baseline migrations do not include sqlite-only tokens", () => {
    const migrationsRoot = join(root, "prisma", "migrations");
    const baselineTimestamp = "20260112102917";
    const sqliteOnlyPattern = /\bPRAGMA\b|\bDATETIME\b/;
    const offenders: string[] = [];
    const scannedPostBaseline: string[] = [];

    function normalizeMigrationTimestamp(entry: string): string | null {
      const match = /^(\d+)_/.exec(entry);
      if (!match) return null;
      const raw = match[1];
      if (!/^\d+$/.test(raw)) return null;
      if (raw.length >= 14) return raw.slice(0, 14);
      if (raw.length === 8) return `${raw}000000`;
      if (raw.length > 8) return raw.padEnd(14, "0");
      return null;
    }

    for (const entry of readdirSync(migrationsRoot)) {
      const timestamp = normalizeMigrationTimestamp(entry);
      if (!timestamp) continue;
      if (timestamp < baselineTimestamp) continue;

      const migrationPath = join(migrationsRoot, entry, "migration.sql");
      try {
        scannedPostBaseline.push(entry);
        const sql = readFileSync(migrationPath, "utf8");
        if (sqliteOnlyPattern.test(sql)) offenders.push(migrationPath);
      } catch {
        // Ignore folders without migration.sql
      }
    }

    expect(scannedPostBaseline).toEqual(
      expect.arrayContaining([
        "20260204_add_routing_telemetry_fields",
        "20260205_fix_evidence_strength",
      ]),
    );
    expect(offenders).toEqual([]);
  });

  test("http route files do not import config/database directly", () => {
    const routesRoot = join(root, "src", "entrypoints", "http", "routes");
    const queue: string[] = [routesRoot];
    const offenders: string[] = [];

    while (queue.length > 0) {
      const current = queue.pop() as string;
      for (const name of readdirSync(current)) {
        const full = join(current, name);
        if (statSync(full).isDirectory()) {
          queue.push(full);
          continue;
        }
        if (!name.endsWith(".ts")) continue;
        const source = readFileSync(full, "utf8");
        if (source.includes("config/database")) offenders.push(full);
      }
    }

    expect(offenders).toEqual([]);
  });
});
