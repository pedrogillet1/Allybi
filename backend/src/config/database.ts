/**
 * Database Configuration V1
 *
 * Imports config/env FIRST to guarantee .env.local overrides are loaded
 * before PrismaClient reads DATABASE_URL.
 */

import { config } from "./env";
import { PrismaClient } from "@prisma/client";

const dbUrl = config.DATABASE_URL;

if (process.env.NODE_ENV === "production") {
  if (
    !dbUrl?.includes("sslmode=require") &&
    !dbUrl?.includes("sslmode=verify")
  ) {
    console.error(
      "[SECURITY] Production DATABASE_URL must include sslmode=require or sslmode=verify-full",
    );
  }
} else {
  const host = dbUrl?.match(/@([^:/]+)/)?.[1] || "unknown";
  console.log(`[Database] Prisma connecting to: ${host}`);
}

const nodeEnv = String(process.env.NODE_ENV || "").toLowerCase();

const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
  log:
    nodeEnv === "test"
      ? []
      : nodeEnv === "development"
        ? ["error", "warn"]
        : ["error"],
});

export default prisma;
