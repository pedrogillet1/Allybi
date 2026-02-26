import prisma from "../../platform/db/prismaClient";
import { getContainer } from "../../bootstrap/container";
import { getBankLoaderInstance } from "../core/banks/bankLoader.service";

export interface ReadinessChecks {
  server: boolean;
  db: boolean;
  banks: boolean;
  retrievalStorage: boolean;
  retrievalEngineLoaded: boolean;
  answerEngineLoaded: boolean;
}

export interface ReadinessResult {
  checks: ReadinessChecks;
  details: Record<string, unknown>;
}

export async function collectReadiness(): Promise<ReadinessResult> {
  const checks: ReadinessChecks = {
    server: true,
    db: false,
    banks: false,
    retrievalStorage: false,
    retrievalEngineLoaded: false,
    answerEngineLoaded: false,
  };
  const details: Record<string, unknown> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = true;
  } catch (error: unknown) {
    details.dbError = error instanceof Error ? error.message : "db_ping_failed";
  }

  try {
    const bankLoader = getBankLoaderInstance();
    const bankHealth = bankLoader.health();
    checks.banks = Boolean(bankHealth.ok);
    details.bankHealth = bankHealth;
  } catch (error: unknown) {
    details.bankError =
      error instanceof Error ? error.message : "bank_health_failed";
  }

  try {
    await prisma.$queryRaw`SELECT 1 FROM "document_chunks" LIMIT 1`;
    checks.retrievalStorage = true;
  } catch (error: unknown) {
    details.retrievalStorageError =
      error instanceof Error ? error.message : "retrieval_storage_unavailable";
  }

  try {
    const container = getContainer();
    checks.retrievalEngineLoaded = Boolean(container.getRetrievalEngine());
    checks.answerEngineLoaded = Boolean(container.getAnswerEngine());
  } catch (error: unknown) {
    details.containerError =
      error instanceof Error ? error.message : "container_not_ready";
  }

  return { checks, details };
}

export async function collectRetrievalHealth(): Promise<{
  ok: boolean;
  bankHealth?: unknown;
  retrievalStorage?: "ok";
  bankError?: string;
  retrievalStorageError?: string;
}> {
  const payload: {
    ok: boolean;
    bankHealth?: unknown;
    retrievalStorage?: "ok";
    bankError?: string;
    retrievalStorageError?: string;
  } = {
    ok: true,
  };

  try {
    const bankLoader = getBankLoaderInstance();
    payload.bankHealth = bankLoader.health();
  } catch (error: unknown) {
    payload.ok = false;
    payload.bankError =
      error instanceof Error ? error.message : "bank_health_failed";
  }

  try {
    await prisma.$queryRaw`SELECT COUNT(*)::int AS total FROM "document_chunks"`;
    payload.retrievalStorage = "ok";
  } catch (error: unknown) {
    payload.ok = false;
    payload.retrievalStorageError =
      error instanceof Error ? error.message : "retrieval_storage_unavailable";
  }

  return payload;
}
