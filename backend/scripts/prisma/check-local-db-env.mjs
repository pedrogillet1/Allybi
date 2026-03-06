#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { config as loadDotenv } from "dotenv";
import replayCore from "./replay-core.cjs";

const { isPlaceholderDatabaseUrl } = replayCore;

function assertDbUrl(name, value) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new Error(
      `[prisma:env:check] ${name} is required. Configure backend/.env using backend/.env.example.`,
    );
  }
  if (isPlaceholderDatabaseUrl(raw)) {
    throw new Error(
      `[prisma:env:check] ${name} uses placeholder values. Set real local Postgres credentials in backend/.env (HOST/USER/PASSWORD/DB_NAME are placeholders).`,
    );
  }
}

export function main(env = process.env) {
  loadDotenv({ path: join(process.cwd(), ".env"), quiet: true });
  loadDotenv({ path: join(process.cwd(), ".env.local"), override: true, quiet: true });

  assertDbUrl("DATABASE_URL", env.DATABASE_URL);

  const direct = String(env.DIRECT_DATABASE_URL || "").trim();
  if (direct) assertDbUrl("DIRECT_DATABASE_URL", direct);

  console.log("[prisma:env:check] OK");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
