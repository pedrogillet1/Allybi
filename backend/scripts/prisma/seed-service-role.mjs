#!/usr/bin/env node

import { Client } from "pg";

async function main() {
  const dbUrl = String(process.env.DATABASE_URL || "").trim();
  if (!dbUrl) {
    throw new Error("[prisma:rls:seed-service-role] DATABASE_URL is required.");
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(
      `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_roles WHERE rolname = 'service_role'
        ) THEN
          CREATE ROLE service_role;
        END IF;
      END $$;
      `,
    );
    console.log("[prisma:rls:seed-service-role] service_role ensured");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
