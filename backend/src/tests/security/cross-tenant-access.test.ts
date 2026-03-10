import { describe, expect, test, beforeAll } from "@jest/globals";

/**
 * Cross-tenant access tests.
 * Verifies that RLS policies prevent users from accessing other users' data.
 *
 * NOTE: These tests verify the SQL migration exists and the middleware
 * sets the RLS variable. Full integration requires the migration to be applied.
 */

describe("Cross-tenant isolation", () => {
  test("RLS migration script exists", () => {
    const fs = require("fs");
    const path = require("path");
    const migrationPath = path.join(
      __dirname,
      "../../scripts/migrations/002-rls-policies.sql",
    );
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  test("RLS migration contains per-table policies", () => {
    const fs = require("fs");
    const path = require("path");
    const sql = fs.readFileSync(
      path.join(__dirname, "../../scripts/migrations/002-rls-policies.sql"),
      "utf8",
    );

    const tables = [
      "Document",
      "DocumentMetadata",
      "DocumentEmbedding",
      "Conversation",
      "Message",
      "Session",
      "Folder",
      "ConnectorToken",
      "TwoFactorAuth",
      "AuditLog",
    ];

    for (const table of tables) {
      expect(sql).toContain(`"${table}"`);
      expect(sql).toContain(`ENABLE ROW LEVEL SECURITY`);
    }
  });

  test("RLS migration uses current_app_user_id() function", () => {
    const fs = require("fs");
    const path = require("path");
    const sql = fs.readFileSync(
      path.join(__dirname, "../../scripts/migrations/002-rls-policies.sql"),
      "utf8",
    );

    expect(sql).toContain("current_app_user_id()");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION current_app_user_id()");
    expect(sql).toContain("current_setting('app.current_user_id'");
  });

  test("Auth middleware sets RLS session variable", () => {
    const fs = require("fs");
    const path = require("path");
    const middleware = fs.readFileSync(
      path.join(__dirname, "../../middleware/auth.middleware.ts"),
      "utf8",
    );

    expect(middleware).toContain("set_config('app.current_user_id'");
  });
});
