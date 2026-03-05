#!/usr/bin/env node

import { Client } from "pg";
import verifyRlsCore from "./verify-rls-core.cjs";

const DEFAULT_TABLES = [
  "users",
  "documents",
  "document_chunks",
  "document_metadata",
  "conversations",
  "messages",
  "query_telemetry",
  "retrieval_events",
  "token_usage",
  "ingestion_events",
];

const { resolveProfile, resolveRequireServiceRole } = verifyRlsCore;

function resolveTargetTables() {
  const raw = String(process.env.PRISMA_RLS_TABLES || "").trim();
  if (!raw) return [...DEFAULT_TABLES];
  return raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

async function main() {
  const dbUrl = String(process.env.DATABASE_URL || "").trim();
  if (!dbUrl) {
    throw new Error("[prisma:rls:verify] DATABASE_URL is required.");
  }

  const profile = resolveProfile();
  const requireServiceRole = resolveRequireServiceRole(profile);

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const roleRes = await client.query(
      "SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'service_role') AS present",
    );
    const hasServiceRole = Boolean(roleRes.rows?.[0]?.present);

    if (!hasServiceRole) {
      if (requireServiceRole) {
        throw new Error(
          `[prisma:rls:verify] service_role is required but missing (profile=${profile}).`,
        );
      }
      console.log(
        `[prisma:rls:verify] service_role not present; profile=${profile} allows soft verification.`,
      );
      return;
    }

    const requestedTables = resolveTargetTables();
    const tablesRes = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    const existing = new Set(
      (tablesRes.rows || []).map((row) => String(row.tablename || "")),
    );
    const targets = requestedTables.filter((table) => existing.has(table));
    if (!targets.length) {
      console.log(
        "[prisma:rls:verify] none of the configured target tables exist; nothing to verify.",
      );
      return;
    }

    const tableRes = await client.query(
      `
      SELECT c.relname AS table_name,
             c.relrowsecurity AS rls_enabled,
             c.relforcerowsecurity AS rls_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = ANY($1::text[])
      `,
      [targets],
    );
    const tableRows = new Map(
      (tableRes.rows || []).map((row) => [String(row.table_name), row]),
    );

    const policyRes = await client.query(
      `
      SELECT tablename AS table_name, policyname, roles
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = ANY($1::text[])
      `,
      [targets],
    );
    const policyRows = new Map();
    for (const row of policyRes.rows || []) {
      const tableName = String(row.table_name || "");
      const list = policyRows.get(tableName) || [];
      list.push(row);
      policyRows.set(tableName, list);
    }

    const failures = [];
    for (const table of targets) {
      const state = tableRows.get(table);
      if (!state) {
        failures.push(`${table}: metadata_not_found`);
        continue;
      }
      if (!state.rls_enabled) failures.push(`${table}: rls_not_enabled`);
      if (!state.rls_forced) failures.push(`${table}: rls_not_forced`);

      const tablePolicies = policyRows.get(table) || [];
      const hasServiceRoleAll = tablePolicies.some((policy) => {
        if (String(policy.policyname || "") !== "service_role_all") return false;
        const rolesText = String(policy.roles || "");
        return rolesText.includes("service_role");
      });
      if (!hasServiceRoleAll) {
        failures.push(`${table}: service_role_all_missing`);
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `[prisma:rls:verify] failed checks:\n - ${failures.join("\n - ")}`,
      );
    }

    console.log(
      `[prisma:rls:verify] OK (${targets.length} tables, profile=${profile}, requireServiceRole=${String(requireServiceRole)})`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
