/**
 * Prisma Adapter
 * Safe model access with graceful degradation for missing models
 */

import type { PrismaClient } from "@prisma/client";

type PrismaModel = {
  findMany: (...args: unknown[]) => Promise<unknown[]>;
  findFirst: (...args: unknown[]) => Promise<unknown>;
  findUnique: (...args: unknown[]) => Promise<unknown>;
  count: (...args: unknown[]) => Promise<number>;
  aggregate: (...args: unknown[]) => Promise<unknown>;
  groupBy: (...args: unknown[]) => Promise<unknown[]>;
  create?: (...args: unknown[]) => Promise<unknown>;
  createMany?: (...args: unknown[]) => Promise<unknown>;
};

// Known model names (camelCase as used in Prisma client)
const MODEL_NAMES = [
  "modelCall",
  "usageEvent",
  "retrievalEvent",
  "ingestionEvent",
  "queryTelemetry",
  "user",
  "document",
  "conversation",
  "message",
  "tokenUsage",
  "errorLog",
  "auditLog",
  "session",
  "analyticsUserActivity",
  "dailyAnalyticsAggregate",
  "hourlyMetrics",
  "analyticsSystemHealth",
  "documentProcessingMetrics",
  "aPIPerformanceLog",
  "adminAuditLog",
] as const;

type ModelName = (typeof MODEL_NAMES)[number];

/**
 * Check if a model exists on the Prisma client
 */
export function supportsModel(prisma: PrismaClient, name: string): boolean {
  try {
    const model = (prisma as unknown as Record<string, unknown>)[name];
    return model !== undefined && typeof model === "object" && model !== null;
  } catch {
    return false;
  }
}

/**
 * Get a model from Prisma client, returns null if not found
 */
export function getModel(
  prisma: PrismaClient,
  name: string,
): PrismaModel | null {
  try {
    const model = (prisma as unknown as Record<string, unknown>)[name] as
      | PrismaModel
      | undefined;
    if (model && typeof model.findMany === "function") {
      return model;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Execute a query with graceful degradation
 * Returns empty array if model doesn't exist
 */
export async function safeQuery<T>(
  prisma: PrismaClient,
  modelName: string,
  operation: "findMany" | "groupBy",
  args: Record<string, unknown>,
): Promise<T[]> {
  const model = getModel(prisma, modelName);
  if (!model) return [];

  try {
    const result = await (
      model[operation] as (args: Record<string, unknown>) => Promise<T[]>
    )(args);
    return result;
  } catch (error) {
    console.error(`[PrismaAdapter] Error in ${modelName}.${operation}:`, error);
    return [];
  }
}

/**
 * Execute count with graceful degradation
 */
export async function safeCount(
  prisma: PrismaClient,
  modelName: string,
  args?: Record<string, unknown>,
): Promise<number> {
  const model = getModel(prisma, modelName);
  if (!model) return 0;

  try {
    const result = await model.count(args || {});
    return result as number;
  } catch (error) {
    console.error(`[PrismaAdapter] Error in ${modelName}.count:`, error);
    return 0;
  }
}

/**
 * Execute aggregate with graceful degradation
 */
export async function safeAggregate<T>(
  prisma: PrismaClient,
  modelName: string,
  args: Record<string, unknown>,
): Promise<T | null> {
  const model = getModel(prisma, modelName);
  if (!model) return null;

  try {
    const result = await model.aggregate(args);
    return result as T;
  } catch (error) {
    console.error(`[PrismaAdapter] Error in ${modelName}.aggregate:`, error);
    return null;
  }
}

/**
 * Execute findFirst with graceful degradation
 */
export async function safeFindFirst<T>(
  prisma: PrismaClient,
  modelName: string,
  args: Record<string, unknown>,
): Promise<T | null> {
  const model = getModel(prisma, modelName);
  if (!model) return null;

  try {
    const result = await model.findFirst(args);
    return result as T | null;
  } catch (error) {
    console.error(`[PrismaAdapter] Error in ${modelName}.findFirst:`, error);
    return null;
  }
}

/**
 * Execute findUnique with graceful degradation
 */
export async function safeFindUnique<T>(
  prisma: PrismaClient,
  modelName: string,
  args: Record<string, unknown>,
): Promise<T | null> {
  const model = getModel(prisma, modelName);
  if (!model) return null;

  try {
    const result = await model.findUnique(args);
    return result as T | null;
  } catch (error) {
    console.error(`[PrismaAdapter] Error in ${modelName}.findUnique:`, error);
    return null;
  }
}

/**
 * Check which models are available
 */
export function getAvailableModels(prisma: PrismaClient): string[] {
  return MODEL_NAMES.filter((name) => supportsModel(prisma, name));
}
